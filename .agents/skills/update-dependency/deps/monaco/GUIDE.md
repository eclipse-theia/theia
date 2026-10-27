# Monaco

- **Packages:** `@theia/monaco-editor-core` (pinned exactly in every package that uses it; built from a VS Code fork, see below)
- **Cadence:** on demand, roughly once a year (1.83 in 2024, 1.96 in 2025, 1.108 in 2026). Not part of [doc/Publishing.md](../../../../../doc/Publishing.md) 3.6; usually tracked by an issue "Update monaco-editor-core to x.y.z".
- **Docs:** [packages/monaco/README.md](../../../../../packages/monaco/README.md) "Monaco Uplifts" (how the package is built and adopted), [doc/vscode-usage.md](../../../../../doc/vscode-usage.md) (rules for using VS Code internals), the `@monaco-uplift` tag in [doc/coding-guidelines.md](../../../../../doc/coding-guidelines.md), the wiki test checklist [Testing a Monaco Uplift](https://github.com/eclipse-theia/theia/wiki/LSP-and-Monaco-Integration#testing-a-monaco-uplift-drawn-from-7149), upstream [VS Code release notes](https://code.visualstudio.com/updates).

Split this file into `ISSUES.md` and `LOG.md` next to it once a section gets too long to scan.

## Steps

The version is the VS Code release the fork is based on (`1.108.2`). Republished fixes of the same base append two digits to the patch number (`1.83.101`, `1.96.301`, `1.96.302`, `1.108.201`). Check `npm view @theia/monaco-editor-core versions`: a `-alpha`/patch release may already exist.

1. **Build the package** (VS Code side, details in `packages/monaco/README.md`):
   - Fork: [eclipsesource/ms-vscode](https://github.com/eclipsesource/ms-vscode), branch `monaco_uplift_<vscode-version>` holds a single commit with Theia's changes (tree shaking, CJS `marked.js`/`dompurify.js`, sourcemaps and declarations, `platform.ts` guard, `esm.core.js` import; the README's "Current State" lists them).
   - Check out the new VS Code release tag, cherry-pick the tip of the latest uplift branch, resolve conflicts, keep it one commit, push as `monaco_uplift_<new-version>`.
   - `npm install`, `npm run gulp editor-distro`, set the version in `build/monaco/package.json`. Output: `out-monaco-editor-core/`.
   - Update the "Current State" list and the example version in `packages/monaco/README.md` if the fork changes changed.
2. **Iterate locally:** point every `@theia/monaco-editor-core` dependency to `file:/<path>/vscode/out-monaco-editor-core`, reinstall, build, fix.
3. **Publish** with `npm pack` + `npm publish` from `out-monaco-editor-core/` (npm maintainers of `@theia/monaco-editor-core` only; ask the user, never publish yourself).
4. **IP review:** open an Eclipse IPLab issue for the new `@theia/monaco-editor-core` version. All uplifts waited in draft until it was approved; link it in the PR. Run `npm run license:check`.
5. **Theia pins:** `git grep -n '"@theia/monaco-editor-core": "<old>"'` (about 25 `package.json` files incl. `examples/api-samples`), `package-lock.json`, and `DEFAULT_SUPPORTED_MONACO_VERSION` in `dev-packages/application-package/src/api.ts` (shown in the About dialog). Remove any `dev-packages/cli/patches/@theia+monaco-editor-core+<old>.patch`.
6. **Adapt Theia code.** Search for imports from `@theia/monaco-editor-core/esm/vs` (see `doc/vscode-usage.md`); typical hot spots:
   - `packages/monaco/src/browser/monaco-init.ts`: the `StandaloneServices` overrides (context menu, layout, workspace context, configuration, quick input, theme, hover...). New members on overridden VS Code service interfaces must be implemented in the Theia service and in inline overrides (e.g. `createInline()` in `monaco-editor-provider.ts`), otherwise Monaco widgets crash at runtime. `monaco-init.spec.ts` guards the internal assumptions.
   - `monaco-quick-input-service.ts`, `packages/core/src/common/quick-pick-service.ts`, `plugin-ext/.../quick-open-main.ts`: quick input API changes.
   - `monaco-editor.ts`, `monaco-diff-editor.ts`, `simple-monaco-editor.ts`, `monaco-markdown-renderer.ts`, `plugin-ext/.../languages-main.ts`, debug disassembly view, notebook cell editors, AI chat input/code completion.
   - `monaco-nls.ts` (replaces Monaco's `vs/nls`, wired in by `monacoNlsPlugin` in `dev-packages/bundle-plugin/src/esbuild-plugin.ts`) and the `editor.worker` entry path in `dev-packages/application-manager/src/generator/bundler-generator.ts`.
   - Editor preferences: enable `bindMonacoPreferenceExtractor` in `examples/api-samples/src/browser/monaco-editor-preferences/monaco-editor-preference-extractor.ts`, run its two commands, update `packages/editor/src/common/editor-generated-preference-schema.ts`, revert the binding.
   - Every `@monaco-uplift` comment (`git grep -n '@monaco-uplift'`): check the assumption still holds, remove casts that are no longer needed.
   - CSS in `packages/monaco/src/browser/style/` and `packages/core/src/browser/style/` when Monaco's DOM or class names change; Playwright page objects in `examples/playwright/src/theia-monaco-editor.ts`.
7. Keep `vscode-textmate`/`vscode-oniguruma` (`packages/monaco`, `packages/plugin-ext`) in step if tokenization misbehaves.
8. `CHANGELOG.md`: one line for the uplift; a breaking-changes entry only if exported Theia API changed (1.83 needed one).

## Coupled versions

| When this changes | Also update |
|---|---|
| `@theia/monaco-editor-core` version | All ~25 `package.json` pins, `package-lock.json`, `DEFAULT_SUPPORTED_MONACO_VERSION` in `dev-packages/application-package/src/api.ts`, example version in `packages/monaco/README.md` |
| VS Code base of the fork | `nls.metadata.json`, supported VS Code API version and built-in extensions: see [deps/vscode-api](../vscode-api/GUIDE.md). 1.108 was tested together with updated built-ins; stale nls metadata leaves Monaco strings untranslated |
| Monaco editor options | `editor-generated-preference-schema.ts` via the preference extractor |
| Monaco tokenization API | `vscode-textmate`, `vscode-oniguruma` (updated right after 1.96 in #14848) |

## Checks

- `npx lerna run test --scope @theia/monaco` (includes `monaco-init.spec.ts`), `npm run test:theia`, `npm run test:browser` (API tests in `examples/api-tests`, e.g. `monaco-api.spec.js`, `typescript.spec.js`), `npm run test:playwright`.
- `npm run license:check` and the IPLab approval.
- No `StandaloneServices was already initialized` or other Monaco errors in the browser console on start.
- Manual smoke test in browser and Electron, following the wiki checklist. At minimum: editor with a language extension (highlighting, hover, completion, code actions, rename, references peek, formatting), diff editor incl. revert/stage hunk, quick input/command palette (also before any editor was opened, and in a minimal app), editor in a secondary window, theme switch, preferences editor, output, debug console and breakpoints, notebook cells, AI chat input (suggest widget, paste), a non-English display language (Monaco context menu and Selection menu translated).

## Known issues

### `SyntaxError: Unexpected token 'export'` in `monaco-editor-core/esm/.../marked.js` during mocha tests

The package is loaded as CJS but a bundled third-party file uses ESM syntax. Fixed in the fork by converting `marked.js` and `dompurify.js` to CommonJS (see README "Current State"). (#13217)

### Mocha fails to load `.css` imports from `@theia/monaco-editor-core` ESM files

Monaco 1.108 imports CSS from JS. `dev-packages/private-test-setup/test-setup.js` registers module hooks that stub style imports. (#17140)

### Editor opening and syntax highlighting noticeably slower after the uplift

Once the service overrides took effect everywhere, Theia's patched `IConfigurationService` was used by all Monaco editor contributions. Fixed in the uplift PR before merge. Compare editor startup with master. (#13217)

### Monaco context menu, Selection menu or commands untranslated in a non-English locale

The `localize`/`localize2` override must run before any Monaco code is loaded, and the keys must match `nls.metadata.json`. 1.96 dropped the override from `monaco-init.ts` by accident. Today `monaco-nls.ts` replaces `vs/nls` at bundle time; check it after every uplift and update the metadata (vscode-api guide). (#13557, #15016)

### Command palette distorted, `Got bad scroll event` when no editor was opened yet

Monaco's global hover delegate was only set when the first editor was created. `setBaseLayerHoverDelegate` is now called with Monaco's `IHoverService` in `monaco-init.ts`. Test quick input in a minimal app. (#15064)

### Console error `StandaloneServices was already initialized ... before MonacoInit.init() could apply Theia overrides`

False positive of the early-initialization check added with 1.108. Detected now via `StandaloneServices.withServices`; a real occurrence means a module touched Monaco services before `MonacoInit.init()`. (#17361)

### Space scrolls the notebook, clipboard or image paste broken in inputs (Electron)

Since 1.108 Monaco uses the EditContext API (`div.native-edit-context`) instead of a hidden `<textarea>`: no DOM `paste` event, `isEditable` checks fail, `document.execCommand('paste')` is unreliable. Fixes: `contenteditable="false"` on the notebook cell's EditContext div (#17284), chat paste keybinding and input clipboard passthrough (#17189), clipboard handlers restricted to editor text focus (#17204). Playwright must use `keyboard.insertText()` (#17140).

### Popups (e.g. chat suggest widget) unstyled until an editor is opened, or in secondary windows

Monaco's `--vscode-*` theme variables only exist in documents registered via `MonacoStandaloneThemeService.registerEditorContainer`. The main window is registered at startup (#17608), secondary windows on creation (#17874).

## Log

Newest first. One entry per merged update and target branch.

| Date | Branch | From → To | PR | Notes |
|---|---|---|---|---|
| 2026-03-17 | master | 1.96.302 → 1.108.201 | #17140 | First in v1.70.0. EditContext input, `ILayoutService`/workspace context overrides, NLS via bundler alias (`monaco-nls.ts`), `preferTreeSitter` per-language booleans, tab preview staging, Monaco version in About dialog, test CSS hooks. Follow-ups: #17189, #17204, #17284, #17361, #17608, #17874. |
| 2025-01-30 | master | 1.83.101 → 1.96.302 | #14737 | First in v1.58.0. Quick input, preference schema, secondary windows, webpack config; dropped the 1.83.101 `theia-patch`. Regressions: localization lost (#15016), hover delegate (#15064). |
| 2024-02-15 | master | 1.72.3 → 1.83.101 | #13217 | First in v1.47.0. Breaking: service overrides rewritten into `monaco-init.ts`, new diff editor, `setContext` → `_setContext`, icons via VS Code icon registry. Follow-up: #13557 (localization). |
