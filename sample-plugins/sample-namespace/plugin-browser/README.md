# plugin-browser

A browser-only VS Code extension that runs inside the Theia plugin web worker, both in the browser example and in the browser-only example.

The worker loads it like VS Code's web extension host does, as a CommonJS module. The sample covers:

- an entry point with the `.cjs` extension, which is not served as JavaScript;
- an entry point that assigns `module.exports`, like bundlers emit it;
- `require('vscode')` called after the extension was loaded, which returns the API of this extension.

It contributes two commands:

- `Hello from plugin-browser` displays an information message.
- `Store a Secret from plugin-browser` stores a secret in `context.secrets` and displays the value it reads back.

Run both commands. The extension activates without errors, and the browser console shows no `command … already registered` warning for its commands.
