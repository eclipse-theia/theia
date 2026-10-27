# NPM upgrade

- **Packages:** all of them: `package-lock.json`, the ranges in every workspace `package.json`, root `overrides` and `allowScripts`
- **Cadence:** after every minor release on master (one PR per release); not on release branches
- **Docs:** [doc/Publishing.md 3.7 NPM Upgrade](../../../../../doc/Publishing.md#37-npm-upgrade), [doc/lockfile-maintenance.md](../../../../../doc/lockfile-maintenance.md), [doc/pull-requests.md](../../../../../doc/pull-requests.md) (license check), [dash-licenses Node.js wrapper](https://github.com/eclipse-dash/nodejs-wrapper)

Split this file into `ISSUES.md` and `LOG.md` next to it once a section gets too long to scan.

## Steps

1. Branch from master, e.g. `npm-upgrade-1.77.0`. Use the npm bundled with a supported Node.js (npm 11.19+), never an older global npm (see Known issues).
2. Run `npm upgrade --save` at the root (Publishing 3.7). It rewrites the lockfile and aligns the ranges in all `package.json` files with the resolved versions.
3. Review the `package.json` diff by hand and revert ranges that must not move:
   - `@types/vscode` in `sample-plugins/*/*`: keep the floor at the `engines.vscode` value (#18005).
   - Exact pins and tilde ranges that exist on purpose (e.g. `ssh-config` `~5.0.x` in `@theia/remote`, `diff`/`@types/diff` 5.x in `@theia/scm`, `perfect-scrollbar` `1.5.5` override). Check `git log -S'<pkg>' -- '<file>'` before changing one.
4. Root `overrides`: only for transitive packages no range bump can reach. Scope them to the parent when possible (`"nx": { "axios": … }`). Remove an override once nothing needs it any more (efcce0a7b dropped `yauzl`).
   After adding or changing an override, delete `package-lock.json` and run `npm install`; npm does not re-resolve a locked edge for a new override (#18005, #18149). Confirm with `npm ls <pkg>` (no `invalid`).
5. Sync `allowScripts` in the root `package.json` with every lockfile entry that has `hasInstallScript` (`true` if needed, `false` if cosmetic), see lockfile-maintenance.md.
6. Fix compile errors and failing tests caused by new transitive types (see Known issues). Keep code changes minimal and comment casts.
7. Commit the regenerated `packages/core/README.md` (re-export versions, rewritten by `afterInstall` → `generate-theia-re-exports`).
8. Packages that cannot be upgraded (major with API changes, ESM-only, breaks types): leave them, list them under "Currently not fixable" in the PR body, follow up separately. The Electron version moves in its own update (deps/electron), not here.
9. Commit `chore(deps): NPM upgrade after <version>` with a bullet list: ranges aligned, overrides added/removed, code adaptations, held-back packages.
10. License check: run `npm run license:check:review` locally with a committer's Eclipse GitLab PAT in `DASH_TOKEN`. It opens one IP Lab ticket per unvetted package; post the ticket links as a PR comment. Merge only once the "3PP License Check" workflow is green (all tickets approved).

## Coupled versions

| When this changes | Also update |
|---|---|
| A resolved version in `package-lock.json` | The range in the declaring `package.json` (done by `--save`), `packages/core/README.md` for re-exported packages |
| A dependency gains or loses an install script | `allowScripts` in the root `package.json` |
| An override is added or changed | Full lockfile regeneration; floors of root overrides should not lag behind the package's own range (e.g. `dompurify`) |
| `engines.vscode` in sample plugins | Floor of `@types/vscode` there |
| dash-licenses snapshot version | `scripts/fetch-dash-licenses-jar.js`, `configs/license-check-config.json` |

## Checks

- `node scripts/verify-lockfile-platforms.js` (`libc` fields, `allowScripts` cross-check; also runs in CI).
- `git diff --stat`: besides the lockfile only `package.json` files, `packages/core/README.md` and intended code fixes.
- `npm ci`, `npm run lint`, `npm run build`, `npm run test` (unit tests changed in #15688 because of new HTML attribute order).
- `npm run build:browser-only` if `@theia/filesystem` browser-only deps moved (`tar-stream`, #18005).
- `npm ls` for every package in `overrides`.
- `npm run license:check` (and `:review`, step 10).
- Smoke test: start browser and Electron examples; open the search-in-workspace input, SCM commit box and a notebook cell (React typing fixes landed there); if the MCP SDK moved, call the sample `test-tool` via the Theia MCP server.

## Known issues

### `npm ci` fails on Alpine / macOS / Windows CI after regenerating the lockfile

npm 10 (Node 22) pruned platform-specific optional deps (`@esbuild/*`, `@nx/nx-*`, `@parcel/watcher-*`) and `libc` fields for other platforms. Regenerate with the npm bundled with Node 24+; `verify-lockfile-platforms.js` catches missing `libc` fields. (#17741, 5ef180bee, 75c28f857)

### Override in `package.json` but `npm ls` still shows the old version as `invalid`

npm keeps the already locked edge when an override is added. Delete `package-lock.json` and regenerate. (#18005 for `uuid` under `trash`, #18149 for `uuid` and `@tootallnate/once`)

### `vsce package` of the sample plugins refuses: `@types/vscode` greater than `engines.vscode`

`--save` raised the `@types/vscode` floor above `engines.vscode`. Revert to the engine version; the caret still installs newer types. (#18005)

### React compile errors around `onResize` and `TextareaAutosize` props

`@types/react` updates changed the DOM prop types. Drop `onResize` filtering, pass `onPointerEnterCapture={undefined}` etc. (#13748, #15688)

### Duplicate `@types/express` / `@types/express-serve-static-core` type conflicts

Dependencies declaring `"@types/express": "*"` pulled 5.x next to 4.x. Pin `@types/express` to `^4.17.x` in root devDependencies; a temporary override of `@types/express-serve-static-core` was removed again in the next upgrade. (#15147, #15415)

### `entry.end()` in the browser-only download service no longer compiles

`tar-stream` 3.2.1 ships its own types (via `streamx`) that shadow `@types/tar-stream`. Call `entry.end(undefined)`. (#18005)

### MCP `registerTool` `inputSchema` no longer type-checks

`@modelcontextprotocol/sdk` resolves `zod/v4/core` through the hoisted zod 3.25 while `@theia/ai-mcp-server` uses zod 4. Cast to the SDK's `AnySchema`; pass a raw shape (`{}`) instead of `z.object({})` in the sample. (#17741)

### `@theia/scm` stops compiling after overriding `diff`

An override to `diff` 8 hoists it to the root and its bundled types replace `@types/diff@5` (`ArrayDiff` missing). Do not override `diff` until `@theia/scm` migrates. (#17909, #18005)

### Build breaks after `ssh-config` minor bump

`ssh-config` 5.1+ breaks the `@theia/remote` build; keep `~5.0.x`. (#17151)

### `npm install` fails on a fresh checkout because of an ESLint plugin

`eslint-plugin-no-unsanitized` 4.1.5 dropped ESLint 8 while declared as `latest`. Pin it (4.1.4) and `eslint-plugin-no-null` (1.0.2). (#17151)

### Electron postinstall fails sporadically on Node 24 (`extract-zip` race)

`yauzl` 3.4.0 reintroduced the race; the override was held at `~3.3.2` and removed once Electron 42.4 dropped `extract-zip`. (#17741, 98c400291, efcce0a7b)

### License check cannot download `dash-licenses.jar`

The wrapper used a broken Nexus 2 URL after the repo.eclipse.org upgrade, and 1.1.0 reports workspace packages as restricted. `scripts/fetch-dash-licenses-jar.js` (run by `license:check*`) pre-downloads 1.1.1-SNAPSHOT. (#17169, #17718)

### License check blocked for weeks by IP review of a new transitive package

`@vscode/vsce-sign-*` needed a "works with" approval. The tool was pinned to an older version, later removed from the lockfile entirely (fetched via `npx @vscode/vsce@3`). Prefer dropping dev tooling over waiting for IP review. (#13748, #18005)

## Log

Newest first. One entry per merged update and target branch.

| Date | Branch | From → To | PR | Notes |
|---|---|---|---|---|
| 2026-10-12 | master | after 1.76.0 | #18149 | Ranges aligned (incl. `@playwright/test` 1.63.0), `simple-git` 4.0.2 in ai-ide, scoped overrides for `axios` (nx) and `basic-ftp`, full regen so `uuid`/`@tootallnate/once` overrides apply. |
| 2026-09-15 | master | after 1.75.0 | #18005 | Overrides `pacote` (lerna), `smol-toml` (nx), `jsondiffpatch`, `qs` (express), `@tootallnate/once`; `tar-stream` type fix; `@types/vscode` held in sample plugins; `@vscode/vsce` dev dep and platform-restore tooling dropped. Held back: `decompress` (needs replacement), `ai`/`@ai-sdk/*` (v5 migration), `diff`, `stream-json` via `scanoss`. |
| 2026-08-12 | master | after 1.74.x | #17909 | Unused `less` removed; overrides `tar`, `adm-zip`, `uuid`, `serialize-javascript`, `js-yaml`, `dompurify`; `brace-expansion`/`@typescript-eslint/utils` overrides scoped. Held back: `electron` (own update), `@vscode/proxy-agent` (API change in `plugin-host-proxy.ts`), `diff`, `decompress`. |
| 2026-07-13 | master | after 1.73.x | #17741 | MCP SDK typing fixes; `yauzl` override `~3.3.2`; majors: esbuild 0.28, mocha 11, electron-mocha 13, nyc 18, dockerode 5, copy/compression-webpack-plugin, scanoss, vsce 3; lockfile-maintenance.md added. |
| 2026-06-18 | master | after 1.72.x | #17589 | Ranges aligned; ~40 IP tickets. |
| 2026-05-08 | master | after 1.71.x | #17446 | Ranges aligned; rebased over the esbuild switch. |
| 2026-04-10 | master | after 1.70.x | #17282 | First upgrade with range alignment. |
| 2026-03-13 | master | range alignment | #17151 | Root ranges aligned, `ssh-config` `~5.0.3`, ESLint plugins pinned, `@types/node` 22; jar download broken, checked locally. |
| 2026-03-03 | master | after 1.68.x | #16920 | Lockfile only. |
| 2025-11-17 | master | after 1.66.x | #16516 | Lockfile only. |
| 2025-10-03 | master | after 1.65.x | #16357 | Lockfile only. |
| 2025-09-11 | master | after 1.64.1 | #16264 | After Node 18 drop; `minimatch` in ai-ide aligned down to the repo version (mocha). |
| 2025-08-13 | master | after 1.62.0 | #15688 | `@types/react` fixes (notebook cell editor, search textarea), test assertions; IP review took ~2 months. |
| 2025-04-15 | master | after 1.60.0 | #15415 | Removed `@types/express-serve-static-core` pin. |
| 2025-03-12 | master | after 1.59.0 | #15147 | `@types/express` pinned; `preload.ts` typings, `Buffer` conversion in remote. |
| 2024-12-11 | master | after 1.50.0 | #13748 | `yarn upgrade`; `TextareaAutosize` props, dockerode stream check; open ~6 months (IP review of `vsce-sign-*`). |
| 2024-05-10 | master | after ~1.46.0 | #13423 | `yarn upgrade`, lockfile only. |
| 2024-02-21 | master | after 1.46.0 | #13312 | `yarn upgrade`, lockfile only. |
