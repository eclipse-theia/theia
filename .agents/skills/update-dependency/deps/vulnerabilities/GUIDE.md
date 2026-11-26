# Dependency vulnerabilities (npm audit and Dependabot)

- **Packages:** every package in `package-lock.json` with an open advisory, reported by `npm audit` and by [Dependabot alerts](https://github.com/eclipse-theia/theia/security/dependabot)
- **Cadence:** part of every post-release run (baseline before the [NPM upgrade](../npm-upgrade/GUIDE.md), reduction after it); on demand when a critical or high alert comes in
- **Docs:** [doc/lockfile-maintenance.md](../../../../../doc/lockfile-maintenance.md), [npm overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#overrides), [SECURITY.md](../../../../../SECURITY.md)

Goal: reduce the known vulnerabilities in our dependencies as far as possible without breaking the build, and list the rest with a reason.

Split this file into `ISSUES.md` and `LOG.md` next to it once a section gets too long to scan.

## Steps

1. **Baseline** on the target branch before any change:
   - `npm audit --json > /tmp/audit-before.json`, counts from `.metadata.vulnerabilities` (critical / high / moderate / low).
   - Dependabot: `gh api 'repos/eclipse-theia/theia/dependabot/alerts?state=open&per_page=100' --paginate`.
     This needs a token with Dependabot alerts read access (security manager or admin); a plain PAT gets `HTTP 403`.
     If it fails, ask the user to open the [Dependabot page](https://github.com/eclipse-theia/theia/security/dependabot) and paste the open alerts (package, severity, manifest).
   - Merge both lists by package. Dependabot also reports alerts `npm audit` misses (other manifests, newer advisories) and vice versa.
2. In the post-release run, do the [NPM upgrade](../npm-upgrade/GUIDE.md) steps first; most advisories go away with the range alignment. Re-audit.
   On demand (a new critical or high alert between releases), skip the full upgrade and go to step 3; on a release branch, prefer the smallest fix that works.
3. For each remaining advisory, find who pulls it in: `npm ls <pkg>` and `npm audit --json | jq '.vulnerabilities["<pkg>"]'` (`via`, `fixAvailable`, `range`).
   Note whether it is a runtime dependency of a published `@theia/*` package (adopters get it) or dev/build tooling only (lerna, nx, mocha, esbuild, playwright). Runtime first.
4. Fix in this order, take the first one that works:
   1. Bump the range in the `package.json` that declares the package directly.
   2. Bump the parent that pulls it in (own dependency or a newer release of the tool).
   3. Root `overrides`, following [NPM upgrade step 4](../npm-upgrade/GUIDE.md#steps) (scoped to the parent, full lockfile regeneration, `npm ls <pkg>`).
   4. Drop the dependency if it is unused or only needed by optional tooling (e.g. `@vscode/vsce` in #18005, `less` in #17909).
   Never use `npm audit fix --force`; it installs semver-major downgrades/upgrades without review.
5. Re-check old overrides as in [NPM upgrade step 4](../npm-upgrade/GUIDE.md#steps): remove those nothing needs any more, keep their floors at or above the package's own range.
6. Anything left goes into "Currently not fixable" in the PR body: package, severity, why (no fixed release, unmaintained, needs a major migration, ESM-only, breaks types) and the follow-up issue.
   Open a follow-up issue for every package that needs a replacement or migration.
7. Final audit: `npm audit --json > /tmp/audit-after.json`; put the before/after counts into the PR body and the commit body.
8. Dependabot alerts that do not apply (e.g. dev-only code path, no fix possible): the user dismisses them in the UI with a reason after merge. Do not dismiss them yourself.

## Disclosure

Advisories of published npm packages are public; the last PRs name them like this:

- Allowed: severity counts before/after ("down from 1 critical / 8 high / 8 moderate / 10 low to 1 critical / 0 high / 3 moderate / 8 low"), package names with severity in "Currently not fixable", "override `<pkg>` (`<parent>`) to patched versions", "reduces npm audit from 27 to 12".
- Not allowed: advisory/CVE/GHSA ids, descriptions of the vulnerable code path or how to exploit it.
- A vulnerability in Theia's own code is never mentioned on GitHub at all; it goes through [SECURITY.md](../../../../../SECURITY.md).

## Coupled versions

| When this changes | Also update |
|---|---|
| A package is dropped or replaced | `allowScripts` in the root `package.json` if it had an install script; license check |
| A runtime dependency range of a published package | `packages/core/README.md` if it is re-exported |

## Checks

- `npm audit` counts went down; no new critical or high.
- The checks of the [NPM upgrade](../npm-upgrade/GUIDE.md#checks), including `npm ls` for every override.

## Known issues

### `opfs-worker` stays flagged after overriding `minimatch`

`opfs-worker` bundles `minimatch` into its `dist` (the import is only visible in the source maps); its declared `minimatch` dependency does not affect the shipped code, so an override changes nothing. Every release is in the range (checked with 2.3.1); wait for an upstream release built against minimatch 11. (after 1.77.0)

### `nx` and the lerna chain have no fixed release

The `minimatch` advisory range covers every `nx` release since 17.3 and the `@npmcli/*`, `sigstore`, `tuf-js` copies pulled by lerna 9; lerna 10 does not help. `npm audit` suggests lerna 8.1.4 as "fix", which is a downgrade; ignore it. (after 1.77.0)

### Overriding nested `minimatch` 9/10 to 11 breaks nx and typedoc

minimatch 11 removed `makeRe` and internal `Minimatch` members (`matchOne`, `regexp`, ...). typedoc fails with `mini.matchOne is not a function`, nx calls `minimatch.makeRe`. glob 14 is export-compatible with 10/11/13, but the version-keyed overrides needed (`glob@^13`) were rejected as too fragile. Leave the minimatch/glob tooling advisories to upstream releases. (after 1.77.0)

### `scanoss` pulls a vulnerable `stream-json`

`stream-json` 3.x is ESM-only with renamed paths, so an override breaks `scanoss`. Wait for `scanoss` to bump it. (#18005)

### `diff` cannot be overridden

Needs the `@theia/scm` migration first, see the [NPM upgrade known issue](../npm-upgrade/GUIDE.md#theiascm-stops-compiling-after-overriding-diff).

### `adm-zip` has no fixed release

The override is already on the latest version. (#18005)

## Log

Newest first. One entry per run. Record what is left open (severity and package), not counts; counts change with every new advisory.

| Date | Branch | Left open | PR | Notes |
|---|---|---|---|---|
| 2026-11-17 | master | moderate: `minimatch`/`glob` in tooling (lerna/nx, mocha, nyc, typedoc), `opfs-worker` (bundled), `stream-json` (scanoss); low: `diff`, `katex` (mermaid 11); no critical or high | #18420 | Range alignment; puppeteer 25.17.0 (zod 4 for chromium-bidi), minimatch 11 in our packages, rimraf 6, override `follow-redirects` (nx); `jsondiffpatch` override removed; `decompress` gone since #18207. |
| 2026-10-12 | master | critical: `decompress` | #18149 | Overrides `axios` (nx), `basic-ftp`. |
| 2026-09-15 | master | critical: `decompress`; no high | #18005 | Overrides `pacote`, `smol-toml`, `jsondiffpatch`, `qs`, `@tootallnate/once`; `@vscode/vsce` dropped. |
| 2026-08-12 | master | critical: `decompress`; no high | #17909 | Overrides `tar`, `adm-zip`, `uuid`, `serialize-javascript`, `js-yaml`, `dompurify`; `less` removed. |
