# Publishing

In order to release one should:

- login to the npm registry
- publish packages
- tag the published version

## Login to the npm registry

Follow this [instruction](https://docs.npmjs.com/cli/adduser) to login to the npm registry with a user account.

If you don't have an account contact [Theia organization](https://www.npmjs.com/~theia) to request one.

## Publishing packages

    yarn run publish

This command will rebuild all packages, test them, publish to npm and bump versions.

## Tagging the published version

    git commit -m "publish v${published.version}" -s
    git push origin HEAD
    git tag v${published.version}
    git push origin v${published.version}

The version picked during package publishing should be used as `${published.version}`.

First two commands commit updated versions, last two create a new tag and transfer it to a remote.

For example, if you picked `0.1.0` as a version then you should run:

    git commit -m "publish v0.1.0" -s
    git push origin HEAD
    git tag v0.1.0
    git push origin v0.1.0