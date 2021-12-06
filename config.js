function validatePresent(value, name, description)
{
    if (!value)
    {
        throw '"' + name + '" (' + description + ') is required';
    }
}

function validateStringArray(value, required, specialValue, name, description)
{
    if (required)
    {
        validatePresent(value, name, description);
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

function validateInt(value, required, min, max, name, description)
{
    if (required)
    {
        validatePresent(value, name, description);
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

function loadConfig(fileName)
{
    const config = require(fileName);

    validatePresent(config.token, 'token', 'the Slack OAuth token');
    validatePresent(config.token, 'appName', 'the Slack app/bot name');
    validateStringArray(config.rulePosts.channels, true, 'all',
                        'rulePosts.channels',
                        'the channels in which to post');
    validateInt(config.rulePosts.minMembers, true, 0, Infinity,
                'rulePosts.minMembers',
                'the minimum number of members required within a channel in order to post rules');
    validateInt(config.rulePosts.checkEverySecs, true, 1, 60 * 60 * 24 * 7 /* one week */,
                'rulePosts.checkEverySecs',
                'the frequency at which to check for the need to post a rule, in seconds');
    validateInt(config.rulePosts.postEveryMsgs, true, 1, 10000,
                'rulePosts.postEveryMsgs',
                'the number of messages after which to post a rule');
    validateStringArray(config.rulePosts.footers, false, null,
                        'rulePosts.footers',
                        'the footers to select from to add to posted rules');
    validateInt(config.listeningPort, true, 1, 65536,
                'listeningPort',
                'the HTTP listening port where requests from Slack are expected');

    return config;
}

function pickRandomFooter(config)
{
    const footers = config.rulePosts.footers;
    
    if (!footers) return '';

    return footers[Math.floor(Math.random() * footers.length)];
}

module.exports.loadConfig = loadConfig;
module.exports.pickRandomFooter = pickRandomFooter;