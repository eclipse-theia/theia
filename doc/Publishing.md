# Publishing Guide for Eclipse Theia Releases

This guide details the steps for maintainers to release Eclipse Theia, including pre-release preparations, the release process, post-release steps, and troubleshooting.

## Table of Contents

1. [Pre-Release Steps](#1-pre-release-steps)
   - [1.1 Announce Release](#11-announce-release)
   - [1.2 Localization](#12-localization)
   - [1.3 Prepare Release Branch](#13-prepare-release-branch)
   - [1.4 Update Changelog](#14-update-changelog)
2. [Release Process](#2-release-process)
   - [2.1 Performing a Release](#21-performing-a-release)
   - [2.2 Community Releases](#22-community-releases)
3. [Post-Release Steps](#3-post-release-steps)
   - [3.1 Eclipse Release](#31-eclipse-release)
   - [3.2 Announce Release Completion](#32-announce-release-completion)
   - [3.3 Update Future Milestones](#33-update-future-milestones)
   - [3.4 Merge Website PRs](#34-merge-website-prs)
   - [3.5 Publish GitHub Pages](#35-publish-github-pages)
   - [3.6 Update Major Dependencies](#36-update-major-dependencies)
   - [3.7 NPM Upgrade](#37-npm-upgrade)
4. [Troubleshooting](#4-troubleshooting)
   - [Failures During Publishing](#41-failures-during-publishing)

## 1. Pre-Release Steps

### 1.1 Announce Release

#### Base Release 1.x.0

- Provide a heads-up to developers and the community two days before the release.
- Use GitHub Discussions for the announcement in the [Category General](https://github.com/eclipse-theia/theia/discussions/new?category=general).

    Title:

    ```md
    Eclipse Theia v{{version}}
    ```

    Body:

    ```md
    Hey everyone 👋,

    The Eclipse Theia v{{version}} release is scheduled for **{{releaseDate}}**.

    Please use the Endgame issue below to track what’s included.
    If you have any nearly-complete PRs that should to be part of the release, please mention it in the endgame issue before we start:

    - https://github.com/eclipse-theia/theia/issues/{{currentEndgameIssue}}

    We'll post updates when the release begins and again once it’s finished.
    Please avoid merging pull requests until we confirm the release is complete.
    ```

- Refer to [this example](https://github.com/eclipse-theia/theia/discussions/14547) for guidance.
- Also send a mail to `theia-dev@eclipse.org` (don't forget to add the link to the discussion):

    ```md
    Hi,
    The Eclipse Theia **v{{version}}** release is scheduled for **{{releaseDate}}**!
    You can follow the progress here: {{linkToDiscussion}}
    ```

#### Patch Release 1.x.z

- Provide a heads-up to developers and the community a few hours before the release.
- Use the [Base Release discussion](#base-release-1x0) and post a comment to announce the patch release.

  ```md
  We’re preparing the patch release Eclipse Theia v{{version}}

  Follow the endgame checklist here:
  - https://github.com/eclipse-theia/theia/issues/{{patchEndgameIssue}}

  We’ll post updates when the release begins and again once it’s finished.
  ```

### 1.2 Localization

- Perform `nls` updates before a release ([example](https://github.com/eclipse-theia/theia/pull/14373)).
- Trigger the automatic translation workflow via GitHub Actions ([workflow link](https://github.com/eclipse-theia/theia/actions/workflows/translation.yml)).
- Force-push the branch created by the bot to properly trigger CI.
- Once the PR is approved, use `Squash and merge` to finalize it.

### 1.3 Prepare Release Branch

- Checkout `master` with the latest changes:

  ```bash
  git pull
  ```

- Confirm the latest changes are present:

  ```bash
  git log
  ```

- Create a branch with the pattern `release/x.y.z` (e.g., `release/1.55.x`).

### 1.4 Update Changelog

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

- Announcement for Base Release (x.x.0)
  - Announce that the release is starting as a comment in the [Release discussion](#base-release-1x0).

    ```md
    The release will start now. We’ll post an update once it has completed.
    ```

- Ensure the release branch is checked out (e.g., `release/1.55.x`).

- Clean the working directory:

  ```bash
  git clean -xdf
  ```

- Build the changes:

  ```bash
  npm install && npm run build
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
  npm run publish:latest
  ```

  Select the appropriate version.

  _NOTE:_ For a patch release on an earlier version (e.g., 1.55.1 when 1.56.0 exists), use:

  ```bash
  npm run publish:patch
  ```

- Verify the packages are published on npm.

- Remove the auth token:

  ```bash
  npm logout
  ```

- Update `packages/core/README.md` in a commit named `core: update re-exports for {version}` ([example](https://github.com/eclipse-theia/theia/commit/21fa2ec688e4a8bcf10203d6dc0f730af43a7f58)).

- Add other changes in a commit named `v{version}`.

- Push the branch.

- Get the `native dependencies`
  - Run the [_Package Native Dependencies_](https://github.com/eclipse-theia/theia/actions/workflows/native-dependencies.yml) GitHub Action on the new branch (You can continue while you wait).
  - Download the artifacts (They are located on the build overview at the bottom).
  - Extract the downloaded folders.
  - Leave the dependencies for now, you will need them later.

- Create a PR (not needed for patch releases):
  - Name: `Theia {version}`.
  - Wait for approval.
  - Merge using `Rebase and Merge` (**DO NOT `Squash and Merge`**).

- Tag the publishing commit after merging (for patch releases, tag directly on the release branch):

  ```bash
  git tag -a v{version} ${sha} -m "v{version}"
  ```

  _Note_: The tag needs to be annotated otherwise it might break the publishing. Check that the output of the following command is `tag` and not `commit`.

  ```bash
  git for-each-ref refs/tags | grep 'v{version}' | awk '{print $2}'
  ```

- Push the tag:

  ```bash
  git push origin v{version}
  ```

- Create a GitHub release:
  - Draft a release on the [releases page](https://github.com/eclipse-theia/theia/releases).
  - Choose the appropriate `tag` and input a `name` (e.g., `v{version}`, `Eclipse Theia v{version}`).
  - Use `generate release notes` for contributors and format like previous releases.
  - Reference the `changelog` and breaking changes.
  - Attach _Native Dependencies_ artifacts (the extracted zips).
    - native-dependencies-darwin-arm64.zip
    - native-dependencies-linux-x64.zip
    - native-dependencies-win32-x64.zip
  - Mark the release as `latest` (_Do not mark for a patch on an older version_).
  - Select _"Publish Release"_.
  - See [GitHub documentation](https://help.github.com/en/github/administering-a-repository/managing-releases-in-a-repository#creating-a-release) for details.

### 2.2 Community Releases

Community releases follow the same procedure as the regular releases. Please follow [2.1 Performing a Release](#21-performing-a-release).

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

- Update the discussion and comment in the [Release discussion](#base-release-1x0) that the release is completed.

  ```md
  The (patch) release has completed, thank you to everyone that participated and contributed!
  ```

- Mark the message as the answer

- Submit to "Theia News" for a Twitter announcement. Use [this template](https://github.com/eclipse-theia/theia/wiki/Eclipse-Theia-Twitter-strategy#release-announcement-no-review) and submit it [here](https://forms.gle/ccS6qawpS54FQZht5).

### 3.3 Update Future Milestones

- Close the current release [milestone](https://github.com/eclipse-theia/theia/milestones).
- Create the next two milestones if they do not already exist. Releases are typically on the last Thursday of the month, with possible exceptions.

### 3.4 Merge Website PRs

- Merge all [website PRs marked with label `merge with next release`](https://github.com/eclipse-theia/theia-website/labels/merge%20with%20next%20release)

### 3.5 Publish GitHub Pages

- Publish the `latest` documentation with the [GitHub Pages workflow](https://github.com/eclipse-theia/theia/actions/workflows/publish-gh-pages.yml) manually using the `manual_dispatch` job.

### 3.6 Update Major Dependencies

After each release, check the following major dependencies for version updates:

- [Node.js](https://nodejs.org/en/download/releases/) - Check for LTS versions and security updates
- [React](https://react.dev/versions) - Review latest stable releases
- [Electron](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
  - Evaluate supported versions and review [Breaking changes](https://www.electronjs.org/docs/latest/breaking-changes) for anything that may affect usage.

For each dependency requiring an update, [create a ticket](https://github.com/eclipse-theia/theia/issues/new?template=feature_request.md) using the following template:

Title:

```md
Update [DEPENDENCY_NAME] to version X.Y.Z
```

Description:

```md
### Feature Description:
Update [DEPENDENCY_NAME] to stay up-to-date and consume (security) fixes.

- Current version: [CURRENT_VERSION]
- Target version: [TARGET_VERSION]

After updating the dependency, please [open a ticket for the Theia IDE](https://github.com/eclipse-theia/theia-ide/issues/new?template=feature_request.md) and assign the `toDoWithRelease` and `dependencies` labels.
This indicates that the update needs to be done in Theia IDE as well and ensures it will be addressed with the next release.
```

If certain updates need to be done together (e.g. new electron version requires newer node version) feel free to group the tickets together.

Assign the ticket to @ndoschek.

Once the ticket is created, @ndoschek will evaluate and assign it to the appropriate person for implementation.

### 3.7 NPM Upgrade

Perform a `npm upgrade` on the repository after the release to update the `package-lock.json`. The upgrade helps to:

- Better represent what adopters will pull during a release.
- Validate dependencies with our declared version ranges.
- Fix known security vulnerabilities from dependencies.

To perform the upgrade:

- Run `npm upgrade` at the root of the repository.
- Fix any compilation errors, typing errors, and failing tests.
- Open a PR with the changes ([example](https://github.com/eclipse-theia/theia/pull/13423)).
- Confirm licenses and wait for the "IP Check" to complete ([example](https://gitlab.eclipse.org/eclipsefdn/emo-team/iplab/-/issues/9377)).

Performing this after the release helps us to find issues with the new dependencies and gives time to perform a license check on the dependencies.

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
