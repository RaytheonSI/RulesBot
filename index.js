const configUtil = require('./config.js');
const rulesUtil = require('./rules.js');

const slackWebApi = require('@slack/web-api');

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

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

let config = null;

try
{
    config = configUtil.loadConfig('./config.json');
}
catch (err)
{
    console.error('Failed to load config.json');
    console.error(err);
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
    console.error('Failed to load rules.txt');
    console.error(err);
    process.exit(1);
}

headerBlock.text.text += '*' + rules.title + '*';

const client = new slackWebApi.WebClient(config.token);

async function lookupUserId(userName)
{
    // While the user list is supposed to be paginated, 
    // in practice all users are returned
    const list = await client.users.list();
    const user = list.members.find(user => user.real_name === userName);

    return user ? user.id : user;
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

function logWithTimestamp(message)
{
    const now = new Date().toLocaleString();
    console.log(`${now}: ${message}`);
}
async function postToChannels(config, appUserId, rules)
{
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
                    return;
                }
        
                if (channel.num_members < config.rulePosts.minMembers)
                {
                    return;
                }
        
                // Join the bot to the channel if not a member
                if (!channel.is_member)
                {
                    logWithTimestamp(`Joining ${channel.name}`);
                    const join = await client.conversations.join({ channel: channel.id });
                    if (!join.ok)
                    {
                        console.warn(`Failed to join "${channel.name}": ${join.error}`);
                        return;
                    }
                }
        
                // Look up enough message history to deter if the bot needs to post again
                const history =
                    await client.conversations.history({ channel: channel.id,
                                                         limit: config.rulePosts.postEveryMsgs });
                if (history.messages.some(message => message.user == appUserId &&
                                                     message.subtype !== 'channel_join'))
                {
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
                logWithTimestamp(`Posted rule "${title}" to channel "${channel.name}"`);
            });

            cursor = list.response_metadata.next_cursor;
        } while (cursor);
    }
    catch (err)
    {
        console.warn('Failed while checking channel(s)');
        console.warn(err);
    }
}

(async () => {
    // Look up the user ID of the bot so we can determine how many 
    // messages ago it posted to each qualified channel
    const appUserId = await lookupUserId(config.appName);
    if (!appUserId)
    {
        console.error(`Could not find user ID for "${config.appName}"`);
        process.exit(1);
    }
    console.log(`The app user ID for "${config.appName}" is "${appUserId}"`);

    // Poll the qualified channels content and post a rule when there
    // hasn't been one for the specified number of messages
    const channels = Array.isArray(config.rulePosts.channels) ?
                    config.rulePosts.channels.join(', ') :
                    config.rulePosts.channels;
    console.log(`Checking if rule posts needed on ${channels} channel(s) ` +
                `every ${config.rulePosts.checkEverySecs} seconds`);

    setInterval(postToChannels, config.rulePosts.checkEverySecs * 1000, config, appUserId, rules);
})();

// Set up handlers for Slack actions
const app = express();

app.use(bodyParser.urlencoded({ extended: false }));

app.get('/', (req, res) => {
    res.send('RulesBot');
});

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
        console.warn('Failed to parse Slack action payload');
        console.warn(err);

        res.status(400).end();
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
    
        logWithTimestamp(`Posted ephemeral message containing all rules to "${user}" ` +
                         `in "${channel}"`);
    }
    catch (err)
    {
        console.warn('Failed to send response to Slack action');
        console.warn(err);

        res.status(500).end();
        return;
    }
});

app.post('/rule', (req, res) => {
    const message = constructRandomRuleMessage();
    
    res.status(200)
       .send({ response_type: 'in_channel', blocks: message.blocks });

    const title = abbrevTitle(message.rule);
    logWithTimestamp(`Posted rule "${title}" to "${req.body.channel_name}" in response to ` +
                     `the slash command from "${req.body.user_name}"`);
});

app.post('/rules', (req, res) => {
    res.status(200)
       .send({ response_type: 'in_channel', text: rulesUtil.formatRule(rules) });

    logWithTimestamp(`Posted rules to "${req.body.channel_name}" in response to the slash ` +
                    `command from "${req.body.user_name}"`);
});

app.listen(config.listeningPort, () => {
    console.log(`Listening for request from Slack on port ${config.listeningPort}`);
});