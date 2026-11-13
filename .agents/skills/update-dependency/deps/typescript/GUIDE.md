# TypeScript

- **Packages:** `typescript`, plus the tooling with a TypeScript peer range: `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `typedoc`; the per-package `tslib`
- **Cadence:** on demand, every one to two years; usually triggered by an issue or by tooling that needs a newer compiler
- **Docs:** [doc/Migration.md](../../../../../doc/Migration.md) (v1.23.0, v1.77.0 entries), upstream "Announcing TypeScript X.Y" posts on devblogs.microsoft.com/typescript (breaking changes and deprecations sections)

Split this file into `ISSUES.md` and `LOG.md` next to it once a section gets too long to scan.

## Steps

1. Check peer ranges before bumping: `npm view @typescript-eslint/parser@<v> peerDependencies`, `npm view typedoc@<v> peerDependencies`. Pick the first releases that include the new TypeScript line.
2. Bump every pin (all `~x.y.z`): `git grep -n '"typescript"' -- '*package.json'` gives the root `package.json`, `dev-packages/localization-manager` (a runtime `dependency`, so adopters get it), `dev-packages/private-re-exports`, `examples/playwright`. Also `.github/workflows/copilot-sdk-mirror.yml` (`npm install ... typescript@~x.y.z`).
3. Run `npm run compile` and fix compiler options first: deprecated/removed options and changed defaults go into `configs/base.tsconfig.json`, with a comment why. Mirror them into `examples/api-tests/test-ts-workspace/tsconfig.json` (see Known issues) and keep `lib` in `configs/build.eslintrc.json` equal to the base `lib`.
4. Fix code errors in a separate commit. Typical categories: stricter generic/`lib` typings (typed arrays, `Error.cause`), missing `override`, missing `;` on overload signatures, imports that the new module semantics reject. Isolate behaviour-relevant switches in their own commit; #18100 switched to default imports with `esModuleInterop` on the old compiler first.
5. Run `npm run lint`; the lint is type-aware, so typescript-eslint must support the new compiler.
6. `tsfmt.json`, `scripts/compile-references.js` and `configs/mocharc.yml` (runs compiled JS, no ts-node) have never needed changes for an upgrade.
7. If emitted declarations or the shared configs change for adopters, add a `CHANGELOG.md` breaking-change entry and a `doc/Migration.md` section (needed for 4.5 and 6.0).
8. New devDependencies (e.g. ESLint plugins replacing incompatible ones) need the Eclipse dash license check / IP review.

## Coupled versions

| When this changes | Also update |
|---|---|
| `typescript` (root) | same `~x.y.z` in `localization-manager`, `private-re-exports`, `examples/playwright`, `copilot-sdk-mirror.yml` |
| `typescript` minor/major | `@typescript-eslint/*` (peer range), `typedoc` (peer range); `.vscode/settings.json` `typescript.tsdk` stays `node_modules/typescript/lib` |
| `target` / `lib` in `configs/base.tsconfig.json` | `lib` in `configs/build.eslintrc.json`; the minimum Node.js in [doc/runtime-policy.md](../../../../../doc/runtime-policy.md) must support the target |
| any `compilerOptions` change | `examples/api-tests/test-ts-workspace/tsconfig.json`, which must stay valid for the TypeScript bundled with the built-in `vscode.typescript-language-features` (see deps/vscode-api) |
| options that make emit use more `tslib` helpers (`importHelpers`, `esModuleInterop`) | `tslib` in `dependencies` of every published package whose output `require("tslib")` |
| any upgrade | Theia IDE needs the same update (Publishing 3.6 ticket) |

## Checks

- `npm run lint` (type-aware rules, `@typescript-eslint/no-deprecated`).
- `npm run test`, plus `npm run download:plugins && npm run test:browser`: plugin host regressions only show with deployed plugins.
- API docs: `NODE_OPTIONS=--max-old-space-size=4096 npm run build`, then `NODE_OPTIONS=--max-old-space-size=8192 npm run docs`.
- `npx theia nls-extract -o /tmp/nls.json -e vscode -f './packages/**/browser/**/*.{ts,tsx}'` produces a non-empty file (localization-manager uses the TypeScript API at runtime).
- Smoke test browser and electron apps: open a `.ts` file (hover, references), run a task with `"problemMatcher": ["$tsc"]`, watch the logs for new errors.

## Known issues

### `error TS5107: Option 'moduleResolution=node10' is deprecated`

TypeScript 6 deprecates `node`/`node10` resolution. Use `"moduleResolution": "bundler"` (allowed with `module: CommonJS` since 6.0); `ignoreDeprecations` only defers it to TypeScript 7. (#18100)

### Imports of non-exported subpaths fail after switching to `bundler`

`bundler` honours package `exports`; `openai/internal/request-options` was no longer resolvable. Use the public type (`OpenAI.RequestOptions`). (#18100)

### `error TS5101: Option 'downlevelIteration' is deprecated`

Reported even when set to `false`. Remove the option; it is a no-op for ES2015+ targets. (#18100)

### `TS2349 This expression is not callable` / `TS2351` on `express()`, `yargs`, `new Ajv()`

TypeScript 6 forces `esModuleInterop`; a namespace import of a CommonJS module is no longer callable. Switch to default imports (`import express from 'express'`); do not use `import x = require()`. (#18100)

### Hundreds of `test:browser` failures although compile and unit tests pass

With `esModuleInterop`, `import * as x` emits `__importStar`, a read-only copy. The plugin host patched `http`/`https`/`tls` in place via that copy, so the patch was lost; same for `node-pty`, `file-icons-js`, a spec patching `fs/promises`. Use default imports wherever a module object is mutated or its prototype is used. (#18100)

### `Cannot find name 'describe'` / `'Buffer'` / `'NodeJS'` everywhere

TypeScript 6 defaults `types` to `[]`. Base config declares `"types": ["node", "mocha"]`; specs live next to sources, so all projects need both. (#18100)

### Thousands of `TS2564 Property ... has no initializer` on `@inject` fields

TypeScript 6 defaults `strict` to `true`. Keep `"strict": false` and the individual strictness flags. (#18100)

### `TS2882` on `import '../../src/browser/style/index.css'`

TypeScript 6 defaults `noUncheckedSideEffectImports` to `true` and there is no `*.css` declaration. Set it to `false`. (#18100)

### API-test fixture tsconfig rejected by the built-in TypeScript language server

`examples/api-tests/test-ts-workspace/tsconfig.json` is read by `vscode.typescript-language-features`, which bundles an older TypeScript (5.9.3 at #18100): `bundler` fails on 5.9 (TS5095), `node` on 6 (TS5107), `ignoreDeprecations: "6.0"` on 5.9 (TS5103). Omit `moduleResolution` so each version derives its default. (#18100)

### Lint cannot run: typescript-eslint, `eslint-plugin-tslint` or `eslint-plugin-deprecation` do not support the new TypeScript

TypeScript 6 needed typescript-eslint v8; the TSLint bridge and `eslint-plugin-deprecation` have no compatible release. Replaced by `@stylistic/eslint-plugin` v3 (last major for ESLint 8), `eslint-plugin-jsdoc`, `@typescript-eslint/no-deprecated` and the custom `@theia/file-header` / `@theia/explicit-return-type` rules. v8 `no-shadow` also flags named function expressions shadowing their `const`. (#18100; v4 → v6 in #13628)

### `typedoc` peer dependency excludes the new TypeScript

Bump `typedoc` to the first release supporting it (0.28.20 for 6.0). (#18100, #10729)

### `This regular expression flag is only available when targeting 'es2024' or later`

The `v` flag is rejected with target ES2023. Use `u`. (#16774)

### `Uint8Array` not assignable to `BlobPart` / `BodyInit`

Typed arrays are generic over the buffer type since TypeScript 5.7. Wrap in `new Uint8Array(x)`. (#16774)

### Fields undefined or overwritten after `super()` once target is ES2022+

ES2022 class field semantics (`Object.defineProperty`) change initialisation order relative to `super()`. Keep `"useDefineForClassFields": false` until the affected classes are refactored. (#16774)

### `nls-extract` writes `{}`

`localization-extractor.ts` needs a compiler host with `readFile`/`fileExists` and a cwd-relative, `/`-separated file name under TypeScript 5.4. (#13628)

### `TS2611` on Phosphor (now Lumino) members declared as property but implemented as accessor

Since TypeScript 4.0. Suppressed with `// @ts-expect-error TS2611` in `tab-bars.ts` and `view-container.ts`. (#10355)

### IDE reports errors for `moduleResolution: bundler` with CommonJS

The editor uses its bundled, older TypeScript. Select the workspace version (`typescript.tsdk` is set in `.vscode/settings.json`). (#18100, Migration v1.77.0)

## Log

Newest first. One entry per merged update and target branch.

| Date | Branch | From → To | PR | Notes |
|---|---|---|---|---|
| 2026-10-14 | master | ~5.9.3 → ~6.0.3 | #18100 | `bundler` resolution, `esModuleInterop`, explicit `types`, `strict: false`, `noUncheckedSideEffectImports: false`; typescript-eslint 7 → 8, TSLint bridge and `eslint-plugin-deprecation` removed, typedoc 0.28.20; `tslib` declared in 19 packages. Breaking, CHANGELOG + Migration |
| 2026-01-14 | master | ~5.4.5 → ~5.9.3 | #16774 | Together with built-ins 1.104.0. Target/lib ES2019 → ES2023, `useDefineForClassFields: false`, code fixes in a separate commit |
| 2024-05-22 | master | ~4.5.5 → ~5.4.5 | #13628 | typescript-eslint 4 → 6; stricter typings, `nls-extract` fix. CHANGELOG entry. (typescript-eslint 6 → 7 came later with the npm switch, #14481) |
| 2022-02-08 | master | ^3.9.2 → ~4.5.5 | #10355 | `@ts-expect-error` for Phosphor accessors; Migration note for adopters on older TypeScript. Follow-ups: typedoc upgrade #10729, `noImplicitOverride` enabled #10737 |
