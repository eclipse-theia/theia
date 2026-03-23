---
applyTo: "**"
excludeAgent: "coding-agent"
description: "Coding standards, architecture, and accessibility rules for Theia code reviews"
---

# Theia Review Code Instructions

## Codebase Integration

Search for existing equivalents before flagging anything missing. If something already exists, the new code is wrong. Read surrounding code, not just the diff in isolation.

Permalinks required for any claim about existing code:
`https://github.com/eclipse-theia/theia/blob/<base-sha>/<path>#L<n>`
Get line numbers from `git show origin/master:<path>`, not the PR branch.

## Key Coding Rules

Most commonly violated rules (with examples):

- `undefined` not `null`; single quotes; explicit return types; semicolons always
- Property injection, not constructor injection; `@postConstruct` for init; `inSingletonScope()`

```ts
// bad — constructor injection is a breaking change
constructor(@inject(Shell) shell: Shell) { }
// good
@inject(Shell) protected readonly shell: Shell;
```

- `bindRootContributionProvider` not `bindContributionProvider` (latter causes memory leaks in top-level modules)
- No `.bind(this)` or inline arrow functions in JSX:

```ts
// bad — new function on each render
<div onClick={this.handle.bind(this)} />
<div onClick={() => this.handle()} />
// good — class property arrow function
protected handle = () => { ... };
<div onClick={this.handle} />
```

- No inline styles; no hard-coded colors — use `ColorContribution` and CSS variables (`var(--theia-*)`)
- Pass URIs (as strings) between frontend and backend, never raw OS paths; never string-concatenate URIs — use `new URI(str).join(segment)`
- Platform folders — never import across boundaries: `common/` (everywhere), `browser/` (imports `common`), `browser-only/` (imports `common`), `node/` (imports `common`), `electron-node/` (imports `common`, `node`), `electron-browser/` (imports `common`, `browser`), `electron-main/` (imports `common`, `node`, `electron-node`)
- Use `console` for root-level logging, not `ILogger`

## VS Code Internal API

Never export a type, function, or variable from `@theia/monaco-editor-core/esm/vs` from a Theia package. Adopters must not depend on VS Code internals. Flag any PR that spreads `esm/vs` imports.

## Architecture

- Does the PR fit existing patterns, or is it reinventing something Theia already provides?
- Substantial behavior or API changes need reviews from multiple contributing organizations.

## Accessibility

For UI changes (WCAG 2.2 AA): all interactive elements keyboard operable with visible focus; no color alone to convey information; icons use `currentColor` for forced-colors mode; form controls have visible labels with error messages associated to their field.
