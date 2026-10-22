#!/bin/sh
STATUS=$(git status --porcelain)
if [ -n "$STATUS" ]; then
    echo "\nERR: The git repository state changed after the build, this should not happen.\n"
    git --no-pager diff
    if echo "$STATUS" | grep -q 'package-lock.json'; then
        echo "\nHINT: 'package-lock.json' changed after install. Regenerate and commit it with:"
        echo "\n        npm install"
        echo "\n      See doc/lockfile-maintenance.md for details."
    else
        echo "\nHINT: Did you update and commit your 'package-lock.json' ?"
        echo "\n      You can also check your '.gitignore'."
    fi
    exit 1
fi
