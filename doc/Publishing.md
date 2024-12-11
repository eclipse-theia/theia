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

- Announce that the release is starting in the discussion (not needed for patch releases):

  > The release will start now. We’ll post an update once it has completed.

- Ensure the release branch is checked out (e.g., `release/1.55.x`).

- Clean the working directory:

  ```bash
  git clean -xdf
  ```

- Build the changes:

  ```bash
  yarn
  ```

- Confirm the changes are built (ensure `@theia` extensions have their `lib/` folders).

- Create a short-lived granular npm auth token ([instructions](https://docs.npmjs.com/creating-and-viewing-access-tokens#creating-granular-access-tokens-on-the-website)):
  - Expiration: `7 days`.
  - Under Packages and scopes:
    - Permissions: `Read and write`.
    - Select `Only select packages and scopes`
    - Select packages and scopes: `@theia`.

- Set the token:

  ```bash
   npm set "//registry.npmjs.org/:_authToken=${TOKEN}"
  ```

  _Note:_ Add a whitespace in front of this command to ensure it is not added to the shell's history (might not work for all shells).

- Perform the release:

  ```bash
  yarn publish:latest
  ```

  Select the appropriate version.

  _NOTE:_ For a patch release on an earlier version (e.g., 1.55.1 when 1.56.0 exists), use:

  ```bash
  yarn publish:patch
  ```

- Verify the packages are published on npm.

- Remove the auth token:

  ```bash
  npm logout
  ```

- Update `packages/core/README.md` in a commit named `core: update re-exports for {version}` ([example](https://github.com/eclipse-theia/theia/commit/21fa2ec688e4a8bcf10203d6dc0f730af43a7f58)).

- Add other changes in a commit named `v{version}`.

- Push the branch.

- Run the [_Package Native Dependencies_](https://github.com/eclipse-theia/theia/actions/workflows/native-dependencies.yml) GitHub Action on the new branch and download the artifacts.

- Create a PR (not needed for patch releases):
  - Name: `Theia {version}`.
  - Wait for approval.
  - Merge using `Rebase and Merge` (**DO NOT `Squash and Merge`**).

- Tag the publishing commit after merging (for patch releases, tag directly on the release branch):

  ```bash
  git tag -a v{version} ${sha} -m "v{version}"
  ```

- Push the tag:

  ```bash
  git push origin v{version}
  ```

- Create a GitHub release:
  - Draft a release on the [releases page](https://github.com/eclipse-theia/theia/releases).
  - Choose the appropriate `tag` and input a `name` (e.g., `v1.55.0`, `Eclipse Theia v1.55.0`).
  - Use `generate release notes` for contributors and format like previous releases.
  - Reference the `changelog` and breaking changes.
  - Attach _Package Native Dependencies_ artifacts.
  - Mark the release as `latest` (_Do not mark for a patch on an older version_).
  - Select _"Publish Release"_.
  - See [GitHub documentation](https://help.github.com/en/github/administering-a-repository/managing-releases-in-a-repository#creating-a-release) for details.

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
