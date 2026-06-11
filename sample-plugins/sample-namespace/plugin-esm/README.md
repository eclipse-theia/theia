# plugin-esm

A sample VS Code extension shipped as an ECMAScript module (ESM).

The `package.json` declares `"type": "module"`, so Node treats `extension.js`
as ESM. The entry point uses `import * as vscode from 'vscode'` and
`export function activate(...)` instead of CommonJS `require` / `exports`.

This mirrors how recent built-in VS Code extensions (e.g. `vscode.github`)
are packaged. Loading it exercises the Theia plugin host's ESM support.
