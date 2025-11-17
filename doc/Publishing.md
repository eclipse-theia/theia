# Publishing Guide for Eclipse Theia Releases

This guide details the steps for maintainers to release Eclipse Theia, including pre-release preparations, the release process, post-release steps, and troubleshooting.

## Table of Contents

1. [Pre-Release Steps](#1-pre-release-steps)
   - [1.1 Announce Release](#11-announce-release)
   - [1.2 Check for release preparation tickets](#12-check-for-release-preparation-tickets)
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
   - [3.6 Update Major Dependencies](#36-update-major-dependencies)
   - [3.7 NPM Upgrade](#37-npm-upgrade)
4. [Troubleshooting](#4-troubleshooting)
   - [Failures During Publishing](#41-failures-during-publishing)

## 1. Pre-Release Steps
<!-- release: both -->

### 1.1 Announce Release
<!-- release: both -->

#### 1.1.1 Minor Release 1.x.0
<!-- release: minor -->

- Provide a heads-up to developers and the community two days before the release.

##### 1.1.1.1 GH Discussion
<!-- release: minor -->

- Use GitHub Discussions for the announcement in the [Category Release Announcements](https://github.com/eclipse-theia/theia/discussions/new?category=release-announcements).

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

    - https://github.com/eclipse-theia/theia/issues/{{currentEndgameIssueNumber}}

    We'll post updates when the release begins and again once it’s finished.
    Please avoid merging pull requests until we confirm the release is complete.
    ```

  - Pin discussion to the Release Announcement Category

- Refer to [this example](https://github.com/eclipse-theia/theia/discussions/14547) for guidance.

##### 1.1.1.2 theia-dev mailing list
<!-- release: minor -->

- Also send an email to [the `theia-dev` mailing List](mailto:theia-dev@eclipse.org) (don't forget to add the link to the discussion):

    Subject:

    ```md
    Eclipse Theia version v{{version}}
    ```

    Body:

    ```md
    Hi everyone,

    The Eclipse Theia v{{version}} release is scheduled for {{releaseDate}}!
    You can follow the progress of the release here: https://github.com/eclipse-theia/theia/discussions/{{discussionNumber}}
    ```

#### 1.1.2 Patch Release 1.x.z
<!-- release: patch -->

- Provide a heads-up to developers and the community a few hours before the release.
- Use the [Release discussion](#111-minor-release-1x0) and post a comment to announce the patch release: <https://github.com/eclipse-theia/theia/discussions/{{discussionNumber}}>

  ```md
  We are preparing the patch release Eclipse Theia v{{version}}

  Follow the endgame checklist here:
  - https://github.com/eclipse-theia/theia/issues/{{patchEndgameIssueNumber}}

  We'll post an update once the release is finished.
  ```

### 1.2. Check for release preparation tickets
<!-- release: both -->

Check for tickets that need to be addressed when preparing the release:

- Prepare/resolve all tickets that are located in: <https://github.com/eclipse-theia/theia/labels/toDoWithRelease>
  - e.g. initial publish to npm for newly added packages.

### 1.3 Localization
<!-- release: minor -->

- Perform `nls` updates before a release ([example](https://github.com/eclipse-theia/theia/pull/14373)).
- Trigger the automatic translation workflow via GitHub Actions ([workflow link](https://github.com/eclipse-theia/theia/actions/workflows/translation.yml)).
- Force-push the branch created by the bot to properly trigger CI.
- Once the PR is approved, use `Squash and merge` to finalize it.
- DO NOT delete the bot's branch `bot/translation-update`

### 1.4 Prepare Release Branch
<!-- release: minor -->

- Checkout `master` with the latest changes:

  ```bash
  git pull
  ```

- Confirm the latest changes are present:

  ```bash
  git log
  ```

- Create a branch with the pattern `release/major.minor.x` (e.g., `release/1.55.x`).

  ```md
  release/{{majorMinor}}.x
  ```

### 1.5 Update Changelog
<!-- release: minor -->

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
  - Example: `[core] added support for Node 20.x [#pr-number](<link-to-pr>) - Contributed on behalf of x`.
- Breaking changes should be in a separate section (header: `<a name="breaking_changes_1.55.0">[Breaking Changes:](#breaking_changes_1.55.0)</a>`).

## 2. Release Process
<!-- release: both -->

### 2.1 Performing a Release
<!-- release: both -->

### 2.1.1 GH Discussion announcement
<!-- release: minor -->

- Announcement for Minor Release (x.x.0)
  - Announce that the release is starting as a comment in the [Release discussion](#111-minor-release-1x0): <https://github.com/eclipse-theia/theia/discussions/{{discussionNumber}}>

    ```md
    The release will start now. We’ll post an update once it has completed.
    ```

### 2.1.2 Newly added Theia packages - publish initially to NPM
<!-- release: both -->

_NOTE:_ New `@theia` packages must be published once manually by a Theia committer before the publish workflow can publish them.
This is due to recent changes requiring trusted workflows for npm publishing.

It is recommend to first publish a next version of the new package, then we can publish the release properly via the recommended publish workflow.
- To publish locally, you need to:
  - Ensure you are logged in to NPM (`npm login`; NPM will prompt you for an OTP (one-time password) or security key).
  - Have your 2FA ready, as you will need an OTP for the publishing process to complete.
- Run `npm run publish:next`
  - Optional: If you remove the `--yes` parameter from the publish script, the publishing process will ask you to confirm each step before proceeding.

Once it is published to NPM, please update the settings of this package as follows:
- Have your security key or 2FA ready
- Go to `https://www.npmjs.com/package/@theia/<new-package>/access`
- Trusted `Publisher` > Select `GitHub Actions publisher` > Enter the required fields to our publish workflow (`publish-ci.yml`)
- Set `Publishing access` to `Require two-factor authentication and disallow tokens (recommended)`

Optional: Trigger the publish workflow for the `next` version once to verify the workflow can publish the new package as expected.

### 2.1.3 OPTION 1 (preferred): Perform the release via GH WORKFLOW
<!-- release: both -->

_NOTE:_ This publishing option is preferred, as the packages are built and signed on GitHub Actions with provenance using the trusted workflow for NPM publishing.

- Run the [_Publish packages to NPM_](https://github.com/eclipse-theia/theia/actions/workflows/publish-ci.yml) workflow
- Choose the release branch (i.e., `release/{{majorMinor}}.x`)
- Choose the respective release type and check the input option in case it is a patch for a previous version.

### 2.1.3.1 Check Package update PR
<!-- release: both -->

- The workflow automatically creates a PR to update the package versions for the release branch, see [example here](https://github.com/eclipse-theia/theia/pull/16438)
- Follow the instructions in the PR, to ensure all package versions are updated and change the author of the commits to you.
- Wait for the checks to succeed, then merge using `Rebase and Merge`.

### 2.1.4 OPTION 2: Perform the release LOCALLY
<!-- release: both -->

_NOTE:_ Performing the release locally will publish unsigned packages to NPM.

### 2.1.4.1 Prepare the release locally
<!-- release: both -->

- Ensure the release branch is checked out (i.e., `release/{{majorMinor}}.x`).

- Clean the working directory:

  ```bash
  git clean -xdf
  ```

- Build the changes:

  ```bash
  npm install && npm run build
  ```

- Confirm the changes are built (ensure `@theia` extensions have their `lib/` folders).

### 2.1.4.2 Publish the release locally
<!-- release: both -->

- The settings for publishing access were changed to the recommended: 'Require two-factor authentication and disallow tokens (recommended)'.
- To publish locally, you need to:
  - Ensure you are logged in to NPM (`npm login`; NPM will prompt you for an OTP (one-time password) or security key).
  - Have your 2FA ready, as you will need an OTP for the publishing process to complete.
- Optional: If you remove the `--yes` parameter from the publish scripts, the publishing process will ask you to confirm each step before proceeding..
- For example, a sample publishing run could look like this:

  ```bash
  npm run publish:next
  lerna notice
  ...
  lerna info

  Found 1 package to publish:
  - @theia/some-package => x.y.z

  ✔ Are you sure you want to publish these packages? Yes
  lerna info publish Publishing packages to npm...
  ✔ This operation requires a one-time password: <enter your OTP>
  lerna success published @theia/some-package x.y.z
  lerna notice 
  lerna notice 📦  @theia/some-package@x.y.z
  lerna notice === Tarball Contents === 
  ...
  lerna notice 
  Successfully published:
  - @theia/some-package@x.y.z
  lerna success published 1 package
  Done in ...s.
  ```

### 2.1.4.2.1 Minor Release 1.x.0
<!-- release: minor -->

- Perform the release:

  ```bash
  npm run publish:latest
  ```

  Select the appropriate version.

- Verify the packages are published on npm and with the correct tag. (e.g., check the core package <https://www.npmjs.com/package/@theia/core?activeTab=versions>)

- Remove the auth token:

  ```bash
  npm logout
  ```

### 2.1.4.2.2 Patch Release 1.x.z
<!-- release: patch -->

  _NOTE:_ For a patch release on an earlier version (e.g., 1.55.1 when 1.56.0 exists), use:

  ```bash
  npm run publish:patch
  ```
  
  For a patch to the current version use:

  ```bash
  npm run publish:latest
  ```

- Verify the packages are published on npm and with the correct tag. (e.g., check the core package <https://www.npmjs.com/package/@theia/core?activeTab=versions>)

- Remove the auth token:

  ```bash
  npm logout
  ```

### 2.1.4.3 Prepare the release branch
<!-- release: both -->

- Ensure the release branch is still checked out (i.e., `release/{{majorMinor}}.x`).

- Update `packages/core/README.md` in a commit ([example](https://github.com/eclipse-theia/theia/commit/21fa2ec688e4a8bcf10203d6dc0f730af43a7f58)).

  Commit message:
  
  ```md
  core: update re-exports for v{{version}}
  ```

- Add other changes in a commit named `v{version}`.
- Make sure to update ALL packages to the new version (search & replace)

  Commit message:
  
  ```md
  v{{version}}
  ```

- Push the branch.

### 2.1.5 Native dependencies
<!-- release: both -->

- Once the release branch has been updated (package updates):
  - Get the `native dependencies`
    - Run the [_Package Native Dependencies_](https://github.com/eclipse-theia/theia/actions/workflows/native-dependencies.yml) GitHub Action on the release branch (You can continue while you wait).
    - Download the artifacts (They are located on the build overview at the bottom).
    - Extract the downloaded folders.
    - Leave the dependencies for now, you will need them later.

### 2.1.6 Create the release PR against main
<!-- release: minor -->

- Create a PR against main (not needed for patch releases): <https://github.com/eclipse-theia/theia/compare>
  
  PR Title:
  
  ```md
  Theia v{{version}}
  ```

  - Wait for approval.
  - Merge using `Rebase and Merge` (**DO NOT `Squash and Merge`**).

- See for example: <https://github.com/eclipse-theia/theia/pull/16333>

### 2.1.7 Create the annotated Git Tag
<!-- release: both -->

- Tag the publishing commit after merging (for patch releases, tag directly on the release branch):

  ```bash
  git tag -a v{{version}} ${sha} -m "v{{version}}"
  ```

  _Note_: The tag needs to be annotated otherwise it might break the publishing. Check that the output of the following command is `tag` and not `commit`.

  ```bash
  git for-each-ref refs/tags | grep 'v{{version}}' | awk '{print $2}'
  ```

- Push the tag:

  ```bash
  git push origin v{{version}}
  ```

### 2.1.8 Create the GH Release - Minor Release 1.x.0
<!-- release: minor -->

- Create a GitHub release:
  - Draft a release on the [releases page](https://github.com/eclipse-theia/theia/releases/new).
  - Choose the appropriate `tag` and input the release title from below.
  - Use `generate release notes` for contributors and format like previous releases.
  - Reference the `changelog` and breaking changes.
  - Attach _Native Dependencies_ artifacts (the extracted zips).
    - native-dependencies-darwin-arm64.zip
    - native-dependencies-linux-x64.zip
    - native-dependencies-win32-x64.zip
  - Mark the release as `latest`
  - Select _"Publish Release"_.
  - See [GitHub documentation](https://help.github.com/en/github/administering-a-repository/managing-releases-in-a-repository#creating-a-release) for details.

Release Title:

```md
Eclipse Theia v{{version}}
```

### 2.1.9 Create the GH Release - Patch Release 1.x.z
<!-- release: patch -->

- Create a GitHub release:
  - Draft a release on the [releases page](https://github.com/eclipse-theia/theia/releases/new).
  - Choose the appropriate `tag` and input the release title from below.
  - Check the previous tag is correct.
  - Use `Generate release notes` for the changelog link.
  - Attach _Native Dependencies_ artifacts (the extracted zips).
    - native-dependencies-darwin-arm64.zip
    - native-dependencies-linux-x64.zip
    - native-dependencies-win32-x64.zip
  - Optional: Mark the release as `latest` (_Uncheck for a patch on an OLDER version!!_).
  - Select _"Publish Release"_.
  - See [GitHub documentation](https://help.github.com/en/github/administering-a-repository/managing-releases-in-a-repository#creating-a-release) for details.

Release Title:

```md
Eclipse Theia v{{version}}
```

Release Body:

```md
Based on https://github.com/eclipse-theia/theia/tree/v{{majorMinor}}.X

Includes the following fixes:
- <list of commits>

**Full Changelog**: should be generated via 'Generate release notes'
```

### 2.2 Community Releases
<!-- release: both -->

Community releases follow the same procedure as the regular releases. Please follow [2.1 Performing a Release](#21-performing-a-release).

## 3. Post-Release Steps
<!-- release: both -->

### 3.1 Eclipse Release
<!-- release: minor -->

- Login to [Eclipse Foundation Theia project page](https://projects.eclipse.org/projects/ecd.theia).
- Select `Release` / `Create a new release` from the menu.
  - `Release Date`: Enter the date.
  - `Name`: Enter the version (e.g., `1.55.0`).
- Go to Edit -> Project Plan
  - Add the changelog link to `deliverables` (Link with text `Release Notes`).
  - Add breaking changes link to `compatibility` (Link with text `Breaking Changes`).
- Save changes and confirm by reviewing the project page.

### 3.2 Announce Release Completion
<!-- release: both -->

### 3.2.1 Minor Release 1.x.0
<!-- release: minor -->

- Close the endgame issue: use the comment below as closing comment.

- Update the discussion and comment in the [Release discussion](#111-minor-release-1x0) that the release is completed: <https://github.com/eclipse-theia/theia/discussions/{{discussionNumber}}>

  ```md
  The [{{version}} release](https://github.com/eclipse-theia/theia/releases/tag/v{{version}}) has completed, thank you to everyone that participated and contributed!
  ```

- Mark the message as the answer

- Unpin discussion from the Release Announcement Category

### 3.2.2 Patch Release 1.x.z
<!-- release: patch -->

- Close the endgame issue: use the comment below as closing comment.

- Update the discussion and comment in the [Release discussion](#111-minor-release-1x0) that the release is completed: <https://github.com/eclipse-theia/theia/discussions/{{discussionNumber}}>

  ```md
  The [{{version}} patch release](https://github.com/eclipse-theia/theia/releases/tag/v{{version}}) has completed, thank you to everyone that participated and contributed!
  ```

- Mark the message as the answer

- Also send an email to [the `theia-dev` mailing List](mailto:theia-dev@eclipse.org):

    Subject:

    ```md
    Eclipse Theia v{{version}} patch release
    ```

    Body:

    ```md
    Hi everyone,

    The Eclipse Theia v{{version}} patch release has been published!
    See the release on GitHub for more information: https://github.com/eclipse-theia/theia/releases/tag/v{{version}}
    ```

### 3.3 Update Future Milestones
<!-- release: minor -->

- Close the current release [milestone](https://github.com/eclipse-theia/theia/milestones).
- Create the next two milestones if they do not already exist. Releases are typically on the last Thursday of the month, with possible exceptions.

### 3.4 Merge Website PRs
<!-- release: minor -->

- Merge all [website PRs marked with label `merge with next release`](https://github.com/eclipse-theia/theia-website/labels/merge%20with%20next%20release)

### 3.5 Publish GitHub Pages
<!-- release: minor -->

- Publish the `latest` documentation with the [GitHub Pages workflow](https://github.com/eclipse-theia/theia/actions/workflows/publish-api-doc-gh-pages.yml) manually using the `manual_dispatch` job.

### 3.6 Update Major Dependencies
<!-- release: minor -->

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
<!-- release: minor -->

Perform a `npm upgrade` on the repository after the release to update the `package-lock.json`. The upgrade helps to:

- Better represent what adopters will pull during a release.
- Validate dependencies with our declared version ranges.
- Fix known security vulnerabilities from dependencies.

To perform the upgrade:

- Run `npm upgrade` at the root of the repository.
- Fix any compilation errors, typing errors, and failing tests.
- Open a PR with the changes ([example](https://github.com/eclipse-theia/theia/pull/15688)).
- Run the license check review locally
- Wait for the "IP Check" to complete ([example](https://gitlab.eclipse.org/eclipsefdn/emo-team/iplab/-/issues/9377)).

Performing this after the release helps us to find issues with the new dependencies and gives time to perform a license check on the dependencies.

## 4. Troubleshooting
<!-- release: both -->

### 4.1 Failures During Publishing
<!-- release: both -->

If `lerna` fails during publishing (e.g., socket errors), use the following commands to reset and retry:

- Reset the repository:

  ```bash
  git reset --hard
  ```

- Retry publishing only the unpublished packages:

  ```bash
  npx lerna publish from-package --no-git-reset --no-git-tag-version --no-push
  ```
