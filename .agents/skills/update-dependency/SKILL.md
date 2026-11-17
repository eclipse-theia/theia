---
name: update-dependency
description: Update dependencies of the Theia framework and record what was learned. Its main use is the post-release dependency update after every minor release (NPM upgrade that reduces dependency vulnerabilities reported by npm audit and Dependabot, Electron update, Node.js/React check). Also covers single updates on demand (Electron, Monaco, TypeScript, Node.js, React, AI provider SDKs, vulnerable dependencies), on master or a `release/x.y.x` branch. Use when asked for the "post-release update", "npm upgrade", "update/upgrade/bump <dependency>", to reduce dependency vulnerabilities or npm audit findings, or to list outdated dependencies. Not for the VS Code API version bump.
---

# Update dependencies

Each tracked technology has its own folder under `deps/` with a single `GUIDE.md`: the steps, the versions that move together, known issues and a log of past updates.
Read it before changing anything; it holds what earlier updates had to learn the hard way.

| Folder | Covers |
|---|---|
| [deps/npm-upgrade](deps/npm-upgrade/GUIDE.md) | the `npm upgrade` after every release |
| [deps/vulnerabilities](deps/vulnerabilities/GUIDE.md) | reducing dependency vulnerabilities from `npm audit` and Dependabot, overrides, "Currently not fixable" |
| [deps/electron](deps/electron/GUIDE.md) | `electron`, the Node.js version of the native dependencies workflow |
| [deps/nodejs](deps/nodejs/GUIDE.md) | supported Node.js versions, `engines`, CI matrix, `@types/node` |
| [deps/react](deps/react/GUIDE.md) | `react`, `react-dom` and their types |
| [deps/typescript](deps/typescript/GUIDE.md) | `typescript` and the compiler configuration |
| [deps/monaco](deps/monaco/GUIDE.md) | `@theia/monaco-editor-core` uplifts |
| [deps/ai-sdks](deps/ai-sdks/GUIDE.md) | OpenAI, Anthropic, Google, MCP SDKs |

Not covered here: the VS Code API version, `nls.metadata.json` and built-in extensions (separate monthly update), and the default LLM models (`update-default-models` skill).

A technology without a folder: copy [deps/_template](deps/_template/GUIDE.md) and fill it as part of the update.

The release process around updates is documented in [doc/Publishing.md](../../../doc/Publishing.md) (3.6 Update Major Dependencies, 3.7 NPM Upgrade, 3.8 Electron Update), the support policy in [doc/runtime-policy.md](../../../doc/runtime-policy.md) and lockfile rules in [doc/lockfile-maintenance.md](../../../doc/lockfile-maintenance.md).
Link to them instead of repeating them.

## Modes

- **Post-release** (default after a minor release, "post-release update", "npm upgrade after 1.x.0"): the run below.
- **Single update** ("update Electron to 44.9.1", "bump TypeScript", a backport to `release/x.y.x`): the general workflow with the GUIDE of that technology.

## Post-release run

Runs after every minor release `1.x.0` (Publishing 3.6 to 3.8), on the branch the user has checked out (see Branches). Two PRs, one decision list.

1. **Release check.** Confirm the release tag exists (`git tag -l 'v1.x.0'`) and the checked-out branch contains it (`git merge-base --is-ancestor v1.x.0 HEAD`). Note the start commit (`git rev-parse HEAD`); all diffs of this run are against it. Read the last log entries of `deps/npm-upgrade`, `deps/vulnerabilities` and `deps/electron`, and the follow-ups of the previous NPM upgrade PR.
2. **Vulnerability baseline:** [deps/vulnerabilities](deps/vulnerabilities/GUIDE.md) step 1 (`npm audit` and Dependabot). Show the user the counts and the list before changing anything.
3. **NPM upgrade PR:** [deps/npm-upgrade](deps/npm-upgrade/GUIDE.md), including the vulnerability reduction from deps/vulnerabilities.
4. **Electron PR, separate:** [deps/electron](deps/electron/GUIDE.md) to the latest stable. Never in the NPM upgrade commit: ask the user whether to continue on the current branch (own commit, split into its own PR later) or wait until they have checked out another branch.
5. **Major dependency check** (Publishing 3.6): compare Node.js LTS and React with the versions in [deps/nodejs](deps/nodejs/GUIDE.md) and [deps/react](deps/react/GUIDE.md). Do not update them in this run; draft the Publishing 3.6 ticket text for the user if an update is due.
   Also list majors held back by the NPM upgrade (`npm outdated`) that need their own update.
6. **Report** to the user: the commits with a `pr.md` per PR, audit counts before/after, "Currently not fixable" with suggested follow-up issues, the 3.6 decision, and the Theia IDE follow-ups (Publishing 3.6/3.8 ticket with `toDoWithRelease` and `dependencies` labels).

## General workflow

1. **Scope.** Settle the dependency, the target version for every branch (master and/or `release/x.y.x`) and whether it is a regular update or one to fix a vulnerable version.
   For a release branch, find it with `git branch -r --list 'origin/release/*'` and check which one the user means.
2. **Resolve the versions.** Confirm each target version is published (`npm view <pkg>@<version> version`); list newer patches of the same line.
   Never assume a version exists: stop and ask if it does not.
   Resolve the coupled versions listed in the GUIDE (e.g. the Node.js bundled with Electron).
3. **Read the GUIDE** of the technology, including the last log entries and known issues.
4. **Branch.** Work on the branch the user has checked out (see Branches). If the target branch needs a different base (e.g. a `release/x.y.x` backport), tell the user and wait for them to check it out.
5. **Change.** Follow the GUIDE steps. Find every pin of the old version with `git grep -n '<old-version>' -- ':!CHANGELOG.md'`.
   For an exact version bump with unchanged transitive dependencies, edit `package-lock.json` by hand (version, `resolved`, `integrity` from `npm view <pkg>@<version> dist.integrity`) instead of regenerating it, and confirm the diff is only those lines.
6. **Check.** Run `node scripts/verify-lockfile-platforms.js`, `npm ci`, `npm run lint`, `npm run build` and the tests the GUIDE asks for, plus its manual smoke test.
   If the environment cannot run a step (missing system libraries, no display), say which step was skipped and why; do not report it as passed.
7. **Record.** In the same branch, add a log entry to the GUIDE and every new issue or step learned on the way.
8. **Commit and describe.** Conventional Commits (`chore(<dependency>): upgrade <Name> from <old> to <new>`, `chore(deps): NPM upgrade after <version>`), the body is a flat bullet list of what changed beyond the version.
   Fill [.github/PULL_REQUEST_TEMPLATE.md](../../../.github/PULL_REQUEST_TEMPLATE.md) into a `pr.md` for the user; the PR base is the target branch.
9. **Follow-ups.** Release branch: the patch release follows [doc/Publishing.md](../../../doc/Publishing.md) (`<!-- release: patch -->` sections).
   Downstream: the Theia IDE needs the same update, see the GUIDE and Publishing 3.6.

## Branches

- The user chooses and checks out the branch, possibly on top of other work (e.g. the branch with this skill). Work and commit there.
- Never create, switch, rebase, reset or delete branches, and never create worktrees, unless the user asks for it.
- If the checked-out branch looks wrong (e.g. `master` or a `release/*` branch itself, uncommitted changes of someone else), say so and ask; do not fix it yourself.
- Compare against the start commit of the run, not against `master`, when checking diffs, so commits below the run do not count as changes.
- Suggested branch names for the user, if asked: `npm-upgrade-<version>`, `<dependency>-<version>` (e.g. `electron-44.9.1`).

## Rules

- The skill changes together with an update: every update PR adds one log entry per target branch and the issues it learned. Known issues need a symptom and a verified fix.
- Advisories of npm dependencies: counts, package names and severity are fine; no advisory/CVE/GHSA ids or exploit details (see [deps/vulnerabilities](deps/vulnerabilities/GUIDE.md#disclosure)). A vulnerability in Theia itself never goes to GitHub, see `SECURITY.md`.
- Only breaking changes get a `CHANGELOG.md` entry.
- Nothing is pushed, published or posted, and no Dependabot alert is dismissed, without the user's confirmation.
