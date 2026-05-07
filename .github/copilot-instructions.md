# GitHub Copilot Instructions for Eclipse Theia

<!-- Read by all Copilot features (chat, coding agent, built-in reviewer).
     Provides project context and doc references only — no feature-specific rules.
     Coding rules: .github/instructions/theia-coding.instructions.md
     Review rules: .github/instructions/theia-review*.instructions.md -->

## Project Context

Before answering any question or performing any task, read the following files to understand the project:

- `CLAUDE.md` — architecture overview, essential commands, key patterns, and technical requirements
- `.prompts/project-info.prompttemplate` — detailed project information including widgets, commands, toolbars, preferences, plugin API, styling, and filesystem access patterns

## Documentation

The authoritative references for all project standards are:

- `doc/coding-guidelines.md` — coding conventions (formatting, naming, DI, React, URIs, i18n, CSS, theming)
- `doc/code-organization.md` — package structure and platform folder rules (`common/`, `browser/`, `node/`, `electron-*`)
- `doc/pull-requests.md` — PR rules, review checklist, approving and requesting changes
- `doc/Testing.md` — test structure, file naming (`*.spec.ts`, `*.ui-spec.ts`), how to run tests
- `doc/api-management.md` — API stability, breaking change policy, deprecation

## Code Reviews

Review rules are split across instruction files in `.github/instructions/` that are loaded automatically:

- `theia-review.instructions.md` — review tone, priority labels, comment style
- `theia-review-checklist.instructions.md` — PR template and review checklist verification
- `theia-review-code.instructions.md` — codebase integration, coding rules, architecture
