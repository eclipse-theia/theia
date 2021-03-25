# Publishing


## Release Procedure

- [**Announce Release**](#announce-release)
- [**Pre-Publishing Steps**](#pre-publishing-steps)
- [**Login to NPM Registry**](#login-to-npm-registry)
- [**Publish Packages**](#publish-packages)
- [**Commit Updated Versions**](#commit-updated-version)
- [**Create Release**](#create-release)
- [**Update Eclipse Release Page**](#update-eclipse-release-page)
- [**Post-Release**](#post-release)
    - [Announce Release is Completed](#announce-release-is-completed)
    - [Yarn Upgrade](#yarn-upgrade)


## Announce Release

It's good to give a heads-up to the Theia developers some hours before a release. One can use whatever forum is appropriate. At the time of writing this is [`Discourse`](https://community.theia-ide.org/).

Here is an [example](https://community.theia-ide.org/t/0-11-0-release/373).


## Pre-Release Steps

- Ensure that the [changelog](https://github.com/eclipse-theia/theia/blob/master/CHANGELOG.md) is updated and merged for the release.
  - The `changelog` should reflect updates included in the release:
    - Notable features, improvements and bug fixes.
    - Any possible breaking changes.
  - The `changelog` should follow the format of previous releases:
    - Include the version, and date.
    - Include a link to the appropriate milestone.
    - Include all breaking changes in a separate section.
    - Prefix entries by their most appropriate extension name (ex: `[core]`).
    - Entries should include a link to their corresponding pull-request.
    - Entries should be in alphabetical order.
    - Entries should be in the past tense (ex: 'Added support...').
- Ensure that merged pull-requests for the given release are added to the corresponding release [milestone](https://github.com/eclipse-theia/theia/milestones):
  - Generally, milestones are automatically added on merge however not for forks. It is therefore important to manually add such contributions to the milestone for the time being.


## Pre-Publishing Steps

Before publishing it's important to make sure that a functional Theia application can be made from the latest `next` version of the platform. Else we will have problems with "latest" after publishing.

One easy way is to use the theia-apps repo CI:

- Make sure that there is no pending build on Theia master, otherwise a new "next" version might be published while we validate the current "next".

- Go to the `theia-apps` [`actions`](https://github.com/theia-ide/theia-apps/actions?query=workflow%3Aci-cd) and manually trigger a workflow run:
  - select `run workflow` dropdown
  - select the `master` branch (should be the default)
  - click `run workflow`
- We need to make sure that at least the various "next" builds pass CI.If it doesn't, it needs to be fixed before continuing.

- In case the theia-app images fail CI for reasons not related to the `next` Theia platform extensions (e.g. none of the images currently pass CI including `latest`), a fallback alternative is to build and briefly test one Theia app locally using the `next` version of a good subset of the platform extensions.

- Update the forum release post to ask committers to hold-off merging any PR while the release is ongoing.


## Login to NPM Registry

Follow this [instruction](https://docs.npmjs.com/cli/adduser) to login to the npm registry with a user account.

If you don't have an account contact [Theia organization](https://www.npmjs.com/~theia) to request one.


## Publish Packages

    yarn run publish

This command will rebuild all packages, test them, publish to npm and bump versions.

If publishing of an individual package failed then publish it with `npm publish` from its root after resolving outstanding issues.


## Commit Updated Version

 git add *
    git commit -m "publish v${published.version}" -s
    git push ${remote for main Theia repo} master:${branch}

The version picked during package publishing should be used as `${published.version}`.

For example, if you picked `0.1.0` as a version and your git remote for the main Theia repo is named `origin`, then you should run:

    git add *
    git commit -m "publish v0.1.0" -s
    git push origin master:release_0_1_0

Then from the project's [main page](https://github.com/eclipse-theia/theia), create a pull request from the branch just pushed. Have another committer on standby to quickly review and approve the PR, then merge it.


## Create Release

The next step is to create a new [**Release**](https://github.com/eclipse-theia/theia/releases).
This will create a new `tag`, `release` with the appropriate assets (`.zip`, `tar.gz`) and notify subscribers.

In order to create a new release, one must:
- navigate to the releases [page](https://github.com/eclipse-theia/theia/releases).
- select the _"Draft a new release"_ button.
- input the appropriate release `tag` version (ex: `v1.2.0`).
- input the appropriate release `name` (ex: `Eclipse Theia v1.2.0`).
- include a release `description` to include a reference to the `changelog` at the respective `sha` and release version:

   ```md
   [Release Changelog](https://github.com/eclipse-theia/theia/blob/${sha}/CHANGELOG.md#${changelog-version-header})
   ```

   For example (version `v1.2.0`):

   ```md
   [Release Changelog](https://github.com/eclipse-theia/theia/blob/2aa2fa1ab091ec36ef851c4e364b322301cddb40/CHANGELOG.md#v120)
   ```

- select _"Publish Release"_ bottom at the bottom of the page.

For additional information, please consult the official GitHub documentation regarding [creating releases](https://help.github.com/en/github/administering-a-repository/managing-releases-in-a-repository#creating-a-release).


## Update Eclipse Release Page

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


## Post Release

### Announce Release is Completed

Update the forum release post to announce that the release has completed.


### Yarn Upgrade

After a release, it is a good time to perform a `yarn upgrade` on the repository to update the `yarn.lock`.
Updating the `yarn.lock` helps identify potential problems with our dependency version ranges, and is more representative of what downstream adopters may pull when building their own applications.

To successfully complete a `yarn upgrade`, one must:
- perform `yarn upgrade` at the root of the repository.
- fix any compilation errors, typing issues, and failing tests that may be introduced.

### Update Milestones

* Close current release [milestone](https://github.com/eclipse-theia/theia/milestones).
* Create the next two milestones in the case they do not already exist. Generally, the release is performed on the last Thursday of the month, but there may be exceptions (bug fix release, holidays, etc.)

### Update Roadmap

* If the current release is the last in a quarter, ask the team to update the [roadmap](https://github.com/eclipse-theia/theia/wiki/Roadmap) of the past quarter (close, remove or move items)
* If the current release is the second in a quarter, create [roadmap template](https://github.com/eclipse-theia/theia/wiki/Roadmap) for the next quarter, ask the team to contribute to it and add it to the agenda of the Theia dev meeting
