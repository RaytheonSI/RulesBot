#!/bin/bash

if [[ $# < 1 ]]; then
    echo ""
    echo "Usage: rulesbot.sh <command>"
    echo ""
    echo "Where <command> is one of the following:"
    echo "  start"
    echo "      Check dependencies then start RulesBot as a detached, background process"
    echo "  stop"
    echo "      Stop RulesBot"
    echo ""
    exit 0
fi

dir=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

command=$1

pidfile="$dir/rulesbot.pid"

if [[ $command == "start" ]]; then
    if [[ -e $pidfile ]]; then
        echo "It appears an instance is already running"
        echo "If not delete $pidfile and try again"
        exit 1
    fi

    if ! type node > /dev/null; then
        echo "Node.js is required to run RulesBot"
        exit 1
    fi

    version=$(node -v)
    version=${version#*v} # remove 'v' prefix
    version=(${version//./ }) # split version components
    if [[ ${version[0]} < 8 || ${version[1]} < 10 ]]; then
        echo "Node.js v8.10.0 or greater is required"
        exit 1
    fi

    if [[ ! -e $dir/node_modules ]]; then
        echo "Dependencies not detected; run 'npm install' to download modules"
        exit 1
    fi

    logfile="$dir/rulesbot.log"

    nohup node $dir/index.js >> $logfile 2>&1 &

    pid=$!
    echo $pid > $pidfile

    echo "Started an instance in the background (pid: $pid)"
    echo "Check $logfile for status"
elif [[ $command = "stop" ]]; then
    if [[ ! -e $pidfile ]]; then
        echo "It does not appear that an instance is running"
        exit 1
    fi

    pid=$(<$pidfile)

    kill $pid > /dev/null 2>&1
    if [[ $? == 0 ]]; then
        echo "Killed instance (pid: $pid)"
    else
        echo "Failed to kill instance (pid: $pid)"
        echo "Maybe it stopped due to an error or was killed already?"
    fi

    rm $pidfile
else
    echo "Unrecognized command $command"
    exit 1
fi