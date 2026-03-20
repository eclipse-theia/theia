---
applyTo: "**"
excludeAgent: "coding-agent"
description: "Project architecture and conventions context for Theia code reviews"
---

# Theia Review Context

This file provides project context that the reviewer needs to evaluate PRs. The code reviewer cannot read repository files directly, so essential context is inlined here.

## Project Structure

Lerna monorepo with packages under `packages/` (runtime extensions) and `dev-packages/` (tooling). Each package can contribute to frontend and/or backend:

- `src/common/` — shared code (no DOM, no Node.js APIs)
- `src/browser/` — frontend (DOM APIs, InversifyJS DI container)
- `src/node/` — backend (Node.js APIs, InversifyJS DI container)
- `src/browser-only/` — frontend without a Node.js backend (imports `common`)
- `src/electron-node/` — Electron-specific backend (imports `common`, `node`)
- `src/electron-browser/` — Electron renderer (imports `common`, `browser`)
- `src/electron-main/` — Electron main process (imports `common`, `node`, `electron-node`)

Extension entry points are declared in `package.json`:

```json
"theiaExtensions": [{
  "frontend": "lib/browser/my-frontend-module",
  "backend": "lib/node/my-backend-module"
}]
```

## Extension System

- **InversifyJS** for dependency injection; property injection preferred
- **Contribution Points** pattern: `CommandContribution`, `MenuContribution`, `KeybindingContribution`, `FrontendApplicationContribution`, etc.
- `ContributionProvider` instead of `@multiInject` for collecting implementations
- Three extension types: Theia extensions (build-time), VS Code extensions (runtime), Theia plugins (runtime)

## Naming Conventions

- PascalCase for types and enums; camelCase for functions, methods, properties, variables
- Use whole words (`terminalWidgetId` not `termWdgId`)
- kebab-case for files, named after the main exported type
- No `I` prefix on interfaces; use `Impl` suffix for implementations
- Unique names for types, files, and keybinding context keys to avoid collisions
- Event names follow `on[Will|Did]VerbNoun?` pattern

## Interfaces and Types

- Prefer classes over interface + symbol pairs to avoid boilerplate (exception: remote services need interface + symbol)
- Do not export types or functions unless shared across multiple components
- Services should be classes (overridable via DI), not exported functions

## API Stability

- New APIs should always start as experimental
- Breaking an experimental API is allowed in a minor release; breaking a stable API requires a major release and a deprecation cycle
- Deprecated APIs must have a `@deprecated` JSDoc tag explaining why and what to use instead
