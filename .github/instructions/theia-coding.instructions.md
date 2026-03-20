---
applyTo: "**"
excludeAgent: "code-review"
description: "Coding conventions for the Theia coding agent: style, DI, React, URIs, i18n"
---

# Theia Coding Instructions

<!-- Concise extract of the most commonly violated rules — full detail in doc/coding-guidelines.md.
     Pairs with copilot-instructions.md (always read together). -->

## Code Style

- Single quotes for all strings; semicolons always; 4-space indentation
- `undefined` not `null`
- Explicit return types on all functions and methods
- Arrow functions preferred over anonymous function expressions

## Dependency Injection

- Property injection over constructor injection — adding constructor params is a breaking change
- `@postConstruct` for initialization (event listeners, setup), not the constructor
- Always `inSingletonScope()` for singleton bindings — omitting it creates a new instance per injection
- `bindRootContributionProvider` in top-level modules — `bindContributionProvider` causes memory leaks

## React

No `.bind(this)` or inline arrow functions in JSX — both create a new function on each render and break element caching:

```ts
// bad
<div onClick={this.handleClick.bind(this)} />
<div onClick={() => this.handleClick()} />

// good — class property arrow function
protected handleClick = () => { ... }
<div onClick={this.handleClick} />
```

## URI and Path Handling

- Pass URIs (as strings) between frontend and backend — never raw OS paths
- `FileService.fsPath` on the frontend, `FileUri.fsPath` on the backend to convert to a path
- Never string-concatenate URIs: use `new URI(str).join(segment)` or the `Path` API

## Internationalization

- VS Code strings: `nls.localizeByDefault('Close')` — resolves the VS Code translation key automatically
- Theia strings: `nls.localize('theia/<package>/<id>', 'Default text')`
- Pass dynamic values as args, never interpolated: `nls.localize('key', 'Hello {0}', name)`
- Command labels: `Command.toDefaultLocalizedCommand` (VS Code strings) / `Command.toLocalizedCommand` (custom)

## Code Quality

Avoid these comment anti-patterns:
- Code left commented out instead of deleted
- Changelog-style comments (`// Fixed by X on 2024-01-15`)
- Decorative dividers (`//=========`)
- Comments that restate what the code does (`// increment counter`) — only comment to explain *why*

## Accessibility

When writing UI components, follow WCAG 2.2 AA:
- All interactive elements must be keyboard operable with visible focus
- Do not use color alone to convey information — pair with text or icons
- Icons must use `currentColor` so they adapt to forced-colors / high-contrast mode
- Form controls must have visible labels; associate error messages with their field
- Use Theia's CSS variables and `ColorContribution` — never hard-coded colors
