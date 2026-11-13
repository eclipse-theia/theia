# React

- **Packages:** `react`, `react-dom`, `@types/react`, `@types/react-dom`; React libraries in the tree: `react-virtuoso`, `react-tooltip` (`@theia/core`), `react-perfect-scrollbar` (`@theia/messages`, `@theia/notebook`), `react-textarea-autosize` (`@theia/scm`, `@theia/search-in-workspace`)
- **Cadence:** minors and patches come with the post-release NPM upgrade ([deps/npm-upgrade](../npm-upgrade/GUIDE.md)); majors on demand after the [doc/Publishing.md](../../../../../doc/Publishing.md) 3.6 check, tracked in an issue (e.g. #17673 for React 19)
- **Docs:** [React versions](https://react.dev/versions), [React 19 upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide), [doc/Migration.md](../../../../../doc/Migration.md) (v1.29.0 React 18, v1.75.0 React 19), [packages/core/README.md](../../../../../packages/core/README.md) re-export list

Split this file into `ISSUES.md` and `LOG.md` next to it once a section gets too long to scan.

## Steps

1. `packages/core/package.json` is the only place React is declared:
   - `devDependencies`: `react`, `react-dom`, `@types/react`, `@types/react-dom` with the exact versions the repo builds against.
   - `peerDependencies`: the range adopters must provide (`^19.0.0` today); `@types/*` are marked optional in `peerDependenciesMeta`. Since #17567 React is no longer a direct dependency of `@theia/core`; adopters declare it themselves.
   - No other package, example app or the root `package.json` declares React. Keep it that way; other packages import it via `@theia/core/shared/react*`.
2. Re-exports: `theiaReExports.shared` in `packages/core/package.json` lists `react-dom`, `react-dom/client`, `react-dom/server`, `react-virtuoso`, `react/jsx-runtime`, `react/jsx-dev-runtime` (`export *`) and `react as React` (`export =`).
   Add an entry when code needs a new subpath (e.g. `react-dom/server` was added in #17932 because `@theia/ai-chat-ui` imported it as an undeclared hoisted dependency).
   Regenerate with `npm run generate-theia-re-exports` in `packages/core`: it writes `packages/core/shared/**` (committed) and rewrites the re-export list in `packages/core/README.md` from `README_TEMPLATE.md`. Commit both.
3. JSX runtime (since #17932): `configs/base.tsconfig.json` has `"jsx": "react-jsx"` and `"jsxImportSource": "@theia/core/shared/react"`.
   `packages/core/tsconfig.json` intentionally overrides `"jsxImportSource": "react"` because core cannot import its own re-export; it resolves to the same module. Do not "align" it (see `CLAUDE.md`).
   Do not import React only for JSX ([doc/coding-guidelines.md](../../../../../doc/coding-guidelines.md) React 1.); `noUnusedLocals` reports such imports after a runtime switch.
4. Major update code changes (what React 18 and 19 needed):
   - `ReactDOM.render` / `unmountComponentAtNode` → `createRoot` from `@theia/core/shared/react-dom/client` + `root.unmount()`; one `createRoot` per container. Render callbacks are gone: use ref callbacks or `useEffect` (`onRender` was removed from `ReactWidget`/`ReactDialog` in #11455).
   - React 18: `children` must be declared explicitly in props; state updates are batched everywhere (#11455).
   - React 19 types: global `JSX` → `React.JSX`; `useRef<T>()` → `useRef<T>(undefined)`; `RefObject<T>` → `RefObject<T | null>` (or let `createRef` infer it); ref callbacks must not return a value (`ref={el => { this.x = el ?? undefined; }}`) and must not be `async`; `ReactElement` props default to `unknown` (#17567, #17708, #17932).
   - Keys: a component called as a function (`elements.map(e => Comp(e))`) has to become `<Comp key=… {...e} />` (#17567).
5. Check each React library's `peerDependencies` in `package-lock.json` accepts the new major. `react-virtualized` had to be replaced by `react-virtuoso` for React 18 (#11553).
6. Breaking changes (major or peer range change): `CHANGELOG.md` breaking-changes entry and a `doc/Migration.md` section for the release (peer ranges, adopter `package.json` changes, link to the upstream upgrade guide, the most likely code change). Open the Theia IDE ticket (`toDoWithRelease`, `dependencies`).

## Coupled versions

| When this changes | Also update |
|---|---|
| `react` | `react-dom` to the identical version (`react-dom` 19.3.0 peers `react: ^19.3.0`) |
| `react` major | `@types/react`, `@types/react-dom` same major; `peerDependencies` ranges in `packages/core/package.json`; README re-export list (regenerated) |
| `react` major | React libraries whose `peerDependencies` exclude the new major |
| `@types/react` | `@types/react-dom` (peers `@types/react` of the same minor) |
| new `react*` subpath used in code | `theiaReExports` entry + regenerated `shared/` and README |

## Checks

- `npm ls react react-dom @types/react @types/react-dom`: exactly one version of each, all deduped. Two React instances break hooks and context.
- `npm run compile` and `npm run lint`: no unused React imports, no `'React' refers to a UMD global`.
- Tests touching React rendering: `npx lerna run test --scope @theia/core --scope @theia/scm --scope @theia/ai-mcp --scope @theia/ai-chat-ui --scope @theia/getting-started --scope @theia/plugin-ext`.
- Optional: a downstream extension still compiles with the old `jsx: "react"` setting.
- Manual smoke test (`npm run build:browser && npm run start:browser`, dev tools console open, no React errors or warnings): trees (explorer, outline, SCM, history graph), notifications, AI chat view incl. blocked-resource placeholders, preferences editor, debug exception widget (uncaught exception while debugging), notebook cell outputs, a singleton dialog opened and closed twice. Repeat in Electron.

## Known issues

### `TypeError: unexpected property: Symbol(Symbol.toStringTag)` crashing the React DOM

React 19 dev mode calls `Object.prototype.toString` on props while diffing, which probed `Symbol.toStringTag` on the preference proxy, and its `get` trap threw for non-string properties.
Fix: return `undefined` for `Symbol.toStringTag` in `preference-proxy.ts` and `injectable-preference-proxy.ts`. (#17567)

### `Unknown Webview` unhandled promise rejections from notebook cell outputs

React 19 ref callbacks may return cleanup functions, so the `async` ref callback in `CellOutputWebview.render()` had to become synchronous; React then clears the ref while the delayed attach is pending, and late `$setHtml`/`$setOptions` calls hit a disposed webview.
Fix: keep `this.element` in sync and guard against double attach (#17567); `WebviewsMainImpl` `$`-methods no-op for unknown webviews like VS Code (#17956).

### `Warning: You are calling ReactDOMClient.createRoot() on a container that has already been passed to createRoot()`

Singleton `ReactDialog`s reset `isMounted` on close but never set it again, so reopening created a second root.
Fix: set `this.isMounted = true` in `onUpdateRequest` of `react-dialog.tsx`. (#16306)

### React specs fail after JSDOM teardown, assert before rendering finished, or warn about `act(...)`

`root.render` is asynchronous in React 18+ and unmounting flushes passive effects on a `setImmediate` that touches `window`.
Fix: wrap renders in `flushSync` or `React.act` with `enableReactActEnvironment()` from `@theia/core/lib/browser/test/jsdom`, and `await new Promise(r => setImmediate(r))` in `afterEach` before disabling JSDOM. (#17567, #17708, #17932)

### `react-virtualized` incompatible with React 18

It required `react` resolutions in the root `package.json`.
Fix: replaced by `react-virtuoso`, re-exported as `@theia/core/shared/react-virtuoso`. (#11553)

## Log

Newest first. One entry per merged update and target branch.

| Date | Branch | From → To | PR | Notes |
|---|---|---|---|---|
| 2026-10-12 | master | 19.2.8 → 19.3.0 | #18149 | NPM upgrade after 1.76.0; `@types/react`/`@types/react-dom` → 19.3.0 |
| 2026-09-15 | master | `@types/react-dom` 19.2.4 → 19.2.7 | #18005 | NPM upgrade after 1.75.0 |
| 2026-08-26 | master | 18.3.1 → 19.2.8 | #17932 | Dropped React 18 (peers `^19.0.0`), automatic JSX runtime, new `react/jsx-*` and `react-dom/server` re-exports; breaking, Migration v1.75.0. Follow-up #17956 |
| 2026-07-13 | master | `@types/react` 18.3.28 → 18.3.31 | #17741 | NPM upgrade |
| 2026-06-25 | master | (18.3.1) | #17708 | Specs added after #17567 made React 19 compatible |
| 2026-06-18 | master | 18.3.1 (peer `^18.3.1 \|\| ^19.0.0`) | #17567 | React moved to peer + dev dependencies of core; React 19 type/ref fixes; breaking (1.73.0) |
| 2026-04-10 | master | 18.2.0 → 18.3.1 | #17282 | NPM upgrade; `react-tooltip` 4.5.1, `react-virtuoso` 2.19.1 |
| 2025-09-23 | master | — | #16306 | Fix duplicate `createRoot` on singleton dialogs |
| 2022-08-16 | master | — | #11553 | `react-virtualized` → `react-virtuoso` |
| 2022-08-09 | master | 16.8.0 → 18.2.0 | #11455 | `createRoot`, `onRender` removed, `react-dom/client` re-export; Migration v1.29.0 |
