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
- Lerna-managed monorepo with 77 packages
- `/packages/` - Runtime packages (core + extensions)
- `/dev-packages/` - Development tooling (application-manager, cli, eslint-plugin, ext-scripts)
- `/examples/` - Sample applications (browser, electron, browser-only, playwright)
- `/configs/` - Shared config files (tsconfig, eslint, mocha, nyc)

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
