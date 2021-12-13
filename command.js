class CommandHandler
{
    constructor(name, usage)
    {
        this.name = name;
        this.usage = usage;
    }

    name()
    {
        return this.name;
    }

    usage()
    {
        return this.usage;
    }

    async handle(args)
    {
        throw 'CommanderHandler handle() must be overidden';
    }
}

class CommandHandlers
{
    constructor()
    {
        this.handlers = [];
    }

    add(handler)
    {
        this.handlers.push(handler);
    }

    find(name)
    {
        return this.handlers.find(handler => handler.name === name);
    }

    usage()
    {
        let usage = '';
        this.handlers.forEach(handler => usage += handler.usage + '\n\n');
        return usage;
    }
}

module.exports.CommandHandler = CommandHandler;
module.exports.CommandHandlers = CommandHandlers;