# Electron

- **Packages:** `electron` (exact peer dependency of `@theia/electron`, devDependency of `examples/electron`)
- **Cadence:** after every release together with the NPM upgrade; on release branches for patch releases that need the latest fixes; on demand when an Electron bug hits users
- **Docs:** [Publishing 3.8 Electron Update](../../../../../doc/Publishing.md#38-electron-update), [runtime-policy.md](../../../../../doc/runtime-policy.md#electron), [Electron breaking changes](https://www.electronjs.org/docs/latest/breaking-changes), [stable releases](https://www.electronjs.org/releases/stable)

## Steps

1. Verify the target exists: `npm view electron@<version> version` (44.5.3 was once requested; 44.5.x ends at 44.5.1).
   Compare `npm view electron@<old> dependencies` with `npm view electron@<new> dependencies`.
2. Resolve the bundled Node.js version:
   `curl -s https://raw.githubusercontent.com/electron/electron/v<version>/DEPS | grep -A1 node_version` (releases.electronjs.org may be unreachable from a sandbox).
3. Change the pins (`git grep -n '<old-version>' -- ':!CHANGELOG.md'`):
   - `packages/electron/package.json` `peerDependencies.electron` (exact, no `^` since #14407)
   - `examples/electron/package.json` `devDependencies.electron`
   - `package-lock.json`, 3 places: `examples/electron` devDependencies, `node_modules/electron` (`version`, `resolved`, `integrity` from `npm view electron@<v> dist.integrity`), `packages/electron` peerDependencies
   - re-export lists in `packages/core/README.md` and `packages/electron/README.md` (version in text and npm URL)
   - `.github/workflows/native-dependencies.yml`: step name `Use Node.js v<node>` and `node-version`, both the bundled Node.js version
   - `REMOTE_NODE_VERSION` in `packages/remote/src/electron-node/setup/remote-node-setup-service.ts`, see Coupled versions
4. Lockfile: if Electron's own dependencies are unchanged, edit the 3 places by hand. `npm install --package-lock-only` gives the same result, but in a sandbox it can drop unrelated `hasInstallScript` lines; never commit those.
   If dependencies changed, regenerate per [lockfile-maintenance.md](../../../../../doc/lockfile-maintenance.md) and run `node scripts/verify-lockfile-platforms.js`.
5. Major version: read the breaking changes of every skipped major and adapt the code. Past adaptions:
   - 44: clipboard is async (W3C Clipboard API) and no longer available in the renderer; read via `ipcMain.handle`/`ipcRenderer.invoke`, `readClipboard()` and `ElectronClipboardService.readText()` return `Promise<string>` (#18150)
   - 42: no `postinstall` binary download; `prepareElectron()` runs `electron/install.js` (#17586)
   - 36 (from 30): `File.path` gone, preload exposes `webUtils.getPathForFile()` for drag and drop (#15837)
   - 33+: `document.execCommand('paste')` deprecated, `enableDeprecatedPaste: true` in `webPreferences` (#15918)
6. Major version: add a breaking-changes entry to `CHANGELOG.md` (downstream apps must update their `electron` devDependency; link the Electron breaking changes of each major). Patch/minor bumps get none.
7. Run the license check (`npm run license:check`, `license:check:review` for new content). Every new Electron version gets an Eclipse IP lab ticket; link it in the PR.
8. Follow-ups: Theia IDE ticket with `toDoWithRelease` and `dependencies` labels (Publishing 3.8).
   On a release branch the native dependency zips attached to the GitHub release are built from the browser example backend with plain Node; all Node 24.x share one ABI, so a patch release that only bumps Electron can reuse the previous release's zips.

## Coupled versions

| When this changes | Also update |
|---|---|
| Node.js bundled in Electron | `native-dependencies.yml` step name and `node-version` |
| Node.js bundled in Electron | `REMOTE_NODE_VERSION` in `packages/remote/.../remote-node-setup-service.ts` (bumped with 37.2.1, 38.x, 44.4.5 and in f1c0746c1; missed by #18244 and #18245) |
| Node.js major bundled in Electron (22 → 24 with Electron 42) | `@types/node`, possibly `engines.node`, see [deps/nodejs](../nodejs/GUIDE.md) |
| V8 major | native modules rebuilt against Electron (`DEFAULT_MODULES` in `dev-packages/application-manager/src/rebuild.ts`), `nan`, compiler requirements |
| `@electron/rebuild` major | its `node-gyp` (v3 used a fork that failed on Node 24, #17079) |
| Electron major | `electron-mocha` (12.3 was needed for Electron 28, #13580) |

## Checks

- `npm ci` needs X11 dev headers (`libx11-dev`, `libxkbfile-dev`) for `native-keymap`.
- `npm run build` (rebuilds native modules for Electron), `npm run lint`.
- `xvfb-run -a npm run test:electron` (Electron smoke test, revived in #17335; needs a display).
- Manual: `npm run start:electron`; open a workspace, edit and save, terminal, menus, secondary windows, native dialogs, copy/paste in editor, terminal, input fields and Explorer. For a major also `vscode.env.clipboard` from an extension and the splash screen.
- Test on Linux, macOS and Windows for a major (Publishing 3.8); Electron E2E on CI only runs on Linux.

## Known issues

### `error: expected identifier before '__attribute__'` in `v8-primitive.h` during the native rebuild

GCC < 13 cannot compile the V8 headers of Electron 44; ubuntu-22.04 ships GCC 11/12. CI builds native modules with Clang (8296297cb); locally use GCC 13+ or `CC=clang CXX=clang++ npm run build:electron`. Documented in `doc/Developing.md`. (#18150)

### `cpu-features` fails to compile against Electron's V8 14.8

NAN ≤ 2.27.0 breaks with V8 14.8 (Electron 42). `ssh2`/`cpu-features` were removed from `DEFAULT_MODULES` so they are not rebuilt; `ssh2` uses its pure-JS fallback. Re-add once NAN supports the V8 version. (#17586)

### ffmpeg replacement fails because `node_modules/electron/dist` is missing

Electron 42 dropped the `postinstall` download. `prepareElectron()` in `application-package-manager.ts` runs `electron/install.js` when `dist/version` is absent. (#17586)

### Sporadic `ENOENT: node_modules/electron/dist/version` on Node 24

Stream race in `extract-zip@2.0.1` used by Electron's postinstall. Worked around with a `yauzl` override (#17575); Electron 42.4.0 switched to `@electron-internal/extract-zip`, so the override was dropped (#17914 on master, #18106 on release/1.74.x). If a release branch still has Electron < 42.4.0, keep the override.

### `npm ci` fails building native modules on Node 24 with `@electron/rebuild` 3

v3 pulls its own `node-gyp` fork. Upgraded to `@electron/rebuild` 4, which uses the repo's `node-gyp`. (#17079)

### Pasting into input fields does nothing in Electron

`document.execCommand('paste')` is deprecated since Electron 33. Set `enableDeprecatedPaste: true` in the window `webPreferences`. (#15918)

### `Gtk-ERROR: GTK 2/3 symbols detected. Using GTK 2/3 and GTK 4 in the same process is not supported`

Electron 36.4.0 failed to start on some Linux systems (electron/electron#46538). Fixed by 37.2.1, backported to release/1.63.x. (#15999)

### Window control buttons on the wrong side

Regression in Electron 38.3.0 (electron/electron#48422), fixed in 38.4.0. (#16477)

### Windows crash when hovering or clicking the splash screen during startup

Electron 39.6.1 to 39.8.0, fixed in 39.8.1; Theia went to 39.8.7, also on release/1.70.x. (#17329)

### macOS x86_64: `libffmpeg.dylib` incompatible architecture (have 'arm64')

Electron 30.3.1 shipped an arm64 ffmpeg for x64; the `^30.1.2` range picked it up. Electron is pinned exactly since. (#14407)

### License check: results that aren't part of the baseline

New transitive tooling (`electron-mocha`, `@electron/node-gyp`, `@electron/rebuild`) may not be known to ClearlyDefined. Request harvesting or an IP lab review. (#13580, #15837)

## Log

Newest first. One entry per merged update and target branch.

| Date | Branch | From → To | PR | Notes |
|---|---|---|---|---|
| 2026-10-23 | master | 44.4.5 → 44.9.1 | #18244 | Latest fixes. Workflow Node 24.22.1. `REMOTE_NODE_VERSION` not bumped (still 24.21.0). |
| 2026-10-23 | release/1.74.x | 42.11.8 → 42.11.16 | #18245 | Latest fixes, released as v1.74.3. Workflow Node 24.22.1; lockfile edited by hand; native zips reused from v1.74.2. |
| 2026-10-13 | master | 42.8.1 → 44.4.5 | #18150 | Breaking: async clipboard (`readClipboard()`, `ElectronClipboardService.readText()` return promises), macOS 13+, 64-bit only. Clang for native modules on Linux CI (8296297cb). Node 24.21.0 in workflow and `REMOTE_NODE_VERSION`. Publishing 3.8 / runtime policy added (e16adde42). |
| 2026-09-30 | release/1.74.x | 42.3.0 → 42.11.8 | #18106 | Latest fixes for v1.74.2. Workflow Node 24.19.0; `yauzl` override dropped. |
| 2026-08-17 | master | 42.3.0 → 42.8.1 | #17914 | `yauzl` override dropped; Playwright workflows back on Node 24. Workflow Node and `REMOTE_NODE_VERSION` aligned to 24.18.1 later in f1c0746c1. |
| 2026-07-14 | master | 39.8.7 → 42.3.0 | #17586 | Breaking: Node 24, Chromium 148. `install.js` in `prepareElectron()`, `ssh2`/`cpu-features` out of the rebuild list, `@types/node` 24, `nan` removed. Workflow Node 24.15.0. |
| 2026-04-10 | release/1.70.x | 39.7.0 → 39.8.7 | #17329 | Cherry-pick, released as v1.70.2. |
| 2026-04-10 | master | 39.7.0 → 39.8.7 | #17329 | Windows splash screen crash. |
| 2026-03-05 | master | 38.4.0 → 39.7.0 | #17079 | Part of Node 24 support: `@electron/rebuild` 4, `nan` 2.25.0, Node 20 dropped. |
| 2025-10-29 | master | 37.2.1 → 38.4.0 | #16477 | 38.3.0 first, moved to 38.4.0 for window controls. Workflow Node, `REMOTE_NODE_VERSION`, Gitpod to 22.20.0. |
| 2025-07-15 | release/1.63.x | 36.4.0 → 37.2.1 | #15999 | Backport, released as v1.63.3. |
| 2025-07-15 | master | 36.4.0 → 37.2.1 | #15999 | Linux GTK startup crash. Node 22.17.0 in workflow, `REMOTE_NODE_VERSION`, Gitpod; `engines.node` >=20. |
| 2025-06-23 | master | 30.1.2 → 36.4.0 | #15837 | `electron-rebuild` → `@electron/rebuild` 3, `nan` 2.22.2, `node-abi`, `webUtils.getPathForFile()`. Workflow Node 18.17.0 → 22.15.1; global `node-gyp` installs removed from workflows. Paste fix followed (#15918). |
| 2024-11-05 | master | ^30.1.2 → 30.1.2 | #14407 | Exact pin (macOS x86 ffmpeg). |
| 2024-08-21 | master | ^28.2.8 → ^30.1.2 | #14041 | `nan` resolution 2.20.0; breaking-changes changelog entry. |
| 2024-05-07 | master | ^23.2.4 → ^28.2.8 | #13580 | Matched VS Code. `electron-mocha` 12.3.0; `process.off` type cast in `rebuild.ts` (Electron/Mocha type clash). |
| 2023-04-27 | master | ^22.3.2 → ^23.2.4 | #12464 | Native menu fix. |
| 2023-04-19 | master | ^15.3.5 → ^22.3.2 | #12299 | With context isolation, no Node integration in the renderer, `@electron/remote` removed. |
