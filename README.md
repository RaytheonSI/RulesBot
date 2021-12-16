# RulesBot

A Slack bot which reminds users about rules.

When installed to a workspace the bot periodically checks the specified channels and posts an excerpt from the rules when enough other messages have been posted as configured. The posts also include a button to request the full set of rules (in a message to the requesting user only). The bot also responds with rules to direct communication from users. A slash command is provided to
allow workspace administrators to interactively view logs, change configuration, change rules, and
post rules to any channel.

## Slack Configuration

After logging in to Slack, visit https://api.slack.com/apps

1. Click the `Create New App` button
2. Select `From scratch`
3. Enter an `App Name` (note for later), select what workspace to place the app in, and click `Create App`

Customize app persona as desired under `Display Information`

Select `Interactivity & Shortcuts` from the menu under `Features`

1. Turn the `Interactivity` switch on
2. Enter the address to RulesBot in the `Request URL` field with a **/actions** suffix (e.g. https://myhost:4443/actions)
3. Click `Save Changes`

Select `Slash Commands` from the menu under `Features`

1. Click the `Create New Command` button
2. Enter the following values and click `Save`
    - `Command`: /rulesbot
    - `Request URL`: the address to RulesBot with a **/admin** suffix (e.g. https://myhost:4443/admin)
    - `Short Description`: Administrate RulesBot

Select `OAuth & Permissions` from the menu under `Features`

1. Add the following `Bot Token Scopes` under `Scopes`
    - channels:history
    - channels:join
    - channels:read
    - chat:write
    - groups:history
    - groups:read
    - im:history
    - im:read
    - mpim:history
    - mpim:read
    - users:read
2. Click `Install to Workspace` under `OAuth Tokens for Your Workspace`
3. Click `Allow`
4. Note the new `Bot User OAuth Token` under `OAuth Tokens for Your Workspace`

Select `Event Subscriptions` from the menu under `Features`

1. Turn the `Enable Events` switch on
2. Enter the address to RulesBot in the `Request URL` field with an **/events** suffix (e.g. https://myhost:4443/events); Note that RulesBot must already be running at the `Request URL` for this step to succeed
3. Expand `Subscribe to bot events`, click `Add Bot User Event`, and select `app_mention`

## Installation

Ensure you have **NPM** present on your system and install the module dependencies by running the following command:

```bash
npm install
```

## Configuration

Create a **config.json** file containing an object with the following fields:

Name                     | Type                     | Required | Description
----                     | ----                     | -------- | -----------
token                    | string                   | yes      | the `Bot User OAuth Token` from Slack
appName                  | string                   | yes      | the `App Name` from Slack
rulePosts.channels       | string or array (string) | yes      | either *all* or an array of channel names to post to
rulePosts.minMembers     | integer                  | yes      | the minimum number users that must be a member of a specified channel to post to
rulePosts.checkEverySecs | integer                  | yes      | the number of seconds between checking specified channels for the need to post
rulePosts.postEveryMsgs  | integer                  | yes      | the number of messages without a rule post before another rule post
rulePosts.footers        | array (string)           | no       | an array of quips to randomly select from and add the the bottom of posts
listeningPort            | integer                  | yes      | the port on which to listen for HTTPS requests
keyPath                  | string                   | yes      | the path to the TLS key
certPath                 | string                   | yes      | the path to the TLS certificate

The following is an example config:

```json
{
    "token": "xoxb-MyBotUserOAuthTokenFromSlack",
    "appName": "MyAppNameFromSlack",
    "rulePosts": {
        "channels": [ "general", "random" ],
        "minMembers": 3,
        "checkEverySecs": 120,
        "postEveryMsgs": 100,
        "footers": [
            "With great power comes great responsibility",
            "HULK SMASH!"
        ]
    },
    "listeningPort": 4443,
    "keyPath": "/path/to/key.pem",
    "certPath": "path/to/cert.pem"
}
```

Create a **rules.txt** file containing rules structured with indentation; the following is a simple example:

```text
Root rule
    Rule 1
    Rule 2
        Rule a
        Rule b
```

## Running

Ensure you have **Node.js v8.10.0** or greater installed on your system and run the following command:

```bash
./rulesbot.sh start
```

The process runs detached from the terminal in the background. The background process `pid` is saved to **rulesbot.pid**. Standard out and standard error output are redirected to the log file **rulesbot.log**.

Stop a running instance by issuing the following command:

```bash
./rulesbot.sh stop
```

## Administrating

`/rulesbot` command usage:

```text
logs [count]
   Display the most recent logs
   count (optional) - a positive integer of the number of logs to display

config
   Display all config items
config get <name>
   Get a config item
   name - name of the config item
config set <name> <value>
   Set a config item
   name - name of the config item
   value - value to assign the config item; arrays should be specified in the form: [ item1; item2 ]

rules
   Update rules

post rule <channel>
   Post a randomly selected rule to a channel
   channel - the channel to post the rule to
post rules <channel>
   Post all rules to a channel
   channel - the channel to post the rules to
```
