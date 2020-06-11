# Publishing

In order to release one should:

- update the release page (Pre-release)
- announce upcoming release
- pre-publishing steps
- login to the npm registry
- publish packages
- commit updated versions
- reset local HEAD to match release commit
- tag the published version
- announce release is done
- update the release page (Post-release)

## Updating the release page on Eclipse Foundation (Pre-release)

`One week` before the release, the project's release page should be updated in order to announce upcoming changes.

Login to [Eclipse Foundation Theia project page]( https://projects.eclipse.org/projects/ecd.theia)
- On the right side panel, select Release / Create a new release

    Create a new version
    - Name: enter the new version for this release. (ex: 1.2.0).
    - Date: enter the date for this release.

    Select the edit tab
    - In "The Basic" section
        - Select the  "Type A" in the IP Due Diligence type.
    - In the "Project Plan"
        - Deliverables section
            - Paste the content of the changelog.md.
        - Compatibility section
            - Paste the content of the "Breaking changes"


- When completing the edition, select "Save" at the bottom of the page.
- To confirm the release is successful,
    - Open the page https://projects.eclipse.org/projects/ecd.theia
        - Select the version you just created.
        - Open the Review plan section, you should see the data provided before.

## Announce upcoming release

It's good to give a heads-up to the Theia developers some hours before a release. One can use whatever forum is appropriate. At the time of writing this is `Discourse`. Here is an [example](https://community.theia-ide.org/t/0-11-0-release/373).

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

## Create a release

The next step of the release process is to create a new **release** on the GitHub [releases](https://github.com/eclipse-theia/theia/releases) page for the project. This will create a new release, attach the necessary assets (`.zip`, `tar.gz`, changelog link), and also notify GitHub subscribers of a new release.

In order to create a new release on GitHub, one must:

- navigate to the [tags](https://github.com/eclipse-theia/theia/tags) page for the project
- select the latest tag, and click `create release` from the 'more' (`...`) toolbar item
- update the release description to include a reference to the `changelog` at the respective `sha` and release version:

   ```md
   [Release Changelog](https://github.com/eclipse-theia/theia/blob/${sha}/CHANGELOG.md#${changelog-version-header})
   ```

   For example (version `v1.2.0`):

   ```md
   [Release Changelog](https://github.com/eclipse-theia/theia/blob/2aa2fa1ab091ec36ef851c4e364b322301cddb40/CHANGELOG.md#v120)
   ```

- select `create release` at the bottom of the page

For additional information, please consult the official GitHub documentation regarding [creating releases](https://help.github.com/en/github/administering-a-repository/managing-releases-in-a-repository#creating-a-release).

## Updating the release page on Eclipse Foundation (Post-release)

- Login to [Eclipse Foundation Theia project page]( https://projects.eclipse.org/projects/ecd.theia)
-   Select the edit tab from the current release
    - In the "Project Plan"
        - Deliverables section
            - Paste the content of the new changelog.md.
        - Compatibility section
            - Paste the content of the "Breaking changes"

- When completing the edition, select "Save" at the bottom of the page.
- To confirm the release is successful,
    - Open the page https://projects.eclipse.org/projects/ecd.theia
        - Select the version you just created.
        - Open the Review plan section, you should see the data provided before.

## Announce release is done

- Update the forum release post to announce that the release is done.
