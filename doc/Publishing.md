# Publishing Guide for Eclipse Theia Releases

This guide details the steps for maintainers to release Eclipse Theia, including pre-release preparations, the release process, post-release steps, and troubleshooting.

## Table of Contents

1. [Pre-Release Steps](#1-pre-release-steps)
   - [1.1 Yarn Upgrade](#11-yarn-upgrade)
   - [1.2 Announce Release](#12-announce-release)
   - [1.3 Localization](#13-localization)
   - [1.4 Prepare Release Branch](#14-prepare-release-branch)
   - [1.5 Update Changelog](#15-update-changelog)
2. [Release Process](#2-release-process)
   - [2.1 Performing a Release](#21-performing-a-release)
   - [2.2 Community Releases](#22-community-releases)
3. [Post-Release Steps](#3-post-release-steps)
   - [3.1 Eclipse Release](#31-eclipse-release)
   - [3.2 Announce Release Completion](#32-announce-release-completion)
   - [3.3 Update Future Milestones](#33-update-future-milestones)
   - [3.4 Merge Website PRs](#34-merge-website-prs)
   - [3.5 Publish GitHub Pages](#35-publish-github-pages)
4. [Troubleshooting](#4-troubleshooting)
   - [Failures During Publishing](#41-failures-during-publishing)

## 1. Pre-Release Steps

### 1.1 Yarn Upgrade

Perform a `yarn upgrade` on the repository prior to a release to update the `yarn.lock`. The upgrade helps to:

- Better represent what adopters will pull during a release.
- Validate dependencies with our declared version ranges.
- Fix known security vulnerabilities from dependencies.

To perform the upgrade:

- Run `yarn upgrade` at the root of the repository.
- Fix any compilation errors, typing errors, and failing tests.
- Open a PR with the changes ([example](https://github.com/eclipse-theia/theia/pull/13423)).
- Confirm licenses and wait for the "IP Check" to complete ([example](https://gitlab.eclipse.org/eclipsefdn/emo-team/iplab/-/issues/9377)).

### 1.2 Announce Release

- Provide a heads-up to developers and the community a few hours before the release.
- Use [GitHub Discussions](https://github.com/eclipse-theia/theia/discussions) for the announcement.

  > Title: Eclipse Theia v{version}
  >
  > Hey everyone 👋,
  >
  > The Eclipse Theia v{version} release is happening today, starting around {time} CET.
  > If you have any nearly-complete PRs that need to be included, let us know in this thread before we begin.
  >
  > We’ll post updates when the release starts and once it’s done.
  > Please avoid merging any PRs during the release until we confirm it's over.

- Refer to [this example](https://github.com/eclipse-theia/theia/discussions/14547) for guidance.
- Also send a mail to `theia-dev@eclipse.org` (don't forget to add the link to the discussion):

  > Hi,
  >
  > The Eclipse Theia v{version} release is scheduled for later today! You can follow the progress here: {add link here}

### 1.3 Localization

- Perform `nls` updates before a release ([example](https://github.com/eclipse-theia/theia/pull/14373)).
- Trigger the automatic translation workflow via GitHub Actions ([workflow link](https://github.com/eclipse-theia/theia/actions/workflows/translation.yml)).
- Force-push the branch created by the bot to properly trigger CI.
- Once the PR is approved, use `Squash and merge` to finalize it.

### 1.4 Prepare Release Branch

- Checkout `master` with the latest changes:

  ```bash
  git pull
  ```

- Confirm the latest changes are present:

  ```bash
  git log
  ```

- Create a branch with the pattern `release/x.y.z` (e.g., `release/1.55.x`).

### 1.5 Update Changelog

Add entries for non-breaking changes since the last release. Breaking changes should be added by the PR, not during the release.

Commit the changelog changes with the message: `docs: update changelog for {version}`.

Format:

- Version and date as an H2 header (e.g., `## 1.55.0 - 10/31/2024`).
- Entries should:
  - Be prefixed with their extension name (e.g., `[core]`).
  - Start with a lowercase character and be in the past tense (e.g., 'added support...').
  - Be in alphabetical order.
  - Include a link to their corresponding pull request.
  - Specify contribution if applicable (e.g., Contributed on behalf of x).
  - Example: `[core] added support for Node 20.x [#1234](https://github.com/eclipse-theia/theia/pull/1234) - Contributed on behalf of x`.
- Breaking changes should be in a separate section (header: `<a name="breaking_changes_1.55.0">[Breaking Changes:](#breaking_changes_1.55.0)</a>`).

## 2. Release Process

### 2.1 Performing a Release

- Announce that the release is starting in the discussion.

  > The release will start now, We’ll post an update once it has completed.

- Build the changes:

  ```bash
  yarn
  ```

- Confirm the changes are built (individual `@theia` extensions should have their `lib/` folders present).
- Perform the release using:

  ```bash
  yarn publish:latest
  ```

  Choose the appropriate version.

- Update `packages/core/README.md` in a separate commit named `core: update re-exports for {version}` ([example](https://github.com/eclipse-theia/theia/commit/21fa2ec688e4a8bcf10203d6dc0f730af43a7f58)).
- Add all other changes to a commit named `v{version}`.
- Push the branch and create a PR named `Theia {version}`.
- Run the [_Package Native Dependencies_](https://github.com/eclipse-theia/theia/actions/workflows/native-dependencies.yml) GitHub Action on the new branch and download the resulting artifacts.
- Wait for approval.
- Merge using `Rebase and Merge` (**DO NOT `Squash and Merge`**).
- Tag the publishing commit after merging:

  ```bash
  git tag -a v{version} ${sha} -m "v{version}"
  ```

- Publish the tag to GitHub:

  ```bash
  git push origin v{version}
  ```

- Create a GitHub release:
  - Draft a new release on the [releases page](https://github.com/eclipse-theia/theia/releases).
  - Choose the appropriate release `tag` and input a `name` (e.g., `v1.55.0`, `Eclipse Theia v1.55.0`).
  - Use the `generate release notes` button for contributors, and format them similarly to other releases.
  - Reference the `changelog` and breaking changes in the description.
  - Add the _Package Native Dependencies_ artifacts to the release assets.
  - Select _"Publish Release"_.
  - For additional details, consult [GitHub documentation](https://help.github.com/en/github/administering-a-repository/managing-releases-in-a-repository#creating-a-release).

### 2.2 Community Releases

Community releases are similar to regular releases but with fewer steps (e.g., no need to submit a pull request).

- Prepare the community release branch from a specific release `tag`.
- Cherry-pick any changes to apply on top of the `tag` (e.g., patches).
- Perform the release as usual using a `dist-tag` of `community`.

## 3. Post-Release Steps

### 3.1 Eclipse Release

- Login to [Eclipse Foundation Theia project page](https://projects.eclipse.org/projects/ecd.theia).
- Select `Release` / `Create a new release` from the menu.
  - `Release Date`: Enter the date.
  - `Name`: Enter the version (e.g., `1.55.0`).
- Go to Edit -> Project Plan
  - Add the changelog link to `deliverables` (Link with text `Release Notes`).
  - Add breaking changes link to `compatibility` (Link with text `Breaking Changes`).
- Save changes and confirm by reviewing the project page.

### 3.2 Announce Release Completion

- Update the forum post to announce that the release is completed.

  > The release has completed, thank you to everyone that participated and contributed!

- Mark the message as the answer

- Submit to "Theia News" for a Twitter announcement. Use [this template](https://github.com/eclipse-theia/theia/wiki/Eclipse-Theia-Twitter-strategy#release-announcement-no-review) and submit it [here](https://forms.gle/ccS6qawpS54FQZht5).

### 3.3 Update Future Milestones

- Close the current release [milestone](https://github.com/eclipse-theia/theia/milestones).
- Create the next two milestones if they do not already exist. Releases are typically on the last Thursday of the month, with possible exceptions.

### 3.4 Merge Website PRs

- Merge all [website PRs marked with label `merge with next release`](https://github.com/eclipse-theia/theia-website/labels/merge%20with%20next%20release)

### 3.5 Publish GitHub Pages

- Publish the `latest` documentation with the [GitHub Pages workflow](https://github.com/eclipse-theia/theia/actions/workflows/publish-gh-pages.yml) manually using the `manual_dispatch` job.

## 4. Troubleshooting

### 4.1 Failures During Publishing

If `lerna` fails during publishing (e.g., socket errors), use the following commands to reset and retry:

- Reset the repository:

  ```bash
  git reset --hard
  ```

- Retry publishing only the unpublished packages:

  ```bash
  npx lerna publish from-package --no-git-reset --no-git-tag-version --no-push
  ```
