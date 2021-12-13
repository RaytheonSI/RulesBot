const CommandHandler = require('./command.js').CommandHandler;

const fs = require('fs');
const util = require('util');

const readFile = (fileName) => util.promisify(fs.readFile)(fileName, 'utf8');

const LOG_FILE_NAME = './rulesbot.log';
const USAGE = 'logs [count]\n' +
              '    Displays the most recent logs\n' +
              '    count (optional) - a positive integer of the number of logs to display';
const DEFAULT_LOG_COUNT = 10;

class LogsHandler extends CommandHandler
{
    constructor()
    {
        super('logs', USAGE);
    }

    async handle(args)
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
                   .filter(line => line !== '')
                   .slice(-logCount)
                   .join('\n');
    }
}

module.exports.LogsHandler = LogsHandler;