# Publishing

In order to release one should:

- pre-publishing steps
- login to the npm registry
- publish packages
- tag the published version

## Pre-Publishing Steps
Before publishing it's important to make sure that theia-apps builds against 'next'. Else we will have problems with "latest" after publishing

- Make sure that there is no pending build on Theia master, otherwise a new "next" version might be published while we validate the current "next".

- Go in the theia-apps repo [here](https://github.com/theia-ide/theia-apps/commits/master) and identify the latest commit. There should be an icon next to it; either a red X or a green checkmark. Click on it to go the the travis page. There re-trigger the build. We need to make sure that at least the various "next" builds passes. If it doesn't, it needs to be fixed before continuying.


## Login to the npm registry

Follow this [instruction](https://docs.npmjs.com/cli/adduser) to login to the npm registry with a user account.

If you don't have an account contact [Theia organization](https://www.npmjs.com/~theia) to request one.

## Publishing packages

    yarn run publish

This command will rebuild all packages, test them, publish to npm and bump versions.

## Tagging the published version

    git add *
    git commit -m "publish v${published.version}" -s
    git push origin HEAD
    git tag v${published.version} -s
    git push origin v${published.version}

The version picked during package publishing should be used as `${published.version}`.

First two commands commit updated versions, last two create a new tag and transfer it to a remote.

For example, if you picked `0.1.0` as a version then you should run:

    git add *
    git commit -m "publish v0.1.0" -s
    git push origin HEAD
    git tag v0.1.0 -s
    git push origin v0.1.0