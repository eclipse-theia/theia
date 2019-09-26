# Publishing

In order to release one should:

- announce upcoming release
- pre-publishing steps
- login to the npm registry
- publish packages
- commit updated versions
- reset local HEAD to match release commit
- tag the published version
- announce release is done

## Announce upcoming release

It's good to give a heads-up to the Theia developers some hours before a release. One can use whatever forum is appropriate. At the time of writing this is `spectrum`. Here is an [example](https://spectrum.chat/theia/dev/0-11-0-release~f8181a53-436a-4b35-a3e3-a447a298a334).

## Pre-Publishing Steps

Before publishing it's important to make sure that a functional Theia application can be made from the latest `next` version of the platform. Else we will have problems with "latest" after publishing.

One easy way is to use the theia-apps repo CI:

- Make sure that there is no pending build on Theia master, otherwise a new "next" version might be published while we validate the current "next".

- Go in the theia-apps repo [here](https://github.com/theia-ide/theia-apps/commits/master) and identify the latest commit. There should be an icon next to it; either a red X or a green checkmark. Click on it to go the Travis page. There re-trigger the build. We need to make sure that at least the various "next" builds pass CI.If it doesn't, it needs to be fixed before continuing.

- in case the theia-app images fail CI for reasons not related to the `next` Theia platform extensions (e.g. none of the images currently pass CI including `latest`), a fallback alternative is to build and briefly test one Theia app locally using the `next` version of a good subset of the platform extensions.

- Update the forum release post to ask committers to hold-off merging any PR while the release is ongoing.

## Login to the npm registry

Follow this [instruction](https://docs.npmjs.com/cli/adduser) to login to the npm registry with a user account.

If you don't have an account contact [Theia organization](https://www.npmjs.com/~theia) to request one.

## Publishing packages

    yarn run publish

This command will rebuild all packages, test them, publish to npm and bump versions.

If publishing of an individual package failed then publish it with `npm publish` from its root after resolving outstanding issues.

## Commit updated versions

    git add *
    git commit -m "publish v${published.version}" -s
    git push ${remote for main Theia repo} master:${branch}

The version picked during package publishing should be used as `${published.version}`.

For example, if you picked `0.1.0` as a version and your git remote for the main Theia repo is named `origin`, then you should run:

    git add *
    git commit -m "publish v0.1.0" -s
    git push origin master:release_0_1_0

Then from the project's [main page](https://github.com/eclipse-theia/theia), create a pull request from the branch just pushed. Have another committer on standby to quickly review and approve the PR, then merge it.

## Reset local HEAD to match release commit

(so that the tag we will add is attached to correct commit)

    git fetch ${remote for main Theia repo}
    git reset --hard ${remote for main Theia repo}/master

For example:

    git fetch origin
    git reset --hard origin/master

## Tagging the published version

**Warning:** Continue only if all packages have been published successfully. Otherwise work on resolving issues and publishing failed packages.

    git tag v${published.version}
    git push origin v${published.version}

The version picked during package publishing should be used as `${published.version}`.

For example, if you picked `0.1.0` as a version then you should run:

    git tag v0.1.0
    git push origin v0.1.0

To confirm that the tagging was correctly done, check the repo's [releases](https://github.com/eclipse-theia/theia/releases) page and confirm the release just done is listed there.

## Announce release is done

- Update the forum release post to announce that the release is done.
