# Monaco

- **Packages:** `@theia/monaco-editor-core` (pinned exactly in every package that uses it; built from a VS Code fork, see below)
- **Cadence:** on demand (1.83 in 2024, 1.96 in 2025, 1.108 and 1.144 in 2026). Not part of [doc/Publishing.md](../../../../../doc/Publishing.md) 3.6; usually tracked by an issue "Update monaco-editor-core to x.y.z".
- **Docs:** [packages/monaco/README.md](../../../../../packages/monaco/README.md) "Monaco Uplifts" (how the package is built and adopted), [doc/vscode-usage.md](../../../../../doc/vscode-usage.md) (rules for using VS Code internals), the `@monaco-uplift` tag in [doc/coding-guidelines.md](../../../../../doc/coding-guidelines.md), the wiki test checklist [Testing a Monaco Uplift](https://github.com/eclipse-theia/theia/wiki/LSP-and-Monaco-Integration#testing-a-monaco-uplift-drawn-from-7149), upstream [VS Code release notes](https://code.visualstudio.com/updates).

Split this file into `ISSUES.md` and `LOG.md` next to it once a section gets too long to scan.

## Steps

The version follows the VS Code release the fork is based on, with a higher patch number for Theia rebuilds (`1.108.201` for VS Code `1.108.2`, `1.144.1` for VS Code `1.144.0`; republished fixes like `1.96.301` → `1.96.302`). Check `npm view @theia/monaco-editor-core versions`: a `-alpha`/patch release may already exist. The target should usually match `DEFAULT_SUPPORTED_API_VERSION` in `dev-packages/application-package/src/api.ts`.

1. **Build the package** (VS Code side, details in `packages/monaco/README.md`):
   - Fork: [eclipsesource/ms-vscode](https://github.com/eclipsesource/ms-vscode), branch `monaco_uplift_<version>` holds a single commit with Theia's changes; the README's "Current State" lists them. Keep it current when the patches change (1.144 dropped the CommonJS conversion of `dompurify.js`).
   - Check out the new VS Code release tag, cherry-pick the tip of the latest uplift branch, resolve conflicts, keep it one commit, push the branch before the PR links it.
   - Use the Node.js version from the `.nvmrc` of the VS Code tag. `npm install`, `npm run gulp editor-distro`, set the version in `build/monaco/package.json`. Output: `out-monaco-editor-core/`.
   - Check the package before publishing: no absolute local paths in the source maps (`grep -rl '/home/' out-monaco-editor-core`), `repository`/`homepage`/`bugs` point to the fork and Theia, `dompurify`/`marked` use `^` ranges, `version.txt` links a commit that exists on a public repo.
2. **Iterate locally:** point every `@theia/monaco-editor-core` dependency to `file:/<path>/vscode/out-monaco-editor-core`, reinstall, build, fix. `tsc --build` does not notice a changed package in `node_modules`: compile with `--force` after swapping it.
3. **Test the packaged result** with the exact versions, before anything is on npm: `npm pack --pack-destination ..` in `out-monaco-editor-core/` (never into the folder itself, or the tarball ends up in the next package), publish the tarball to a local registry (Verdaccio, `@theia:registry=http://localhost:4873` in an uncommitted `.npmrc`) and install from there. The lockfile then has a `localhost` URL until the npm publish.
4. **IP review:** open an Eclipse IPLab issue for the new version with the tested tarball and link it in the issue and the PR. All uplifts waited in draft until it was approved. Run `npm run license:check`.
5. **Publish after the IP approval** (npm maintainers of `@theia/monaco-editor-core` only; ask the user, never publish yourself). Publish the reviewed and tested tarball, not a rebuild:
   - `openssl dgst -sha512 -binary <tgz> | base64 -w0` must match the `integrity` in `package-lock.json`.
   - `npm config get @theia:registry` must not point to the local registry (the scoped setting beats `--registry`).
   - `npm publish <tgz> --access public --dry-run`, then without `--dry-run`; `npm view @theia/monaco-editor-core@<version> dist.integrity` shows the same hash.
   - In Theia: set the `resolved` URL of the package in `package-lock.json` to `https://registry.npmjs.org/@theia/monaco-editor-core/-/monaco-editor-core-<version>.tgz`, delete `.npmrc`, `npm ci`.
6. **Theia pins:** `git grep -n '"@theia/monaco-editor-core": "<old>"'` (about 25 `package.json` files incl. `examples/api-samples`), `package-lock.json`, and `DEFAULT_SUPPORTED_MONACO_VERSION` in `dev-packages/application-package/src/api.ts` (shown in the About dialog; missed at first in 1.144). Remove any `dev-packages/cli/patches/@theia+monaco-editor-core+<old>.patch`.
7. **Adapt Theia code.** Search for imports from `@theia/monaco-editor-core/esm/vs` (see `doc/vscode-usage.md`); typical hot spots:
   - `packages/monaco/src/browser/monaco-init.ts`: the `StandaloneServices` overrides (context menu, layout, workspace context, configuration, quick input, theme, hover...). New members on overridden VS Code service interfaces must be implemented in the Theia service and in inline overrides (e.g. `createInline()` in `monaco-editor-provider.ts`), otherwise Monaco widgets crash at runtime. `monaco-init.spec.ts` guards the internal assumptions. 1.144 added `createSyntheticDocument` (text model service) and `hasWorkspaceData` (workspace context service).
   - Constructors of Monaco classes Theia instantiates or subclasses, e.g. `EmbeddedCodeEditor` (1.144: `IUserInteractionService`), `QuickAccessController`.
   - `monaco-quick-input-service.ts`, `monaco-quick-access-registry.ts`, `packages/core/src/common/quick-pick-service.ts`, `plugin-ext/.../quick-open-main.ts`: quick input API changes (1.144: `alignment`, `withQuickInputAnchor`, context key service for the quick access registry lookups).
   - `monaco-editor.ts`, `monaco-diff-editor.ts`, `simple-monaco-editor.ts`, `monaco-markdown-renderer.ts`, `plugin-ext/.../languages-main.ts`, debug disassembly view, notebook cell editors, AI chat input/code completion.
   - `monaco-nls.ts` (replaces Monaco's `vs/nls`, wired in by `monacoNlsPlugin` in `dev-packages/bundle-plugin/src/esbuild-plugin.ts`) must provide every export of the current `vs/nls` (1.144 merged `nls.messages` into it: `getNLSMessages`, `getNLSLanguage`); `monaco-nls.spec.ts` checks the exports and the translation by default value. Also check the `editor.worker` entry path in `dev-packages/application-manager/src/generator/bundler-generator.ts`.
   - Editor preferences: run the `API Samples` commands `Extract editor preference schema from Monaco` and `Check for unvalidated editor preferences in Monaco` in the browser example (`examples/api-samples/src/browser/monaco-editor-preferences/monaco-editor-preference-extractor.ts`). The extractor writes `packages/editor/src/common/editor-generated-preference-schema.ts` in its final format and filters what Theia does not support (`onExP` tags, `@vscode/diff` diff algorithms); only interface entries typed `Help`/`HelpBadDefaultValue` need manual types. `monaco-editor-preference-schema.spec.ts` in `@theia/monaco` fails and lists the differences while the schema does not match Monaco. Removed options also disappear from the exported `EditorConfiguration` interface; old values of renamed or retyped options are migrated by Monaco's `migrateOptions`, since Theia does not validate editor options at runtime.
   - Every `@monaco-uplift` comment (`git grep -n '@monaco-uplift'`): check the assumption still holds, remove workarounds and casts that are no longer needed.
   - Codicons: Theia's `@vscode/codicons` font and Monaco's built-in codicon font can differ. Check `codiconsLibrary.ts` of the new Monaco for icons Theia waited for (1.144: `open-in-window`, #17789).
   - CSS in `packages/monaco/src/browser/style/` and `packages/core/src/browser/style/` when Monaco's DOM or class names change; Playwright page objects in `examples/playwright/src/theia-monaco-editor.ts`; API tests that wait for Monaco DOM elements (`examples/api-tests`).
8. Keep `vscode-textmate`/`vscode-oniguruma` (`packages/monaco`, `packages/plugin-ext`) in step if tokenization misbehaves.
9. `CHANGELOG.md`: a breaking-changes entry only if exported Theia API changed (1.83 needed one; removed keys of `EditorConfiguration` are a candidate).

## Coupled versions

| When this changes | Also update |
|---|---|
| `@theia/monaco-editor-core` version | All ~25 `package.json` pins, `package-lock.json`, `DEFAULT_SUPPORTED_MONACO_VERSION` in `dev-packages/application-package/src/api.ts`, example version in `packages/monaco/README.md` |
| VS Code base of the fork | `nls.metadata.json`, supported VS Code API version and built-in extensions (separate monthly VS Code API update, not part of this skill). 1.108 was tested together with updated built-ins; stale nls metadata leaves Monaco strings untranslated |
| Monaco editor options | `editor-generated-preference-schema.ts` via the preference extractor |
| Monaco's codicon font | `@vscode/codicons` in `packages/core` only if Theia needs an icon it lacks (1.144's font matches 0.0.46-47, prereleases; Theia stayed on 0.0.45, which has `open-in-window`) |
| Monaco tokenization API | `vscode-textmate`, `vscode-oniguruma` (updated right after 1.96 in #14848) |

## Checks

- `npx lerna run test --scope @theia/monaco` (includes `monaco-init.spec.ts`, `monaco-nls.spec.ts`, `monaco-editor-preference-schema.spec.ts`), `npm run test:theia`, `npm run test:browser` (API tests in `examples/api-tests`, e.g. `monaco-api.spec.js`, `typescript.spec.js`), `npm run test:playwright`. The API tests write `examples/browser/.theia/settings.json` and `tasks.json`; restore them afterwards.
- `npm run license:check` and the IPLab approval.
- No `StandaloneServices was already initialized` or other Monaco errors in the browser console on start.
- Manual smoke test in browser and Electron, following the wiki checklist. At minimum: editor with a language extension (highlighting, hover, completion, code actions, rename, references peek, formatting), diff editor incl. revert/stage hunk, quick input/command palette (also before any editor was opened, and in a minimal app), editor in a secondary window, theme switch, preferences editor (old values of changed options, e.g. `editor.hover.enabled: false`), output, debug console and breakpoints, notebook cells, AI chat input (suggest widget, paste), a non-English display language (Monaco context menu, find widget and Selection menu translated).
- Parts of Theia that depend on Monaco internals and broke unnoticed before, so check them explicitly:
  - Editor context menu with Shift+F10 as well as with right-click: both show the language items (Go to Definition, Rename...). The keyboard path goes through Theia's `IContextMenuService` override with a coordinate anchor.
  - Debug console input: Enter accepts the selected suggestion, a second Enter evaluates; Up/Down move in the suggest widget, otherwise through the history. Theia's console keybindings use Monaco context keys (`suggestWidgetVisible`, `suggestWidgetHasFocusedSuggestion`, `suggestionMakesTextEdit`), which an uplift can rename.
  - Multi-diff editor (Git: View Changes, Theia's own widget built from Monaco diff editors): navigation between files and changes, collapse/expand all, editing the modified side.
- In the browser app, Go to Definition is Ctrl+F11 (F12 opens the devtools) and Ctrl+T is taken by the browser; neither is a failure.

## Known issues

### `SyntaxError: Unexpected token 'export'` in `monaco-editor-core/esm/.../marked.js` during mocha tests

The package is loaded as CJS but a bundled third-party file uses ESM syntax. Fixed in the fork by converting `marked.js` and `dompurify.js` to CommonJS (see README "Current State"). Since 1.108 the package declares `"type": "module"`, and 1.144 no longer needed the `dompurify.js` conversion. (#13217)

### Mocha fails to load `.css` imports from `@theia/monaco-editor-core` ESM files

Monaco 1.108 imports CSS from JS. `dev-packages/private-test-setup/test-setup.js` registers module hooks that stub style imports. (#17140)

### `$globalThis.addEventListener is not a function` in every mocha suite that loads Monaco

`setTimeout0` in `src/vs/base/common/platform.ts` expects a browser global. The fork guards it with a `$globalThis.addEventListener` check; a fix in Theia's `enableJSDOM` does not work, because JSDOM is re-created per spec. Keep the fork patch. (#18366)

### Republished tarball from the local registry not picked up

The lockfile integrity and the npm cache keep the old tarball of the same version. `rm -rf node_modules/@theia/monaco-editor-core && npm cache clean --force && npm install --prefer-online`. Afterwards check that the pins are still exact (a reinstall can turn them into `^`) and that `npm install --ignore-scripts` did not drop `"hasInstallScript": true` of `dev-packages/ffmpeg` from the lockfile. (#18366)

### Editor opening and syntax highlighting noticeably slower after the uplift

Once the service overrides took effect everywhere, Theia's patched `IConfigurationService` was used by all Monaco editor contributions. Fixed in the uplift PR before merge. Compare editor startup with master. (#13217)

### Monaco context menu, Selection menu or commands untranslated in a non-English locale

The `localize`/`localize2` override must run before any Monaco code is loaded, and the keys must match `nls.metadata.json`. 1.96 dropped the override from `monaco-init.ts` by accident. Today `monaco-nls.ts` replaces `vs/nls` at bundle time; check it after every uplift and update `packages/core/src/common/i18n/nls.metadata.json` from the matching VS Code tag. Strings are looked up by their English default value, so an ambiguous one (e.g. "References") can stay untranslated. (#13557, #15016)

### Command palette distorted, `Got bad scroll event` when no editor was opened yet

Monaco's global hover delegate was only set when the first editor was created. `setBaseLayerHoverDelegate` is now called with Monaco's `IHoverService` in `monaco-init.ts`. Test quick input in a minimal app. (#15064)

### Console error `StandaloneServices was already initialized ... before MonacoInit.init() could apply Theia overrides`

False positive of the early-initialization check added with 1.108. Detected now via `StandaloneServices.withServices`; a real occurrence means a module touched Monaco services before `MonacoInit.init()`. (#17361)

### Space scrolls the notebook, clipboard or image paste broken in inputs (Electron)

Since 1.108 Monaco uses the EditContext API (`div.native-edit-context`) instead of a hidden `<textarea>`: no DOM `paste` event, `isEditable` checks fail, `document.execCommand('paste')` is unreliable. Fixes: `contenteditable="false"` on the notebook cell's EditContext div (#17284), chat paste keybinding and input clipboard passthrough (#17189), clipboard handlers restricted to editor text focus (#17204). Playwright must use `keyboard.insertText()` (#17140).

### Popups (e.g. chat suggest widget) unstyled until an editor is opened, or in secondary windows

Monaco's `--vscode-*` theme variables only exist in documents registered via `MonacoStandaloneThemeService.registerEditorContainer`. The main window is registered at startup (#17608), secondary windows on creation (#17874).

### API test `Can execute code actions` times out waiting for the quick fix menu

Since 1.144 Monaco no longer creates `.context-view-pointerBlock`, and the `.action-widget` stays in the DOM after it was closed. `typescript.spec.js` waits for a visible `.action-widget` (`getClientRects().length > 0`). (#18366)

### `editor preference schema` test fails only on Windows and macOS CI (`editor.renderFinalNewline: "dimmed" instead of "on"`)

Some Monaco defaults depend on the platform (`platform.isLinux ? 'dimmed' : 'on'`), and the extractor writes the value of the platform it runs on. The extractor emits runtime expressions for them, like for `editor.fontFamily` and `editor.fontSize`; check `editorOptions.ts` for new `platform.is*` defaults. To test other platforms locally, override `process.platform` in a module passed to `node --import` and run `node_modules/mocha/bin/mocha.js` directly (not via `npx`). (#18366)

### Preferences UI shows `onExP` as a label next to editor options

VS Code tags options of its online experiments with `onExP`; the preference renderer shows unknown tags verbatim. The extractor drops the tag and `monaco-editor-preference-schema.spec.ts` checks it. (#18366)

### Typing feels laggy after the uplift

Profile before blaming Monaco (DevTools > Performance, type in a large file, check the long tasks). During the 1.144 testing the freezes came from the file decorations: `FileTreeDecoratorAdapter.updateDecorations` re-queries every decorated resource through the unbalanced `TernarySearchTree` of each provider, which gets slow with large expanded folders. The same on master, not related to the uplift. Turning off `editor.editContext` made no difference.

## Log

Newest first. One entry per merged update and target branch.

| Date | Branch | From → To | PR | Notes |
|---|---|---|---|---|
| 2026-11 | master | 1.108.201 → 1.144.1 | #18366 | Issue #18355. Tested from a local registry, published after the IP review ([IPLab #33204](https://gitlab.eclipse.org/eclipsefdn/emo-team/iplab/-/work_items/33204)). `vs/nls` accessors in `monaco-nls.ts`, `IUserInteractionService`, quick access and quick input API, schema regenerated (38 new, 6 removed options, extractor emits the final format), obsolete `@monaco-uplift` workarounds removed, `open-in-window` icon (#17789). New spec tests for the schema and `monaco-nls.ts`. Fork: relocatable source maps, `^` ranges, repository metadata. Pre-existing bugs found while testing (Shift+F10 context menu without language items, debug console Enter not accepting suggestions) fixed separately, together with the empty editor hint. |
| 2026-03-17 | master | 1.96.302 → 1.108.201 | #17140 | First in v1.70.0. EditContext input, `ILayoutService`/workspace context overrides, NLS via bundler alias (`monaco-nls.ts`), `preferTreeSitter` per-language booleans, tab preview staging, Monaco version in About dialog, test CSS hooks. Follow-ups: #17189, #17204, #17284, #17361, #17608, #17874. |
| 2025-01-30 | master | 1.83.101 → 1.96.302 | #14737 | First in v1.58.0. Quick input, preference schema, secondary windows, webpack config; dropped the 1.83.101 `theia-patch`. Regressions: localization lost (#15016), hover delegate (#15064). |
| 2024-02-15 | master | 1.72.3 → 1.83.101 | #13217 | First in v1.47.0. Breaking: service overrides rewritten into `monaco-init.ts`, new diff editor, `setContext` → `_setContext`, icons via VS Code icon registry. Follow-up: #13557 (localization). |
