# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Essential commands:**
- `npm install` - Install dependencies and run post-install hooks
- `npm run build:browser` - Builds all packages, including example applications and bundles the Browser application (preferred during development)
- `npm run compile` - Compile TypeScript packages only
- `npm run lint` - Run ESLint across all packages
- `npm run test` - Run all tests

**Application commands:**
- `npm run start:browser` - Start browser example at localhost:3000
- `npm run start:electron` - Start electron application
- `npm run watch` - Watch mode for development

**Package-specific (using lerna):**
- `npx lerna run compile --scope @theia/package-name` - Build specific package
- `npx lerna run test --scope @theia/package-name` - Test specific package
- `npx lerna run watch --scope @theia/package-name --include-filtered-dependencies --parallel` - Watch package with dependencies

## Architecture

**Monorepo Structure:**
- Lerna-managed monorepo with 80+ packages
- `/packages/` - Runtime packages (core + extensions)
- `/dev-packages/` - Development tooling
- `/examples/` - Sample applications and examples for API usage

**Platform-specific code organization:**
- `package-name/src/common/*` - Basic JavaScript APIs, runs everywhere
- `package-name/src/browser/*` - Browser/DOM APIs
- `package-name/src/node/*` - Node.js APIs  
- `package-name/src/electron-browser/*` - Electron renderer process
- `package-name/src/electron-main/*` - Electron main process

**Extension System:**
- Dependency Injection via InversifyJS (property injection preferred)
- Contribution Points pattern for extensibility
- Three extension types: Theia extensions (build-time), VS Code extensions (runtime), Theia plugins (runtime)
- `theiaExtensions` in package.json defines module entry points

## Key Patterns

For more information also look at:
- @doc/coding-guidelines.md
- @doc/Testing.md
- @doc/Plugin-API.md (VS Code extension plugin API)

**Code Style:**
- 4 spaces indentation, single quotes, undefined over null
- PascalCase for types/enums, camelCase for functions/variables
- Arrow functions preferred, explicit return types required
- Property injection over constructor injection

**File Naming:**
- kebab-case for files (e.g., `document-provider.ts`)
- File name matches main exported type
- Platform folders follow strict dependency rules

**Architecture Patterns:**
- Main-Ext pattern for plugin API (browser Main ↔ plugin host Ext)
- Services as classes with DI, avoid exported functions
- ContributionProvider instead of @multiInject
- Use `bindRootContributionProvider` (not `bindContributionProvider`) when binding contribution providers in top-level modules. `bindContributionProvider` retains a reference to whichever child container first resolves it, causing memory leaks. Only use `bindContributionProvider` when contributions are intentionally scoped to a child container (e.g. connection-scoped containers via `ConnectionContainerModule`).
- URI strings for cross-platform file paths, never raw paths

**Testing:**
- Unit tests: `*.spec.ts`
- UI tests: `*.ui-spec.ts`
- Slow tests: `*.slow-spec.ts`

## Technical Requirements

- Node.js ≥18.17.0, <21
- TypeScript ~5.4.5 with strict settings
- React 18.2.0 for UI components
- Monaco Editor for code editing

**Key Technologies:**
- Express.js for backend HTTP server
- InversifyJS for dependency injection
- Lerna for monorepo management
- Webpack for application bundling
