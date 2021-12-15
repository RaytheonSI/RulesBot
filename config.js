const CommandHandler = require('./command.js').CommandHandler;

const fs = require('fs');
const util = require('util');

const writeFile = (fileName, contents) => util.promisify(fs.writeFile)(fileName, contents, 'utf8');

const CONFIG_FILE = './config.json';

const USAGE_ALL = 'config\n' +
                  '    Display all config items';
const USAGE_GET = 'config get <name>\n' +
                  '    Get a config item\n' +
                  '    name - name of the config item';
const USAGE_SET = 'config set <name> <value>\n' +
                  '    Set a config item\n' +
                  '    name - name of the config item\n' +
                  '    value - value to assign the config item; ' +
                  'arrays should be specified in the form: [ item1; item2 ]';

const NAME_DELIMITER = '.';
const STRING_ARRAY_DELIMITER = '; ';

function validatePresent(name, description, value)
{
    if (!value)
    {
        throw '"' + name + '" (' + description + ') is required';
    }
}

function validateStringArray(required, specialValue, name, description, value)
{
    if (required)
    {
        validatePresent(name, description, value);
    }
    else if (typeof value === 'undefined')
    {
        return;
    }

    if (value === specialValue) return;

    if (!Array.isArray(value))
    {
        let msg = '"' + name + '" must';
        if (specialValue)
        {
            msg += ' either be "' + specialValue + '" or ';
        }
        else
        {
            msg += ' be ';
        }
        msg += 'an array';
        throw msg;
    }

    value.forEach((s) => {
        if (typeof s !== 'string')
        {
            throw '"' + name +
                  '" should be an array of strings, but encountered non-string value "' +
                  s + '"';
        }
    });
}

function validateInt(required, min, max, name, description, value)
{
    if (required)
    {
        validatePresent(name, description, value);
    }
    else if (typeof value === 'undefined')
    {
        return;
    }

    if (!Number.isInteger(value))
    {
        throw '"' + name + '" must be an integer';
    }

    if (value < min || value > max)
    {
        throw '"' + name + '" must be in the range ' + min + ' - ' + max;
    }
}

const validations = {
    'token': validatePresent.bind(null, 'token', 'the Slack OAuth token'),
    'appName': validatePresent.bind(null, 'appName', 'the Slack app/bot name'),
    'rulePosts.channels': validateStringArray.bind(null,
                                                   true,
                                                   'all',
                                                   'rulePosts.channels',
                                                   'the channels in which to post'),
    'rulePosts.minMembers': validateInt.bind(null,
                                            true,
                                            0,
                                            Infinity,
                                            'rulePosts.minMembers',
                                            'the minimum number of members required within a ' +
                                            'channel in order to post rules'),
    'rulePosts.checkEverySecs': validateInt.bind(null,
                                                 true,
                                                 1, 60 * 60 * 24 * 7 /* one week */,
                                                 'rulePosts.checkEverySecs',
                                                 'the frequency at which to check for the need ' +
                                                 'to post a rule, in seconds'),
    'rulePosts.postEveryMsgs': validateInt.bind(null,
                                                true,
                                                1,
                                                10000,
                                                'rulePosts.postEveryMsgs',
                                                'the number of messages after which to post a ' +
                                                'rule'),
    'rulePosts.footers': validateStringArray.bind(null,
                                                  false,
                                                  null,
                                                  'rulePosts.footers',
                                                  'the footers to select from to add to posted ' +
                                                  'rules'),
    'listeningPort': validateInt.bind(null,
                                      true,
                                      1,
                                      65536,
                                      'listeningPort',
                                      'the HTTP listening port where requests from Slack are ' +
                                      'expected')
};

function validate(config)
{
    Object.entries(validations).forEach(([name, validate]) => {
        const parts = name.split(NAME_DELIMITER);
        let cfg = config;
        for (var i = 0; i < parts.length; ++i)
        {
            cfg = cfg[parts[i]];
            if (!cfg) break;
        }

        validate(cfg);
    });
}

const config = require(CONFIG_FILE);
validate(config);

function getConfig()
{
    return config;
}

function pickRandomFooter(config)
{
    const footers = config.rulePosts.footers;

    if (!footers) return '';

    return footers[Math.floor(Math.random() * footers.length)];
}

const changeListeners = {};

function registerChangeListener(name, listener)
{
    changeListeners[name] = listener;
}

function configValueToString(value)
{
    return Array.isArray(value) ? '[ ' + value.join(STRING_ARRAY_DELIMITER) + ' ]' : value;
}

function parseStringArray(value)
{
    return value.startsWith('[') && value.endsWith(']') ?
           value.slice(1, -1).split(';').map(v => v.trim()) :
           value;
}

const parsers = {
    'rulePosts.channels': parseStringArray,
    'rulePosts.minMembers': parseInt,
    'rulePosts.checkEverySecs': parseInt,
    'rulePosts.postEveryMsgs': parseInt,
    'rulePosts.footers': parseStringArray,
    'listeningPort': parseInt
};

class ConfigHandler extends CommandHandler
{
    constructor()
    {
        super('config', USAGE_ALL + '\n' + USAGE_GET + '\n' + USAGE_SET);
    }

    async handle(args)
    {
        if (args.length === 0)
        {
            const print = (cfg, prefix = '') => {
                return Object.entries(cfg).reduce((prev, cur) => {
                    const printItem = (item) => {
                        const [key, value] = item;

                        if (typeof value === 'object' && !Array.isArray(value))
                        {
                            return print(value, prefix + key + NAME_DELIMITER);
                        }

                        return item = prefix + key + ': ' + configValueToString(value) + '\n';
                    };

                        return (Array.isArray(prev) ? printItem(prev) : prev) + printItem(cur);
                    });
              };

            return print(config);
        }

        const cmd = args.shift();
        const name = args.shift();
        const badNameMessage = `Invalid config name specified: ${name}\n\n` +
                               (cmd === 'get' ? USAGE_GET : USAGE_SET);

        if (cmd === 'get')
        {
            if (!name) return USAGE_GET;

            const parts = name.split(NAME_DELIMITER);
            let cfg = config;
            for (var i = 0; i < parts.length; ++i)
            {
                cfg = cfg[parts[i]];

                const last = i === parts.length - 1;
                const obj = typeof cfg === 'object';
                if (!cfg || (!last && !obj) || (last && obj && !Array.isArray(cfg)))
                {
                    return badNameMessage;
                }
            }

            const value = configValueToString(cfg);
            return `${name} is ${value}`;
        }
        else if (cmd === 'set')
        {
            if (!name || args.length === 0) return USAGE_SET;

            const validate = validations[name];
            if (!validate) return badNameMessage;

            let value = args.join(' ');

            const parser = parsers[name];
            if (parser)
            {
                value = parser(value);
            }

            try
            {
                validate(value);
            }
            catch (err)
            {
                return err;
            }

            const parts = name.split(NAME_DELIMITER);
            const last = parts.pop();
            let cfg = config;
            for (var i = 0; i < parts.length; ++i)
            {
                const next = cfg[parts[i]];

                if (!next)
                {
                    cfg[parts[i]] = {};
                }

                cfg = cfg[parts[i]];
            }

            const lastValue = cfg[last];
            cfg[last] = value;

            await writeFile(CONFIG_FILE, JSON.stringify(config, null, 4));

            if (value != lastValue)
            {
                const listener = changeListeners[name];
                if (listener)
                {
                    listener(value);
                }
            }

            value = configValueToString(value);
            return `Set ${name} to ${value}`;

        }

        return `Invalid config sub-command: ${cmd}`
    }
}

module.exports.CONFIG_FILE = CONFIG_FILE;
module.exports.getConfig = getConfig;
module.exports.pickRandomFooter = pickRandomFooter;
module.exports.registerChangeListener = registerChangeListener;
module.exports.ConfigHandler = ConfigHandler;