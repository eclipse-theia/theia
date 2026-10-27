# VS Code API, nls metadata and built-in extensions

- **Packages:** no npm package. `DEFAULT_SUPPORTED_API_VERSION` in `dev-packages/application-package/src/api.ts`, `packages/core/src/common/i18n/nls.metadata.json`, `theiaPlugins` in the root `package.json`
- **Cadence:** API version and nls metadata together, about once a month (one PR per VS Code minor release that Theia catches up to). Built-ins on demand, a few times a year.
- **Docs:** [doc/Plugin-API.md](../../../../../doc/Plugin-API.md), [vscode-theia-comparator status](https://eclipse-theia.github.io/vscode-theia-comparator/status.html), VS Code `src/vscode-dts/vscode.d.ts` diff between the two tags, [eclipse-theia/vscode-builtin-extensions releases](https://github.com/eclipse-theia/vscode-builtin-extensions/releases). Translation updates before a release (Publishing 1.3) are a separate process.

## Steps

### API version

1. Set `DEFAULT_SUPPORTED_API_VERSION` in `dev-packages/application-package/src/api.ts` to the target VS Code release (`x.y.z`, the latest patch of the minor).
   It is the value of `vscode.version`, the default of `--vscode-api-version` and of `download:plugins --api-version`, and is shown in the About dialog.
2. Diff `src/vscode-dts/vscode.d.ts` (and the finalized proposals) between the old and the new VS Code tag.
   Port public API changes to `packages/plugin/src/theia.d.ts` and implement them in `packages/plugin-ext` (`plugin-context.ts`, `types-impl.ts`, `type-converters.ts`, `plugin-api-rpc.ts`, the matching `*-main.ts`).
   API Theia cannot back gets a stub tagged `@stubbed`. If `vscode.d.ts` is unchanged, say so in the PR ("No public API changes").
3. Proposed API changes go into `packages/plugin/src/theia.proposed.*.d.ts`; larger ones are tracked in their own issue.
4. Check the filtered comparator report against the new version and link remaining gaps as follow-up issues.

### nls metadata

1. Check out the same VS Code tag, build it: `npm i && npm run gulp vscode-linux-x64`.
2. Replace `packages/core/src/common/i18n/nls.metadata.json` with VS Code's `out-build/nls.metadata.json`. There is no script for this in the Theia repo.
3. Run `npm run lint`. The `@theia/localization-check` rule (`dev-packages/private-eslint-plugin/rules/localization-check.js`) reads the new file and reports:
   - `'<x>' can be translated using the 'nls.localizeByDefault' function.`: switch `nls.localize('theia/…', '<x>')` to `nls.localizeByDefault('<x>')`.
   - `'<x>' is not a valid default value.`: the string left the VS Code metadata; use `nls.localize('theia/<package>/<id>', '<x>')` or the suggested close match. Same for `Command.toDefaultLocalizedCommand` labels and categories (use `Command.toLocalizedCommand`).
4. Commit the metadata update separately from the API bump (`Update nls.metadata for vscode API <version>`); both go into one PR titled `[vscode] API bump and nls update to <version>`.

### Built-in extensions

1. Release the builtins in [eclipse-theia/vscode-builtin-extensions](https://github.com/eclipse-theia/vscode-builtin-extensions) for the target VS Code version first (GitHub release with a `vscode-builtin-extensions-<version>.tar.gz`).
2. In the root `package.json` `theiaPlugins`, update the `vscode-builtin-extensions` release URL and the Open VSX `.vsix` URLs of the other pinned extensions (EditorConfig, ESLint, Jupyter, Python) to their latest versions (`https://open-vsx.org/api/<ns>/<name>` lists them).
3. Revisit `theiaPluginsExcludeIds`: drop ids that no longer exist or now work, add ids that break Theia.
4. Example apps load the downloaded `plugins/` folder (`--plugins=local-dir:../../plugins`); they have no `theiaPlugins` of their own.

## Coupled versions

| When this changes | Also update |
|---|---|
| `DEFAULT_SUPPORTED_API_VERSION` | `nls.metadata.json` from the same VS Code tag, `theia.d.ts` / proposed `.d.ts` files |
| `nls.metadata.json` | `nls.localize` / `nls.localizeByDefault` call sites flagged by lint |
| VS Code builtins | keep the API version at or above the builtins version so their `engines.vscode` is satisfied |
| Monaco uplift ([deps/monaco](../monaco/GUIDE.md)) | `DEFAULT_SUPPORTED_MONACO_VERSION` lives next to the API version in `api.ts`; Monaco strings are translated through `nls.metadata.json`, so refresh it after an uplift |

## Checks

- `npm run lint` must pass after the metadata update; it is the main check for nls changes.
- Start browser and electron examples: no `Could not find translation key for default value: "…"` warnings in the console. Optionally run `Configure Display Language`, pick a language pack and check menus.
- API: an extension requiring `engines.vscode: ^<new version>` now installs; review the comparator report.
- Builtins: `rm -rf plugins && npm run download:plugins` (must exit 0), then smoke test in both examples: TypeScript/JSON/CSS language support, JS debugging, Git/SCM view, Python and a Jupyter notebook (`sample.ipynb`), EditorConfig. Watch the logs for new errors.
- Builtins: `npm run test:browser` runs `examples/api-tests` against the downloaded plugins (TypeScript tests depend on the builtin language server).

## Known issues

### Lint fails with `'<x>' is not a valid default value` or `can be translated using the 'nls.localizeByDefault' function` after replacing nls.metadata.json

VS Code added or removed strings, and the localization-check rule validates every `localizeByDefault` and `toDefaultLocalizedCommand` value against the file.
Fix each call site as described in the nls steps; updates since 1.106.1 usually touch a dozen or more files. (#16728, #18068)

### Monaco menus and commands stay untranslated with a language pack

`nls.metadata.json` was stale, so keys used by the overridden Monaco `localize` no longer matched.
Regenerate the metadata from the VS Code version matching the Monaco uplift. (#15016)

### Builtins can no longer be published to Open VSX under the `vscode` namespace

Open VSX requires namespace ownership and `vscode` belongs to Microsoft; the `eclipse-theia.builtin-extension-pack` was an Open VSX pack of those extensions.
Consume the `.tar.gz` from the vscode-builtin-extensions GitHub release instead; `download:plugins` decompresses vsix bundles from it. (#16774)

### Extension pack downloads a mix of builtin versions

With the old Open VSX extension pack, `download:plugins` fetched the newest compatible version of each pack member, not the pack version. Open issue #13686; the GitHub release archive pins exact versions. (#14606, #16774)

### TypeScript API test times out after a builtins update

The `typescript.isManagedFile` context key wait no longer resolved with the 1.88.1 TypeScript extension.
Adjust `examples/api-tests/src/typescript.spec.js` (#13673 replaced the wait with a timeout, see #13679).

## Log

Newest first. One entry per merged update and target branch.

| Date | Branch | From → To | PR | Notes |
|---|---|---|---|---|
| 2026-09-24 | master | 1.134.0 → 1.139.0 | #18068 | API + nls. No `vscode.d.ts` changes; 15 files with call sites fixed |
| 2026-08-24 | master | 1.130.0 → 1.134.0 | #17946 | API + nls |
| 2026-07-27 | master | 1.125.0 → 1.130.0 | #17819 | API + nls |
| 2026-06-25 | master | 1.121.0 → 1.125.0 | #17709 | API + nls. No `vscode.d.ts` changes; implemented `MultiDocumentHighlightProvider` |
| 2026-05-28 | master | 1.116.0 → 1.121.0 | #17571 | API + nls |
| 2026-04-27 | master | 1.110.1 → 1.116.0 | #17367 | API + nls. No `vscode.d.ts` changes; proposed API tracked in #17365 |
| 2026-03-26 | master | 1.104.0 → 1.108.2 | #17221 | builtins; also EditorConfig, ESLint, Jupyter, Python |
| 2026-03-24 | master | 1.109.4 → 1.110.1 | #17170 | API + nls. `LineCommentRule`, `env.isAppPortable` (stubbed) |
| 2026-02-25 | master | 1.108.0 → 1.109.4 | #17047 | API + nls |
| 2026-01-27 | master | 1.106.1 → 1.108.0 | #16871 | API + nls. QuickPick `prompt`/`resourceUri`, WebviewPanel `iconPath` |
| 2026-01-14 | master | 1.95.3 → 1.104.0 | #16774 | builtins; switched from Open VSX pack to GitHub release `.tar.gz`; with TypeScript 5.9.3 |
| 2025-12-09 | master | unstated → 1.106.1 | #16728 | nls; extended localization-check to `toDefaultLocalizedCommand` |
| 2025-11-26 | master | 1.105.0 → 1.106.1 | #16655 | API |
| 2025-10-27 | master | 1.104.0 → 1.105.0 | #16495 | API |
| 2025-09-24 | master | 1.102.3 → 1.104.0 | #16281 | API; several proposed APIs |
| 2025-07-30 | master | 1.101.1 → 1.102.3 | #16081 | API |
| 2025-06-26 | master | 1.99.3 → 1.101.1 | #15888 | API |
| 2025-05-28 | master | 1.98.2 → 1.99.3 | #15658 | API |
| 2025-03-31 | master | 1.97.2 → 1.98.2 | #15341 | API |
| 2025-02-27 | master | 1.96.0 → 1.97.2 | #15069 | API |
| 2025-02-25 | master | 1.89.0 → unstated | #15016 | nls; refreshed with Monaco localization fix |
| 2024-12-16 | master | 1.95.3 → 1.96.0 | #14634 | API |
| 2024-12-16 | master | 1.88.1 → 1.95.3 | #14606 | builtins; also Jupyter, Python |
| 2024-11-27 | master | 1.94.2 → 1.95.3 | #14541 | API |
| 2024-10-30 | master | 1.93.1 → 1.94.2 | #14371 | API |
| 2024-09-26 | master | 1.92.2 → 1.93.1 | #14224 | API |
| 2024-08-27 | master | 1.91.1 → 1.92.2 | #14076 | API |
| 2024-07-25 | master | 1.90.2 → 1.91.1 | #13955 | API |
| 2024-06-27 | master | 1.89.1 → 1.90.2 | #13849 | API |
| 2024-05-31 | master | 1.84.2 → 1.89.0 | #13743 | nls |
| 2024-05-30 | master | 1.88.1 → 1.89.1 | #13738 | API |
| 2024-05-06 | master | 1.83.1 → 1.88.1 | #13673 | builtins; dropped explicit js-debug downloads; api-test adjusted |
| 2024-04-26 | master | 1.87.2 → 1.88.1 | #13646 | API |
| 2024-03-26 | master | 1.86.2 → 1.87.2 | #13514 | API |
| 2024-02-29 | master | 1.85.1 → 1.86.2 | #13429 | API |
| 2024-01-23 | master | 1.79.0 → 1.83.1 | #13298 | builtins; also js-debug |
| 2024-01-16 | master | 1.84.2 → 1.85.1 | #13276 | API |
