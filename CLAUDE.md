# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ AI Agent Quick Reference

**Never run `.ts` source files directly** with `npx tsx`, `ts-node`, or `node` in this repo. Packages import each other's compiled `lib/` output — running source will fail with module-not-found errors. Always compile first.

| Goal | Command |
|---|---|
| Compile TypeScript | `npm run compile` |
| Build + bundle UI (required for UI testing) | `npm run build:browser` |
| Start app | `npm run start:browser` |
| Run all tests | `npm run test` |
| Test one package | `npx lerna run test --scope @theia/package-name` |
| Compile one package | `npx lerna run compile --scope @theia/package-name` |
| Run a single compiled test file | `npx mocha ./packages/core/lib/browser/some-file.spec.js` |
| Check upstream drift | `node scripts/qaap-drift-check.js` |

**Verify sequence after any code change:**
1. `npm run compile` — TypeScript errors
2. `node scripts/qaap-drift-check.js` — drift policy
3. `npm run build:browser` — only if UI changes need testing in browser

**Critical Qaap product contract:** Work Hub is the default surface after every browser reload. The classic IDE may open only after an explicit in-runtime "Open IDE" action, and that choice must never survive reload/F5. Do not persist desktop-IDE preference in `sessionStorage`, `localStorage`, URL state, or restored layout. See `.cursor/rules/work-hub-reload-default.mdc`.

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
- **Mobile touch scroll (critical):** nested lists inside flex overlays must use `min-height: 0` + native overflow and be listed in `qaap-mobile-touch-scroll.css` and `MOBILE_VERTICAL_SCROLL_SELECTOR` (`mobile-vertical-touch-scroll.ts`). See `.cursor/rules/mobile-touch-accessibility.mdc`.
- **Work Hub reload default (critical):** reload/F5 must land directly in Work Hub, never the IDE, unless the user opens the IDE again in the current runtime. Keep `markPreferDesktopIde()` memory-only and keep `qaap-login-gate.js` clearing stale desktop-IDE keys before boot.

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

## Upstream-Drift Policy and Migration Plan

**The rule:** all new Qaap product code lives under `packages/qaap-*`. Do not modify files inside upstream Theia packages (`packages/<anything not starting with qaap->`). Drift is enforced in CI by `scripts/qaap-drift-check.js`: every file that differs from `upstream/master` must be either inside `packages/qaap-*`, matched by a regex in the `ALLOWED` list (with a comment explaining why), or listed in `scripts/qaap-drift-baseline.txt` (currently empty — no undocumented drift).

### Extraction patterns by change type

When a Qaap product behaviour requires changing a Theia file, use one of these patterns instead of editing the upstream file:

| Change type | Extraction pattern |
|---|---|
| Preference default | Add a new `PreferenceContribution` in a `qaap-*` package |
| Branding string | Rebind the `Symbol`-backed messages object, or use `FrontendApplicationConfigProvider.applicationName` |
| CSS rule | Add the rule to a `qaap-product-theme` stylesheet and import it from `qaap-product-theme-frontend-module.ts` |
| Service / widget behaviour | Subclass the upstream class in `qaap-*` and `rebind(UpstreamClass).to(QaapSubclass)` in the frontend module |
| Contribution (menu / keybinding / command) | Add a new `Contribution` in `qaap-*`; never edit the upstream one |
| "Fork lag" (upstream improved a file we haven't picked up) | `git checkout upstream/master -- <file>` and re-verify build; not really product code |

### Remaining upstream packages still touched (15 as of last audit)

Each entry should eventually be removed by extracting product behaviour into `packages/qaap-*` and reverting the upstream file. Listed in descending file count:

- **`core`** (17 files) — mostly small seams already in the allowlist (`workbench-top-bar-factory`, `mobile-layout-state`, several `shell` / `menu` files). The big residuals are `backend-application.ts` and `backend-application-module.ts` (fork lag: missing upstream's graceful-shutdown machinery and the `RootContainer` symbol — decide per-file whether to re-sync or keep simplified).
- **`ai-ide`** (14 files) — model-alias configuration UI, command/prompt templates, and `workspace-functions.ts` (−291 lines: removed `TrustAwarePreferenceReader` and the external-path allowlist; reassess against the current upstream Theia AI release).
- **`plugin-ext`** (7 files) — plugin host, view registry, webview-resource-cache customizations. Sensitive area: extract via subclass + rebind one file at a time.
- **`mini-browser`** (7 files) — most already seamed for the Element Inspector and mobile open-handler; a few remain.
- **`workspace`** (4 files) — trust dialog and trust service customizations.
- **`monaco`** (3 files) — quick-input layout and frontend-module seams already documented.
- **`ai-code-completion`** (3 files) — agent and variable-contribution customizations.
- **`ai-chat`**, **`ai-chat-ui`**, **`ai-core`**, **`ai-terminal`** (2 files each) — subclass the relevant renderer / contribution and rebind in a `qaap-*` package.
- **`scm`** (1 file) — adds `collapseContainingPanel()` and single-click open for mobile; needs subclass of `ScmTreeWidget` + `ScmResourceComponent` together, then visual verification on a narrow viewport.
- **`plugin-ext-vscode`** (1 file) — fork lag (upstream's ESM loader hook removed in fork). Decide whether to re-adopt.
- **`ai-anthropic`** / **`ai-google`** (1 file each) — preference defaults; needs a schema-merge pattern or a higher-priority `PreferenceContribution`.

### Open extraction tasks (ordered by recommended priority)

Pick the next task off this list. Each is independent — extract one, verify, commit, and tick the box. The order goes from low-risk quick wins to multi-session efforts.

**Tier 1 — Quick wins (1 file, ~1 session each)**

- [x] **ai-anthropic preference defaults.** Extracted to `QaapAiModelDefaultsContribution` in `qaap-ai-config`; upstream reverted.
- [x] **ai-google preference defaults.** Same — extracted alongside Anthropic via `service.registerOverride()`.
- [x] **scm mobile single-click + auto-collapse.** Extracted to `QaapScmTreeWidget` / `QaapScmResourceComponent` in `qaap-mobile-shell`. `packages/scm/src/browser/scm-tree-widget.tsx` now keeps only protected/optional seam hooks for resource rendering and inline-action callbacks. Compile verified; still needs manual narrow-viewport SCM click-through when a repo with changes is available.
- [x] **plugin-ext-vscode ESM loader hook.** Re-adopted upstream — was pure fork lag (no fork commits had touched the file).

**Tier 2 — Medium (2–3 files, subclass + rebind)**

- [x] **ai-chat** (`chat-content-deserializer.{ts,spec.ts}`). Re-adopted upstream (fork lag — upstream added interrupted-tool-call handling and `createToolCallError`).
- [x] **ai-chat-ui** (`toolcall-part-renderer.tsx`, `generic-capabilities-tree.tsx`). Re-adopted upstream — fork's branding edits had regressed the configurable `applicationName` back to a hardcoded "Theia" string.
- [x] **ai-core** (`theia-variable-contribution.ts`). Re-adopted upstream (same branding regression as ai-chat-ui).
- [x] **ai-terminal**: `shell-execution-tool-renderer.tsx` re-adopted upstream (fork lag); `shell-execution-server-impl.ts` extracted to `QaapShellExecutionServerImpl` in `qaap-ai-config` (cwd resilience: basename fallback + ENOENT message rewrite).
- [x] **ai-code-completion** (`code-completion-agent.ts` + 2 specs). Re-adopted upstream (restores `reasoning='off'` for one-shot completion and `applicationName` branding).
- [-] **monaco** (`monaco-quick-input-{layout,service}.ts`, `monaco-frontend-module.ts`). **Accepted as permanent seam.** The factory `MonacoQuickInputLayout` is a textbook upstream-style DI seam consumed by `qaap-mobile-shell`; reverting and subclassing `MonacoQuickInputImplementation` would require duplicating `@postConstruct init()` (~30 lines copy-paste). Net result is worse coupling.

**Tier 3 — Larger surfaces (4–7 files)**

- [x] **workspace** (4 files: trust dialog/factory/service + frontend-module). The 4 upstream files stay allowlisted as documented seams; `QaapWorkspaceTrustDialog` + `QaapWorkspaceTrustDialogFactory` in `qaap-extensions` now consume the seam so the branded label uses `applicationName`.
- [x] **mini-browser** (7 files). Verified — all 7 are justified: the `MiniBrowserOpenHook` seam is consumed by `QaapMiniBrowserOpenHookBridge` in `qaap-adapters`; the new `mini-browser-url-utils.{ts,spec.ts}`, `mini-browser-opener-options.ts`, `mini-browser-open-hook.ts` are co-located with the upstream files that consume them (moving them creates a back-dep anti-pattern).
- [x] **plugin-ext** (7 files). 5 re-adopted from upstream (fork-lag ESM plugin machinery + small null-check); `webview-resource-cache.ts` extracted to `QaapWebviewResourceCache` in `qaap-extensions`; `plugin-view-registry.ts` left allowlisted (intentional product behavior — qaap is a cloud IDE so the "Open Folder" welcome view is omitted).

**Tier 4 — Multi-session projects**

- [x] **ai-ide** (12 files). Residual entries are documented seams:
    - 4 branding-regression files re-adopted from upstream (`ide-chat-welcome-message-provider.tsx`, `pr-review-prompt-template.ts`, `command-chat-agents.ts`, `command-prompt-template.ts`). Fork was hardcoding "Theia" / "Theia IDE" in places upstream already passes `applicationName` / `productName`.
    - Remaining (accepted as documented seams):
        - `language-model-renderer.tsx` + `model-aliases-configuration-widget.tsx` + matching CSS — implement the "free model" badge feature for NVIDIA NIM / OpenRouter. Tightly coupled to upstream widget render code; clean extraction would require duplicating ~250 lines.
        - `workspace-launch-provider.ts` — defensive `JSON.parse('')` guard in an inline `ToolProvider.getTool()` handler; subclassing requires duplicating ~30 lines of tool definition for a 1-line fix.
        - `package.json` + `tsconfig.json` — add direct deps on `qaap-ai-nvidia` / `qaap-ai-openrouter` that the free-badge feature needs.
    - Re-adopted from upstream:
        - `workspace-functions.{ts,spec.ts}`, `context-file-validation-service-impl.spec.ts`, and the `ALLOWED_EXTERNAL_PATHS_PREF` part of `common/workspace-preferences.ts`: restored `TrustAwarePreferenceReader`, external-path allowlist, path-traversal hardening, and upstream tests.
- [ ] **core** (residuals after Tier 1–3 cleanups). Mostly already-allowlisted small seams **justified by qaap consumers** (e.g. `WorkbenchTopBarFactory` → `qaap-mobile-shell`, `ElectronMainApplication.resolveApplicationIconPath` → `qaap-product`). Real outstanding work:
    - `backend-application.{ts,-module.ts}` + `backend-application.spec.ts` re-adopted from upstream: restored graceful shutdown, `RootContainer`, async `onStop`, and upstream tests.
    - yargs `v15 → v17` upgrade across `core`, `dev-packages/{cli,application-manager,private-re-exports}` (would clean 4–5 files in one go). Attempted in 2026-05; aborted because `npm install` cascaded into a zod/MCP-SDK type-resolution conflict in `ai-mcp-server`. Needs a proper dependency-graph investigation (likely pin zod or align MCP SDK) before retrying.
    - `application-shell.ts`: small top-bar-visibility tweak (16 lines). Subclass point is buried inside a heavily-used class; current allowlist entry is defensible.
    - `select-component.{tsx,css}`: mobile bottom-navigation z-index + dropdown clip logic. Tied to a React component instantiated via JSX (not DI), so cannot be substituted via rebind. Accepted seam.

### Workflow per extraction

1. Read the diff: `git diff upstream/master -- <file>`.
2. Decide: real product code → extract (next step); fork lag → revert with `git checkout upstream/master -- <file>` and skip to step 4.
3. If extracting: create or edit a `packages/qaap-*` package, add the rebind in its frontend module, then revert the upstream file (`git checkout upstream/master -- <file>`).
4. Drop the matching regex from `ALLOWED` in `scripts/qaap-drift-check.js`.
5. Verify in this order: `npm run compile`, `node scripts/qaap-drift-check.js`, `npm run build:browser`, and (for UI behaviour) `npm run start:browser` plus exercising the affected flow at the relevant viewport.
6. Commit per extraction so a regression can be bisected.

### End state

Zero entries in the per-package section of `ALLOWED`. Baseline empty. `git merge upstream/master` produces no conflicts inside `packages/<upstream>/...`. New Theia releases can be adopted with a single `git merge` and a green CI.

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
