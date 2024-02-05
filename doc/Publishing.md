# Publishing

The documentation describes the various steps and information regarding the release of Eclipse Theia for maintainers.

## Release Procedure

- [**Pre-Release Steps**](#pre-release-steps)
  - [Yarn Upgrade](#yarn-upgrade)
  - [Announce Release](#announce-release)
  - [Localization](#localization)
  - [Changelog](#changelog)
  - [Update Milestone](#update-milestone)
- [**Release**](#publishing)
  - [Community Releases](#community-releases)
- [**Post-Release Steps**](#post-release-steps)
  - [Eclipse Release](#eclipse-release)
  - [Announce Release is Completed](#announce-release-is-completed)
  - [Update Future Milestones](#update-future-milestones)
  - [Publish GitHub Pages](#publish-github-pages)
- [**Troubleshooting**](#troubleshooting)
  - [**Failures During Publishing**](#failures-during-publishing)

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
At the time of writing this is [GitHub Discussions](https://github.com/eclipse-theia/theia/discussions). Here is an [example](https://github.com/eclipse-theia/theia/discussions/13314).

### Localization

The localization (`nls`) updates should be performed before a release ([example](https://github.com/eclipse-theia/theia/pull/12665)).
To help we have an [automatic translation](https://github.com/eclipse-theia/theia/actions/workflows/translation.yml) workflow which can be triggered.
Note that due to the required CI check (`lint`) we will need for force-push the branch that the bot creates to properly trigger CI.

### Changelog

The [changelog](https://github.com/eclipse-theia/theia/blob/master/CHANGELOG.md) should be updated and merged for the release.
The updates should document the release as thoroughly as possible:

- Notable new features, improvements and bug fixes.
- Potential breaking changes.

The `changelog` should follow the same format as previous releases:

- Include the version, and date.
- Add a link to the appropriate milestone.
- Document all breaking changes in a separate section.
- Entries should be formatted in the following way:
  - Prefix by their most appropriate extension name (ex: `[core]`).
  - Add a link to their corresponding pull-request.
  - Should be in alphabetical order.
  - Should be in the past tense (ex: 'Added support...').

### Update Milestone

The given release [milestone](https://github.com/eclipse-theia/theia/milestones) should be updated to include all commits that composed the release.
Generally, milestones are automatically added on merge but not necessarily for forks. It is therefore important to manually add such contributions to the milestone for the time being.

## Release

The release instructions are as follows:

- Checkout `master` with the latest changes (`git pull` to pull the latest changes).
- Confirm the latest changes are present (`git log`).
- Build the changes (`yarn`).
- Confirm the changes are built (individual `@theia` extensions should have their `lib/` folders present).
- Perform the release using `yarn publish:latest` - choose an appropriate version.
- Keep the `packages/core/README.md` updates in a separate commit ([example](https://github.com/eclipse-theia/theia/commit/21fa2ec688e4a8bcf10203d6dc0f730af43a7f58)).
- Prepare a release - create a branch with the pattern `release/x.y.z` (ex: `release/1.40.x`).
- Once approved, merge using `Rebase and Merge` (**DO NOT `Squash and Merge`**).
- Once the pull-request is merged, pull the changes locally and tag the publishing commit (ex: `git tag -a "${version} ${sha} -m "${version}"`).
- Publish the tag to GitHub.
- Create a GitHub release:
  - Navigate to the releases [page](https://github.com/eclipse-theia/theia/releases).
  - Select the _"Draft a new release"_ button.
  - Input the appropriate release `tag` version (ex: `v1.2.0`).
  - Input the appropriate release `name` (ex: `Eclipse Theia v1.2.0`).
  - Use the `generate release notes` button to generate the list of contributors (including new ones), and format them similarly to other releases.
  - Include a release `description` to include a reference to the `changelog` at the respective `sha` and release version.
  - Include a reference to the migration guide in the release description.
  - Select _"Publish Release"_ bottom at the bottom of the page.
  - For additional information, please consult the official GitHub documentation regarding [creating releases](https://help.github.com/en/github/administering-a-repository/managing-releases-in-a-repository#creating-a-release).

### Community Releases

For the most part community releases are similar to regular releases but with fewer steps (ex: no need to submit a pull-request).
In order to perform a community releases we want to:

- Prepare the community release branch which branches off from a specific release `tag`.
- Cherry-pick any changes we want to apply on top of the `tag` (ex: patches that fix regressions, security vulnerabilities).
- Perform the release as usual (we want to use a `dist-tag` of `community`).

## Post-Release Steps

### Eclipse Release

- Login to [Eclipse Foundation Theia project page]( https://projects.eclipse.org/projects/ecd.theia)
- On the right side menu, select `Release` / `Create a new release`
  - `Release Date`: enter the date for the release.
  - `Name`: enter the version of the release (ex: `1.40.0`).
- Select `Create and edit`.
- In the `projects` section:
  - Add the changelog link to `deliverables`.
  - Add the breaking changes link to `compatibility`.
- Save the changes.
- To confirm the release is successful:
  - Open the [project page](https://projects.eclipse.org/projects/ecd.theia)
    - Select the version you just created.
    - Open the Review plan section, you should see the data provided before.

### Announce Release is Completed

- Update the forum release post to announce that the release has completed.
- Submit to "Theia News", so that a Tweet will be created by the Twitter managers. Use [this template](https://github.com/eclipse-theia/theia/wiki/Eclipse-Theia-Twitter-strategy#release-announcement-no-review) for the message and post it [here](https://forms.gle/ccS6qawpS54FQZht5).

### Update Future Milestones

- Close current release [milestone](https://github.com/eclipse-theia/theia/milestones).
- Create the next two milestones in the case they do not already exist. Generally, the release is performed on the last Thursday of the month, but there may be exceptions (bug fix release, holidays, etc.).

### Publish GitHub Pages

Following a release we should publish the `latest` documentation with our [GitHub Pages](https://github.com/eclipse-theia/theia/actions/workflows/publish-gh-pages.yml) workflow. The publishing should be performed manually using the `manual_dispatch` job.

## Troubleshooting

### Failures During Publishing

Sometimes `lerna` will fail during publishing (ex: socket errors). If such a case happens we should `git reset --hard` and retry publishing of only unpublished
packages using a workaround command:

```bash
npx lerna publish from-package --no-git-reset --no-git-tag-version --no-push
```
