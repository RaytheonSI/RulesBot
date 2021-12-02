const fs = require('fs');

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

function loadRules(fileName)
{
    const rulesText = fs.readFileSync(fileName, 'utf8');
    if (rulesText === null) return null;

    const lines = rulesText.split('\n').filter(line => line.trim() != '');
    return parseRule(lines, 0);
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

module.exports.loadRules = loadRules;
module.exports.pickRandomRule = pickRandomRule;
module.exports.formatRule = formatRule;