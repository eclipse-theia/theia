# @theia/qaap-product

Single dependency for Qaap browser/Electron example apps. Pulls the product layer transitively:

| Package | Role |
|---------|------|
| `@theia/qaap-shell` | `ApplicationShell`, side panel, dock tab bars |
| `@theia/qaap-adapters` | Mini-browser + Monaco quick-input hooks |
| `@theia/qaap-extensions` | AI chat, outline, memory inspector, navigator (mobile) |
| `@theia/qaap-mobile-shell` | Workbench top bar, one-column mobile layout |
| `@theia/qaap-product-theme` | Product CSS (narrow viewport, side panel, VSX, …) |
| `@theia/qaap-element-inspector` | Element inspector (also required by `@theia/mini-browser`) |

## Usage

In `examples/browser` or `examples/electron` `package.json`:

```json
"dependencies": {
  "@theia/qaap-product": "1.71.0"
}
```

Do **not** list each `@theia/qaap-*` package unless you need a direct import.

Do **not** add `@theia/ai-copilot` by default — Qaap uses its own agentic AI. The built-in Copilot status bar and provider stay disabled (`ai-features.copilot.enabled: false`) unless you opt in or install a GitHub Copilot VSX extension.

## Upstream sync

- Merge `upstream/master` on a branch; resolve conflicts in **core seams** (`WorkbenchTopBarFactory`, `mobile-layout-state`, mini-browser/monaco hooks).
- Run `npm run qaap:drift-check` — fails on **new** drift outside `packages/qaap-*`, the documented allowlist, or `scripts/qaap-drift-baseline.txt` (historical paths to migrate).
- Run `npm run qaap:drift-report` for a full path listing.
- Validate: `npm run build:browser`, then mobile viewport ~375px.

## Architecture

```
upstream Theia core (minimal seams)
        ↓
@theia/qaap-shell + qaap-adapters + qaap-extensions (DI rebinds)
        ↓
@theia/qaap-product-theme + qaap-mobile-shell (UI)
        ↓
example app depends only on @theia/qaap-product
```

Never patch `BrowserMenuBarContribution.appendMenu()` with async DOM hacks; use `rebind(WorkbenchTopBarFactory)`.
