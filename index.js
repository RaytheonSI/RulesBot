const configUtil = require('./config.js');
const rulesUtil = require('./rules.js');

const axios = require('axios');
const bodyParser = require('body-parser');
const express = require('express');
const slackWebApi = require('@slack/web-api');
const winston = require('winston');

const headerBlock = {
    type: 'section',
    text: {
        type: 'mrkdwn',
        text: 'Here\'s an excerpt from the '
    }
};

const rulesBlock = {
    type: 'section',
    text: {
        type: 'mrkdwn',
        text: ''
    }
};

const DIVIDER_BLOCK = { type: 'divider' };

const footerBlock = {
    type: 'section',
    text: {
        type: 'mrkdwn',
        text: ''
    }
};

const VIEW_ALL_ACTION_ID = 'view-all-rules';

const VIEW_ALL_BUTTON_BLOCK = {
    type: 'actions',
    elements: [
        {
            type: 'button',
            text: {
                type: 'plain_text',
                text: 'View all rules'
            },
            action_id: VIEW_ALL_ACTION_ID
        }
    ]
};

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.splat(),
        winston.format.printf((info) => {
            if (typeof info.message === 'object')
            {
                info.message = JSON.stringify(info.message, null, 2);
            }

            return `${info.timestamp} ${info.level}: ${info.message}`;
        })
    ),
    transports: [
        new winston.transports.Console()
    ]
});

let config = null;

try
{
    config = configUtil.loadConfig('./config.json');
}
catch (err)
{
    logger.error('Failed to load config.json: %O', err);
    process.exit(1);
}

let rules = null;

try
{
    rules = rulesUtil.loadRules('./rules.txt');
    if (!rules)
    {
        throw 'At least one rule must be specified';
    }
}
catch (err)
{
    logger.error('Failed to load rules.txt: %O', err);
    process.exit(1);
}

headerBlock.text.text += '*' + rules.title + '*';

const client = new slackWebApi.WebClient(config.token);

async function lookupUserIdByName(name)
{
    // While the user list is supposed to be paginated,
    // in practice all users are returned
    const list = await client.users.list();
    logger.debug('Users: %O', list.members.map((user) => {
        return { id: user.id, name: user.name, real_name: user.real_name };
    }));
    const user = list.members.find(user => user.real_name === name);

    return user ? user.id : user;
}

async function lookupUserNameById(id)
{
    const info = await client.users.info({ user: id });
    logger.debug('User info: %O', info);
    return info.ok ? info.user.name : null;
}

async function lookupChannelNameById(id)
{
    const info = await client.conversations.info({ channel: id });
    logger.debug('Channel info: %O', info);
    return info.ok ? info.channel.name : null;
}

function constructRandomRuleMessage()
{
    const blocks = [];

    blocks.push(headerBlock);

    const rule = rulesUtil.pickRandomRule(rules);
    rulesBlock.text.text = rulesUtil.formatRule(rule);
    blocks.push(rulesBlock);

    blocks.push(DIVIDER_BLOCK);

    const footer = configUtil.pickRandomFooter(config);
    if (footer)
    {
        footerBlock.text.text = footer;

        blocks.push(footerBlock);
    }

    blocks.push(VIEW_ALL_BUTTON_BLOCK);

    return { rule: rule, text: rulesBlock.text.text, blocks: blocks };
}

function abbrevTitle(rule)
{
    const LOG_TITLE_LENGTH = 15;

    return rule.title.length <= LOG_TITLE_LENGTH ?
           rule.title :
           rule.title.substr(0, LOG_TITLE_LENGTH) + '...';
}

async function postToChannels(config, appUserId, rules)
{
    logger.verbose('Checking if channel(s) need rule post');

    try
    {
        let cursor = '';

        do
        {
            const list = await client.conversations.list({ cursor: cursor });

            list.channels.forEach(async (channel) => {
                // Skip channel if not in the specified list or doesn't contain enough members
                if (config.rulePosts.channels !== 'all' &&
                    !config.rulePosts.channels.includes(channel.name))
                {
                    logger.verbose(`Skipping unmatched channel "${channel.name}"`);
                    return;
                }
        
                if (channel.num_members < config.rulePosts.minMembers)
                {
                    logger.verbose(`Skipping channel "${channel.name}" with only ` +
                                   `${channel.num_members} members`);
                    return;
                }
        
                // Join the bot to the channel if not a member
                if (!channel.is_member)
                {
                    logger.info(`Joining ${channel.name}`);
                    const join = await client.conversations.join({ channel: channel.id });
                    if (!join.ok)
                    {
                        logger.warn(`Failed to join "${channel.name}": ${join.error}`);
                        return;
                    }
                }
        
                // Look up enough message history to deter if the bot needs to post again
                logger.verbose(`Loading last ${config.rulePosts.postEveryMsgs}`+
                               ` messages from "${channel.name}"`);
                const history =
                    await client.conversations.history({ channel: channel.id,
                                                         limit: config.rulePosts.postEveryMsgs });
                if (history.messages.some(message => message.user == appUserId &&
                                                     message.subtype !== 'channel_join'))
                {
                    logger.verbose('Found qualified rule message in history');
                    return;
                }
        
                // Select a random rule and post to the channel
                const message = constructRandomRuleMessage();
        
                client.chat.postMessage({
                    channel: channel.id,
                    text: message.text,
                    blocks: message.blocks
                });
        
                const title = abbrevTitle(message.rule);
                logger.info(`Posted rule "${title}" to channel "${channel.name}"`);
            });

            cursor = list.response_metadata.next_cursor;
        } while (cursor);
    }
    catch (err)
    {
        logger.warn('Failed to check channel(s): %O', err);
    }
}

(async () => {
    // Look up the user ID of the bot so we can determine how many 
    // messages ago it posted to each qualified channel
    let appUserId = null;

    try
    {
        appUserId = await lookupUserIdByName(config.appName);
        if (!appUserId)
        {
            throw `User "${config.appName}" not found`;
        }
    }
    catch (err)
    {
        logger.error('Could not lookup user ID for app: %O', err);
        process.exit(1);
    }


    logger.info(`The app user ID for "${config.appName}" is "${appUserId}"`);

    // Poll the qualified channels content and post a rule when there
    // hasn't been one for the specified number of messages
    const channels = Array.isArray(config.rulePosts.channels) ?
                     config.rulePosts.channels.join(', ') :
                     config.rulePosts.channels;
    logger.info(`Checking if rule posts needed on ${channels} channel(s) ` +
                `every ${config.rulePosts.checkEverySecs} seconds`);

    setInterval(postToChannels, config.rulePosts.checkEverySecs * 1000, config, appUserId, rules);
})();

// Set up handlers for Slack actions
const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// An endpoint to identify this service (not used by Slack)
app.get('/', (req, res) => {
    res.send('RulesBot');
});

// An endpoint to handle actions (e.g. when buttons on posts are clicked)
app.post('/', async (req, res) => {
    let responseUrl = '';
    let user = '';
    let channel = '';

    try
    {
        const payload = JSON.parse(req.body.payload);

        if (payload.type !== 'block_actions')
        {
            // Wrong type - ignore
            res.status(200).end();
            return;
        }

        if (!Array.isArray(payload.actions))
        {
            throw 'Payload did not contain an actions array';
        }

        if (!payload.actions.some(action => action.action_id === VIEW_ALL_ACTION_ID))
        {
            // Wrong action - ignore
            res.status(200).end();
            return;
        }

        if (!payload.response_url)
        {
            throw 'Payload did not contain a response URL';
        }

        responseUrl = payload.response_url;
        user = payload.user.name;
        channel = payload.channel.name;
    }
    catch (err)
    {
        res.status(400).end();

        logger.warn('Failed to parse Slack action payload: %O', err);
        return;
    }

    try
    {
        const response = await axios.post(responseUrl,
                                          {
                                              text: rulesUtil.formatRule(rules),
                                              replace_original: false,
                                              response_type: 'ephemeral'
                                          });
        if (response.status !== 200)
        {
            throw `Received status code ${response.status}`;
        }

        res.status(200).end();
    
        logger.info(`Posted ephemeral message containing all rules to "${user}" ` +
                    `in "${channel}"`);
    }
    catch (err)
    {
        res.status(500).end();

        logger.warn('Failed to send response to Slack action: %O', err);
        return;
    }
});

// An endpoint to handle events (e.g. users chatting with this bot)
app.post('/events', async (req, res) => {
    const payload = req.body;

    if (payload.type === 'url_verification')
    {
        res.status(200).send(payload.challenge);

        logger.info('Responded to URL verification challenge');
        return;
    }

    if (payload.type === 'event_callback')
    {
        const event = payload.event;

        if (event.type !== 'app_mention')
        {
            res.status(500).end();

            logger.warn(`Received unsupported event type ${event.type}`);
            return;
        }

        res.status(200).end();

        // Post a response based on the message content
        let message = null;

        if (event.text.includes('rules'))
        {
            message = {
                title: 'rules',
                text: rulesUtil.formatRule(rules)
            };
        }
        else if (event.text.includes('rule'))
        {
            const ruleMessage = constructRandomRuleMessage();
            const title = abbrevTitle(ruleMessage.rule);

            message = {
                title: `rule "${title}"`,
                text: ruleMessage.text,
                blocks: ruleMessage.blocks
            };
        }
        else
        {
            message = {
                title: 'hints',
                text: 'I didn\'t understand your message. ' +
                      'Try "Tell me a random rule" or "Tell me all rules".'
            };
        }

        try
        {
            client.chat.postMessage({
                channel: event.channel,
                text: message.text,
                blocks: message.blocks
            });
        }
        catch (err)
        {
            logger.error(`Failed to post message in response to "${event.text}"`);
            return;
        }

        let channel = '';
        try
        {
            channel = await lookupChannelNameById(event.channel) || event.channel;
        }
        catch (err)
        {
            channel = event.channel;
        }

        let user = '';
        try
        {
            user = await lookupUserNameById(event.user) || event.user;
        }
        catch (err)
        {
            user = event.user;
        }

        logger.info(`Posted ${message.title} to "${channel}" in response to ` +
                    `"${event.text}" from "${user}"`);
    }
    else
    {
        res.status(500).end();

        logger.warn(`Received unsupported payload type ${payload.type}`);
    }
});

app.listen(config.listeningPort, () => {
    logger.info(`Listening for request from Slack on port ${config.listeningPort}`);
});