# Node.js

- **Packages:** `engines.node` (root `package.json`), `@types/node`, `node-gyp`, `node-abi`, `@electron/rebuild`, `nan`; Node versions in `.github/workflows/*.yml`
- **Cadence:** on demand, following the Node.js LTS cadence: add a version when it becomes (or is about to become) _Active LTS_, drop the oldest when it leaves maintenance or blocks dependencies. Checked after every release (Publishing 3.6).
- **Docs:** [doc/runtime-policy.md](../../../../../doc/runtime-policy.md) (policy, update process), [doc/Developing.md](../../../../../doc/Developing.md) (Prerequisites, lockfile, Building on Windows), [doc/lockfile-maintenance.md](../../../../../doc/lockfile-maintenance.md), [Node.js release schedule](https://nodejs.org/en/about/previous-releases), the `doc/deprecations` and changelog of the new major

Split this file into `ISSUES.md` and `LOG.md` next to it once a section gets too long to scan.

## Steps

1. Root `package.json`: `engines.node` (`">=<oldest supported major>"`). It is the only Node `engines` entry that tracks support; leave `dev-packages/private-re-exports` (`>= 12`) alone.
2. `.github/workflows/ci-cd.yml`: the build/test `matrix.node` lists exactly the supported majors (e.g. `[24.x, 26.x]`). Find stale conditions on a matrix value (`matrix.node == '22.x'`) with `git grep -n 'matrix.node' .github`.
3. Single-version workflows use the _Active LTS_, not the newest version: the lint job in `ci-cd.yml`, `generate-sbom.yml` (`NODE_VERSION`), `license-check.yml`, `performance-tests.yml`, `playwright.yml`, `production-smoke-test.yml`, `publish-api-doc-gh-pages.yml`, `publish-ci.yml`, `translation.yml`, `copilot-sdk-mirror.yml`. Find them with `git grep -n -E 'node-version|node: \[|NODE_VERSION' .github/workflows`. A version that is not Active LTS yet goes into the matrix only (#17936); move these workflows once it is.
4. `@types/node`: the oldest supported major (runtime-policy). Bump it when the oldest version is dropped, not when a newer one is added.
5. Native build tooling: check `npm view node-gyp@latest engines` / `node-abi` and the release notes for the new major; bump `node-gyp` (and `@electron/rebuild`, `nan` when needed) in the root `package.json`. The hoisted `node-gyp` wins over the npm-bundled one for `node-gyp rebuild` scripts.
6. Remove workarounds and pins that only existed for the dropped version (e.g. `node-abi` 3.x pin, Node-pinned workflows); `git grep -n -i -E 'node ?<old major>'`.
7. Fix new deprecation warnings: run builds, tests and the backend with `NODE_OPTIONS=--trace-deprecation` on the new version (#17757, #17936).
8. Docs, replacing every old version number:
   - `doc/Developing.md`: Prerequisites (`Node.js >= N`, recommended default), "Updating dependencies and the lockfile" (CI Node versions), Windows build tools notes.
   - `doc/lockfile-maintenance.md`: which npm the supported Node versions ship and which Node to regenerate on.
   - `CLAUDE.md`: Technical Requirements (`Node.js ≥N`) and the lockfile-maintenance line (CI matrix).
   - `packages/core/src/node/backend-application.ts`: `dnsDefaultResultOrder` description links `latest-v<N>.x` docs; keep it on the oldest supported major.
   - `doc/runtime-policy.md` only if the policy itself changes.
9. `package-lock.json`: run `npm install` on the **oldest** supported Node so the root `engines` and tooling bumps land; the diff should be limited to those subtrees.
10. `CHANGELOG.md`: dropping a version is breaking for adopters, add a breaking-changes entry (`[core] ended support for Node.js 20`, #17079). #17936 skipped it; prefer adding one.
11. Follow-up: the Theia IDE needs the same engines/CI change (theia-ide PR 770 for Node 26).

## Coupled versions

| When this changes | Also update |
|---|---|
| Oldest supported major | `engines.node`, `@types/node` major, `dnsDefaultResultOrder` docs link, CHANGELOG breaking entry |
| New major in the matrix | `node-gyp` (13 for Node 26 on Windows), `@electron/rebuild` (4 for Node 24), `nan` |
| _Active LTS_ moves | single-version workflows, recommended default in `doc/Developing.md` |
| npm bundled with the oldest Node | `doc/lockfile-maintenance.md`, Node used to regenerate the lockfile |
| Electron's bundled Node | `native-dependencies.yml` `node-version` and `REMOTE_NODE_VERSION` in `packages/remote/src/electron-node/setup/remote-node-setup-service.ts`; owned by the [electron guide](../electron/GUIDE.md). The minimum supported Node should not exceed the Electron Node major, since plugins run on it in the Electron target. |
| `node-abi` / `node-gyp` raise their `engines` | either the minimum Node, or pin them (#15212) |

GitHub Actions runtime deprecations (`actions/*` running on node20) are action version bumps, not a Theia support change (#17147, #17460).

## Checks

- With every supported Node version: `npm ci`, `npm run compile`, `npm run test:theia`, `node scripts/verify-lockfile-platforms.js`. Native modules must build and load (`drivelist`, `node-pty`, `keytar`, `@parcel/watcher`, `native-keymap`).
- `npm run build:browser && npm run start:browser`, `npm run start:electron`.
- No new `DeprecationWarning` with `NODE_OPTIONS=--trace-deprecation` during build, tests and backend start.
- CI matrix on Windows, Linux and macOS; Windows native builds are usually only verifiable there.
- Run `playwright.yml` and `production-smoke-test.yml` on the branch when their Node version changes.

## Known issues

### `LINK : fatal error LNK1117` while building `drivelist` on Windows with Node 26

The Windows Node 26 build uses thin LTO and node-gyp < 13 propagates `-flto=thin` / `/opt:lldltojobs` from Node's `common.gypi` into MSVC builds (nodejs/node#64674). Bump `node-gyp` to `^13` (nodejs/node-gyp#3331). (#17936)

### `[DEP0205] DeprecationWarning: module.register() is deprecated` on every mocha run (Node 26)

`dev-packages/private-test-setup` registered the stylesheet stub loader with `module.register()`. Replaced with synchronous `module.registerHooks()` (Node >= 22.15). (#17936)

### Native rebuild fails on Node 24 with `@electron/rebuild` 3.x

`@electron/rebuild` 3 pulls its own `node-gyp` fork that does not work with Node 24. Bump to `@electron/rebuild` 4, which uses the root `node-gyp`. (#17079, issue #16220)

### `npm warn EBADENGINE ... node-abi@4.x required: { node: '>=22.12.0' }`

`node-abi` 4 requires Node 22 while older Node versions were still supported. Pinned to 3.x in #15212; the warning is harmless for the build and disappeared once the minimum reached Node 22 (#16218, #17079).

### `Could not find Chrome` in `Test (browser)` / `ENOENT: node_modules/electron/dist/version` on Node 24

Stream race in `extract-zip` 2.0.1 on Node 24 (electron/electron#51619), used by puppeteer, Electron's postinstall and Playwright's bundled extractor. Fixed by puppeteer 25 and a `yauzl` `^3.3.1` override, Playwright workflows temporarily pinned to Node 22 (#17575); override and pin removed with Electron >= 42.4 and playwright-core >= 1.60 (#17914).

### `[DEP0190]` / `[DEP0169]` warnings on Node 24

`spawn` with an args array plus `shell: true`, and legacy `url.parse()`. Build a single quoted command line; use `new URL()`. (#17757)

### VS Code extensions take browser code paths in the plugin host (Node 21+)

Node 21+ defines `globalThis.navigator`, which extensions use for browser detection. The plugin hosts undefine it, opt-in via `extensions.supportNodeGlobalNavigator`. (#17140, issue #16233)

### Flaky `test:theia` on Ubuntu with Node 22

The file watcher and listener of `LogLevelCliContribution` were not disposed. (#16272)

## Log

Newest first. One entry per merged update and target branch.

| Date | Branch | From → To | PR | Notes |
|---|---|---|---|---|
| 2026-08-27 | master | 22, 24 → 24, 26 (`>=24`) | #17936 | Node 26 in matrix only, other workflows stay on 24; `node-gyp` 11 → 13; `module.registerHooks`; `REMOTE_NODE_VERSION` / native deps aligned to Electron 42.8.1 (24.18.1); lockfile doc drops npm 10 rule; no CHANGELOG entry |
| 2026-07-14 | master | `@types/node` 22 → 24 | #17586 | bumped with Electron 42 while `engines` was still `>=22`, ahead of the policy |
| 2026-03-13 | master | `@types/node` 20 → 22 | #17151 | align with `>=22` |
| 2026-03-05 | master | 20, 22 → 22, 24 (`>=22`) | #17079 | workflows to 24; `@electron/rebuild` 4; Electron 39.7; `nan` 2.25.0; CHANGELOG breaking entry |
| 2025-09-02 | master | `>=20`, single-version workflows 20 → 22 | #16218 | `@types/node` 18 → 20; `node-gyp` 9 → 11; Python 3.13 in CI |
| 2025-07-15 | master | `engines` `>=18` → `>=20` | #15999 | part of the Electron 37.2.1 update |
| 2025-01-06 | master | matrix 18, 20 → 20, 22 | #14677 | part of the node-pty 1.1.0-beta27 update |
| 2024-08-19 | master | 16, 18, 20 → 18, 20 (`>=18`) | #14027 | CHANGELOG breaking entry |
| 2023-08-28 | master | 16 → 16, 18, 20 (`>=16`) | #12711 | `@types/node` 16 → 18; lint/workflows on 18; `node-gyp` installed explicitly (yarn era) |
| 2023-02-14 | master | 14, 16 → 16 (`>=16.14.0 <17`) | #12169 | Migration.md and CHANGELOG entries |
