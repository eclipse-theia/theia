#!/bin/sh
if [ $(git status --porcelain | wc -c) -gt 0 ];
then
    echo "\nERR: The git repository state changed after the build, this should not happen.\n"
    git --no-pager diff
    echo "\nHINT: Did you update and commit your 'yarn.lock' ?"
    echo "\n      You can also check your '.gitgnore'."
    exit 1
fi
