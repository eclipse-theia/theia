# Publishing

The documentation describes the various steps and information regarding the release of Eclipse Theia for maintainers.

## Release Procedure

- [**Pre-Release Steps**](#pre-release-steps)
  - [Yarn Upgrade](#yarn-upgrade)
  - [Announce Release](#announce-release)
  - [Localization Updates](#localization-updates)
  - [Changelog Updates](#changelog-updates)
  - [Update Milestone](#update-milestone)
- [**Release**](#publishing)
- [**Post-Release Steps**](#post-release-steps)

## Pre-Release Steps

### Yarn Upgrade

In general, it is recommended to perform a `yarn upgrade` on the repository prior to a release to update the `yarn.lock`.
The upgrade helps to:

- Better represents what adopters will pull during a release.
- Validate dependencies with our declared version ranges.
- Fix known security vulnerabilities from dependencies.

In order to successfully perform a `yarn upgrade` one must:

- Perform a `yarn upgrade` at the root of the repository.
- Fix any potential compilation errors, typing errors, and failing tests that may have been introduced.
- Confirm licenses and wait for the "IP Check" to complete ([example](https://gitlab.eclipse.org/eclipsefdn/emo-team/iplab/-/issues/9377)).

### Announce Release

It is a good idea to give a heads-up to developers and the community some hours before a release.
At the time of writing this is [Discourse](https://community.theia-ide.org/). Here is an [example](https://community.theia-ide.org/t/eclipse-theia-v1-40-0-release/3112/5).

### Localization Updates

The localization (`nls`) updates should be performed before a release ([example](https://github.com/eclipse-theia/theia/pull/12665)).
To help we have an [automatic translation](https://github.com/eclipse-theia/theia/actions/workflows/translation.yml) workflow which can be triggered.
Note that due to the required CI check (`lint`) we will need for force-push the branch that the bot creates to properly trigger CI.

### Changelog Updates

The [changelog](https://github.com/eclipse-theia/theia/blob/master/CHANGELOG.md) should be updated and merged for the release.
The updates should document the release as thoroughly as possible:

- Notable new features, improvements and bug fixes.
- Potential breaking changes.

The `changelog` should follow the same format as previous releases:

- Include the version, and date.
- Include a link to the appropriate milestone.
- Include all breaking changes in a separate section.
- Prefix entries by their most appropriate extension name (ex: `[core]`).
- Entries should include a link to their corresponding pull-request.
- Entries should be in alphabetical order.
- Entries should be in the past tense (ex: 'Added support...').

### Update Milestone

The given release [milestone](https://github.com/eclipse-theia/theia/milestones) should be updated to include all commits that composed the release.
Generally, milestones are automatically added on merge but not necessarily for forks. It is therefore important to manually add such contributions to the milestone for the time being.

## Release

The release instructions are as follows:

- Checkout `master` with the latest changes (`git pull` to pull latest changes).
- Confirm the latest changes are present (`git log`).
- Build the changes (`yarn`).
- Confirm the changes are built (individual `@theia` extensions should have their `lib/` folders present).
- Perform the release using `yarn publish:latest` - choose an appropriate version.
- Keep the `readme` updates in a separate commit ([example](https://github.com/eclipse-theia/theia/commit/21fa2ec688e4a8bcf10203d6dc0f730af43a7f58)).
- Prepare a release - create a branch with the pattern `release/x.y.z` (ex: `release/1.40.x`).
- Once the pull-request is merged, pull the changes locally and tag the publishing commit (ex: `git tag -a "${version} ${sha} -m "${version}"`).
- Publish the tag to GitHub.
- Create a [release](https://github.com/eclipse-theia/theia/releases/new) from the tag ([example](https://github.com/eclipse-theia/theia/releases/tag/v1.40.0)).
- For the release be sure to include necessary links with a similar format to [previous releases](https://github.com/eclipse-theia/theia/releases/tag/v1.40.0).

## Post-Release Steps
