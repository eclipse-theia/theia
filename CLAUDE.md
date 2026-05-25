# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Essential commands:**
- `npm install` - Install dependencies (runs `theia-patch`, `compute-references`, and lerna `afterInstall` hooks)
- `npm run build:browser` - Builds all packages + bundles Browser example app (preferred during development)
- `npm run compile` - Compile TypeScript only (uses `tsc --build` with project references)
- `npm run lint` - Run ESLint across all packages
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run test` - Run all tests

**Important:** `npm run compile` only compiles TypeScript. Before UI testing, you must also run `npm run build:browser` to bundle the frontend via webpack — otherwise the running browser app won't include your latest changes.

**Application commands:**
- `npm run start:browser` - Start browser example at localhost:3000
- `npm run start:electron` - Start electron application
- `npm run watch` - Watch mode for development (browser + electron concurrently)

**Package-specific:**
- `npx lerna run compile --scope @theia/package-name` - Build specific package
- `npx lerna run test --scope @theia/package-name` - Test specific package
- `npx lerna run watch --scope @theia/package-name --include-filtered-dependencies --parallel` - Watch package with dependencies

**Running a single test file (after compile):**
- `npx mocha ./packages/core/lib/browser/some-file.spec.js`

**Test infrastructure:** Tests use Mocha + NYC (Istanbul) for coverage. Config at `configs/mocharc.yml` and `configs/nyc.json`. Each package's `npm test` runs via the `theiaext test` wrapper defined in `dev-packages/private-ext-scripts`, which executes `nyc mocha --config ../../configs/mocharc.yml "./lib/**/*.*spec.js"`.

## Architecture

**Monorepo Structure:**
- Lerna-managed monorepo with ~80 packages in `packages/`
- `/packages/` - Runtime packages (core + extensions)
- `/dev-packages/` - Development tooling (application-manager, cli, eslint-plugin, ext-scripts)
- `/examples/` - Sample applications (browser, electron, browser-only, playwright)
- `/configs/` - Shared config files (tsconfig, eslint, mocha, nyc)

**Qaap product layer (`@theia/qaap-*`, fork-specific):**
- Example apps should depend on **`@theia/qaap-product`** once; it pulls `qaap-element-inspector`, `qaap-mobile-shell`, and `qaap-product-theme` and exposes a minimal frontend module so the extension collector loads them transitively.
- **`@theia/mini-browser`** still lists **`@theia/qaap-element-inspector`** directly (DI and imports from that package).
- Narrow mobile viewport breakpoint for TypeScript: **`MOBILE_NARROW_VIEWPORT_MEDIA_QUERY`** and **`matchesMobileNarrowViewport()`** in `packages/core/src/browser/shell/mobile-layout-state.ts` (keep CSS using the same `767px` breakpoint in sync). Narrow-viewport rules for menus / side panel / dialogs live in **`@theia/qaap-product-theme`** (`qaap-menus-narrow-viewport.css`, `qaap-sidepanel-narrow-viewport.css`, `qaap-dialog-narrow-viewport.css`); apps without that package will not get those overrides.

**Upstream-drift policy and migration plan:**

Rule: all new Qaap product code lives under `packages/qaap-*`; do not modify files inside upstream Theia packages. The CI guard at `scripts/qaap-drift-check.js` enforces this. Files that currently differ from `upstream/master` are either in the regex allowlist (with a comment explaining why) or in `scripts/qaap-drift-baseline.txt` (currently empty).

The fork still touches 15 upstream packages, listed below. Each entry should eventually be removed by extracting product behaviour into a `packages/qaap-*` package and reverting the upstream file. Extraction patterns by change type:

| Change type | Extraction pattern |
|---|---|
| Preference default | New `PreferenceContribution` in a `qaap-*` package |
| Branding string | Rebind the `Symbol`-backed messages object, or use `FrontendApplicationConfigProvider.applicationName` |
| CSS rule | Add the rule to a `qaap-product-theme` stylesheet and import it from `qaap-product-theme-frontend-module.ts` |
| Service / widget behaviour | Subclass the upstream class in `qaap-*` and `rebind(UpstreamClass).to(QaapSubclass)` in the frontend module |
| Contribution (menu/keybinding/command) | Add a new `Contribution` in `qaap-*`; never edit the upstream one |
| "Fork lag" (upstream improved a file we haven't picked up) | `git checkout upstream/master -- <file>` and re-verify build; not really product code |

Remaining packages to extract (descending file count):

- **`core`** (17 files) — mostly small seams (`workbench-top-bar-factory`, `mobile-layout-state`, several `shell`/`menu` files already seamed). The big residual is `backend-application.{ts,-module.ts}` (fork lag: missing upstream's graceful-shutdown machinery and `RootContainer` symbol — decide per-file whether to re-sync or keep simplified).
- **`ai-ide`** (14 files) — model-alias configuration UI, command/prompt templates, `workspace-functions.ts` (−291 lines, removed `TrustAwarePreferenceReader` and external-path allowlists; reassess against current upstream Theia AI release).
- **`plugin-ext`** (7 files) — plugin host / view registry / webview-resource-cache customizations; sensitive area, extract via subclass + rebind one file at a time.
- **`mini-browser`** (7 files) — most already seamed for the Element Inspector and mobile open-handler; a few remain.
- **`workspace`** (4 files) — trust dialog / trust service customizations.
- **`monaco`** (3 files) — quick-input layout + frontend-module seams already documented.
- **`ai-code-completion`** (3 files) — agent and variable-contribution customizations.
- **`ai-chat`**, **`ai-chat-ui`**, **`ai-core`**, **`ai-terminal`** (2 files each) — subclass the relevant renderer/contribution and rebind in a `qaap-*` package.
- **`scm`** (1 file) — adds `collapseContainingPanel()` and single-click open for mobile; needs subclass of `ScmTreeWidget` + `ScmResourceComponent` together, then visual verification on a narrow viewport.
- **`plugin-ext-vscode`** (1 file) — fork lag (upstream's ESM loader hook removed in fork). Decide whether to re-adopt.
- **`ai-anthropic`** / **`ai-google`** (1 file each) — preference defaults; needs schema-merge pattern or a higher-priority `PreferenceContribution`.

Workflow per extraction:
1. Read the diff (`git diff upstream/master -- <file>`).
2. Decide: real product code → extract; fork lag → revert with `git checkout upstream/master -- <file>`.
3. If extracting, create or edit a `packages/qaap-*` package; add the rebind in its frontend module; revert the upstream file.
4. Drop the matching regex from `ALLOWED` in `scripts/qaap-drift-check.js`.
5. Verify: `npm run compile`, `node scripts/qaap-drift-check.js`, `npm run build:browser`, and (for UI behaviour) start the app and exercise the affected flow.
6. Commit per extraction so a regression can be bisected.

End state goal: zero entries in the per-package section of `ALLOWED`, baseline empty, `git merge upstream/master` produces no conflicts inside `packages/<upstream>/...`.

**Platform-specific code organization (per package):**
- `src/common/` - Shared JavaScript APIs (runs everywhere)
- `src/browser/` - Browser/DOM APIs (InversifyJS DI container for frontend)
- `src/node/` - Node.js APIs (InversifyJS DI container for backend)
- `src/electron-browser/` - Electron renderer process
- `src/electron-main/` - Electron main process

**Extension entry points** are declared in each package's `package.json` under `theiaExtensions`:

```json
"theiaExtensions": [{
  "frontend": "lib/browser/editor-frontend-module",
  "backend": "lib/node/editor-backend-module"
}]
```

**Extension System:**
- Dependency Injection via InversifyJS (property injection preferred over constructor injection)
- Contribution Points pattern for extensibility (CommandContribution, MenuContribution, KeybindingContribution, FrontendApplicationContribution, etc.)
- Three extension types: Theia extensions (build-time), VS Code extensions (runtime), Theia plugins (runtime)

## Key Patterns

For more information also look at:
- @doc/coding-guidelines.md
- @doc/Testing.md
- @doc/Plugin-API.md (VS Code extension plugin API)
- @.prompts/project-info.prompttemplate (practical patterns for contributions, widgets, commands, preferences, plugin API, styling)

**Code Style:**
- 4 spaces indentation, single quotes, `undefined` over `null`
- PascalCase for types/enums, camelCase for functions/variables
- Arrow functions preferred, explicit return types required
- Property injection over constructor injection, `@postConstruct()` for initialization

**File Naming:**
- kebab-case for files (e.g., `document-provider.ts`)
- File name matches main exported type
- Platform folders follow strict dependency rules (browser cannot import node, etc.)

**Architecture Patterns:**
- Main-Ext pattern for plugin API (browser Main ↔ plugin host Ext, communicating via RPC)
- Services as classes with DI, avoid exported functions (functions can't be overridden)
- `ContributionProvider` instead of `@multiInject` for collecting multiple implementations
- Use `bindRootContributionProvider` (not `bindContributionProvider`) when binding contribution providers in top-level modules. `bindContributionProvider` retains a reference to whichever child container first resolves it, causing memory leaks. Only use `bindContributionProvider` when contributions are intentionally scoped to a child container (e.g. connection-scoped containers via `ConnectionContainerModule`).
- URI strings for cross-platform file paths, never raw paths
- Localize user-facing strings with `nls.localize()` or `nls.localizeByDefault()`

**Testing:**
- Unit tests: `*.spec.ts`
- UI tests: `*.ui-spec.ts`
- Slow tests: `*.slow-spec.ts`
- Test resources go in `test-resources/` directory

## Technical Requirements

- Node.js ≥20
- TypeScript ~5.9.3 with strict settings (target ES2023, module CommonJS)
- React 18.2.0 for UI components
- Monaco Editor for code editing

**Key Technologies:**
- Express.js for backend HTTP server
- InversifyJS for dependency injection
- Lerna for monorepo management
- Webpack for application bundling
- Lumino 2.x for widget system (tabs, panels, dock layout)

**Key Config Files:**
- `configs/base.tsconfig.json` - TypeScript base config (all packages extend this)
- `configs/base.eslintrc.json` - ESLint parser/base rules
- `configs/build.eslintrc.json` - ESLint build rules (packages extend this)
- `configs/mocharc.yml` - Mocha test runner config
- `configs/nyc.json` - Test coverage config
