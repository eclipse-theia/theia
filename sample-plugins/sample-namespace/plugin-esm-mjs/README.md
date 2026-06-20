# plugin-esm-mjs

A sample VS Code extension delivered as an ECMAScript module via the `.mjs`
file extension.

Unlike `plugin-esm`, this sample does **not** set `"type": "module"` in
`package.json`. The `.mjs` extension on `extension.mjs` is enough to tell
Node to load the file as ESM. Theia detects this by inspecting the entry
point's extension and dispatches to `import()` instead of `require()`.
