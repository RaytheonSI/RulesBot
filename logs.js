const fs = require('fs');
const util = require('util');

const readFile = (fileName) => util.promisify(fs.readFile)(fileName, 'utf8');

const LOG_FILE_NAME = './rulesbot.log';
const USAGE = 'Usage: logs [count]\n' +
              '    Displays the most recent logs\n' +
              '    count - a positive integer for the number of logs to display';
const DEFAULT_LOG_COUNT = 10;

async function loadLogs(args)
{
    let logCount = DEFAULT_LOG_COUNT;

    if (args.length > 0)
    {
        if (args.length !== 1) return USAGE;

        logCount = parseInt(args[0]);
        if (!logCount || logCount < 0)
        {
            return USAGE;
        }
    }

    const logs = await readFile(LOG_FILE_NAME);
    
    return logs.split('\n')
               .slice(-(logCount + 1))
               .join('\n');
}

module.exports.loadLogs = loadLogs;