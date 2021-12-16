const CommandHandler = require('./command.js').CommandHandler;

const fs = require('fs');
const util = require('util');

const writeFile = (fileName, contents) => util.promisify(fs.writeFile)(fileName, contents, 'utf8');

const RULES_FILE = './rules.txt';

const USAGE = 'rules\n' +
              '    Update rules';

function getIndent(content)
{
    let indent = 0;

    while (indent < content.length && content[indent] == ' ')
    {
        ++indent;
    }

    return indent;
}

function parseRule(lines, indent)
{
    // Parses from text format
    //
    // <Root rule title>
    //   <Rule 1 title>
    //   <Rule 2 title>
    //     <Rule a title>
    //     <Rule b title>
    //
    // into an object structured like
    //
    // {
    //   title: '<Root rule title>',
    //   rules:
    //   [
    //     { title: '<Rule 1 title>' },
    //     {
    //       title: '<Rule 2 title>',
    //       rules:
    //       [
    //          { title: '<Rule a title>' },
    //          { title: '<Rule b title>' }
    //       ]
    //     }
    //   ]
    // }
    if (lines.length == 0) return null;

    const rule = { title: lines.shift().trim() };

    const rules = [];

    while (true)
    {
        const nextIndent = lines.length > 0 ? getIndent(lines[0]) : 0;
        if (nextIndent <= indent) break;

        const r = parseRule(lines, nextIndent);
        if (r == null) break;

        rules.push(r);
    }

    if (rules.length > 0)
    {
        rule.rules = rules;
    }

    return rule;
}

function parseRules(input)
{
    return parseRule(input.split('\n').filter(line => line.trim() !== ''), 0);
}

const contents = fs.readFileSync(RULES_FILE, 'utf8');
if (!contents)
{
    throw 'file reading error';
}

let rules = parseRules(contents);
if (!rules)
{
    throw 'at least one inital rule must be specified';
}

function getRules()
{
    return rules;
}

function pickRandomRule(rule)
{
    if (!rule.rules) return rule;

    if (rule.rules.every(r => !r.rules || r.rules.length < 3)) return rule;

    const index = Math.floor(Math.random() * rule.rules.length);
    return pickRandomRule(rule.rules[index]);
}

function formatRule(rule, indent = 0)
{
    let output = ' '.repeat(indent) + rule.title + '\n';

    if (rule.rules)
    {
        const section = rule.rules.every(r => r.title.length >= 2 && r.title[1] == '.');
        if (!section)
        {
            output += '\n';
        }

        rule.rules.forEach((r, index, array) => {
            output += formatRule(r, indent + 2);

            if (!section && index < array.length - 1)
            {
                output += '\n';
            }
        });
    }

    return output;
}

const RULES_BLOCK = 'rules-block';
const RULES_ELEMENT = 'rules-element';

class RulesHandler extends CommandHandler
{
    constructor(client)
    {
        super('rules', USAGE);

        this.client = client;
    }

    async handle(args, triggerId)
    {
        if (args.length !== 0) return USAGE;

        this.client.views.open({
            trigger_id: triggerId,
            view: {
                type: 'modal',
                title: {
                    type: 'plain_text',
                    text: 'Update Rules'
                },
                submit: {
                    type: 'plain_text',
                    text: 'Update'
                },
                blocks: [
                    {
                        type: 'input',
                        block_id: RULES_BLOCK,
                        element: {
                            type: 'plain_text_input',
                            action_id: RULES_ELEMENT,
                            placeholder: {
                                type: 'plain_text',
                                text: 'Root rule\n  Rule 1\n  Rule 2\n    Rule a\n    Rule b'
                            },
                            initial_value: rules ? formatRule(rules) : '',
                            multiline: true,
                            min_length: 1
                        },
                        label: {
                            type: 'plain_text',
                            text: 'Rules'
                        }
                    }
                ]
            }
        })

        return 'Opening dialog to edit rules...';
    }

    async update(values)
    {
        const value = values[RULES_BLOCK][RULES_ELEMENT].value;
        if (!value)
        {
            throw 'Expected rules value missing';
        }

        const newRules = parseRules(value);
        if (!newRules)
        {
            throw 'At least one rule is required';
        }

        await writeFile(RULES_FILE, value);

        rules = newRules;
    }
}

module.exports.RULES_FILE = RULES_FILE;
module.exports.getRules = getRules;
module.exports.pickRandomRule = pickRandomRule;
module.exports.formatRule = formatRule;
module.exports.RulesHandler = RulesHandler;