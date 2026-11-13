---
name: update-dependency
description: Update a frequently updated dependency of the Theia framework (Electron, Monaco, VS Code API version, TypeScript, Node.js, React, AI provider SDKs, the post-release NPM upgrade) on master or on a release branch, and record what was learned. Use when asked to "update/upgrade/bump <dependency>", to backport a dependency update to a `release/x.y.x` branch, or to list outdated dependencies.
---

# Update a dependency

Each tracked technology has its own folder under `deps/` with a single `GUIDE.md`: the steps, the versions that move together, known issues and a log of past updates.
Read it before changing anything; it holds what earlier updates had to learn the hard way.

| Folder | Covers |
|---|---|
| [deps/electron](deps/electron/GUIDE.md) | `electron`, the Node.js version of the native dependencies workflow |
| [deps/monaco](deps/monaco/GUIDE.md) | `@theia/monaco-editor-core` uplifts |
| [deps/vscode-api](deps/vscode-api/GUIDE.md) | supported VS Code API version, `nls.metadata.json`, built-in extensions |
| [deps/typescript](deps/typescript/GUIDE.md) | `typescript` and the compiler configuration |
| [deps/nodejs](deps/nodejs/GUIDE.md) | supported Node.js versions, `engines`, CI matrix, `@types/node` |
| [deps/react](deps/react/GUIDE.md) | `react`, `react-dom` and their types |
| [deps/ai-sdks](deps/ai-sdks/GUIDE.md) | OpenAI, Anthropic, Google, MCP SDKs and default models |
| [deps/npm-upgrade](deps/npm-upgrade/GUIDE.md) | the `npm upgrade` after every release |

A technology without a folder: copy [deps/_template](deps/_template/GUIDE.md) and fill it as part of the update.

The release process around updates is documented in [doc/Publishing.md](../../../doc/Publishing.md) (3.6 Update Major Dependencies, 3.7 NPM Upgrade, 3.8 Electron Update), the support policy in [doc/runtime-policy.md](../../../doc/runtime-policy.md) and lockfile rules in [doc/lockfile-maintenance.md](../../../doc/lockfile-maintenance.md).
Link to them instead of repeating them.

## Workflow

1. **Scope.** Settle the dependency, the target version for every branch (master and/or `release/x.y.x`) and whether it is a regular or a security-driven update.
   For a community release, find the branch with `git branch -r --list 'origin/release/*'` and check which one the user means.
2. **Resolve the versions.** Confirm each target version is published (`npm view <pkg>@<version> version`); list newer patches of the same line.
   Never assume a version exists: stop and ask if it does not.
   Resolve the coupled versions listed in the GUIDE (e.g. the Node.js bundled with Electron).
3. **Read the GUIDE** of the technology, including the last log entries and known issues.
4. **Branch** from the target branch: `<dependency>-<version>` (e.g. `electron-44.9.1`), one branch per target branch.
5. **Change.** Follow the GUIDE steps. Find every pin of the old version with `git grep -n '<old-version>' -- ':!CHANGELOG.md'`.
   For an exact version bump with unchanged transitive dependencies, edit `package-lock.json` by hand (version, `resolved`, `integrity` from `npm view <pkg>@<version> dist.integrity`) instead of regenerating it, and confirm the diff is only those lines.
6. **Check.** Run `node scripts/verify-lockfile-platforms.js`, `npm ci`, `npm run lint`, `npm run build` and the tests the GUIDE asks for, plus its manual smoke test.
   If the environment cannot run a step (missing system libraries, no display), say which step was skipped and why; do not report it as passed.
7. **Record.** In the same branch, add a log entry to the GUIDE and every new issue or step learned on the way. This is the only way the skill changes.
8. **Commit and describe.** Conventional Commits (`chore(<dependency>): upgrade <Name> from <old> to <new>`), the body lists what changed beyond the version.
   Fill [.github/PULL_REQUEST_TEMPLATE.md](../../../.github/PULL_REQUEST_TEMPLATE.md) into a `pr.md` for the user; the PR base is the target branch.
9. **Follow-ups.** Release branch: the patch release follows [doc/Publishing.md](../../../doc/Publishing.md) (`<!-- release: patch -->` sections).
   Downstream: the Theia IDE needs the same update, see the GUIDE and Publishing 3.6.

## Rules

- The skill only changes in an update PR, together with the update it describes. No PR, no change to the skill.
- Every update PR adds one log entry per target branch. Known issues need a symptom and a verified fix.
- Security-driven updates: no vulnerability details in commits, PRs, issues, discussions or log entries. Write "pick up the latest fixes".
- Only breaking changes get a `CHANGELOG.md` entry.
- Nothing is pushed, published or posted without the user's confirmation.

## Patch release recovery

- `publish:check` in `publish-ci.yml` can fail with `E404` right after a successful `lerna publish` because the npm registry needs minutes to show new versions.
  Check `lerna success published <n> packages` in the log and `npm view <pkg>@<version> version` for every package.
  Do not re-run the workflow (it would publish the next patch version); create the skipped package update PR by hand: the commits `core: update re-exports for v<version>` and `v<version>`, each a pure version replacement.
