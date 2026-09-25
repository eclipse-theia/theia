# Theia Sample Plugins

A small collection of minimal VS Code extensions used by Theia to exercise the plugin runtime. Each plugin lives under `sample-namespace/`. Most register a simple `Hello from <plugin-name>` command; the rest demonstrate a specific runtime variant (browser-only, ESM, headless) or a specific API, and say how to exercise them in their own README.

## Test sample plugin in Theia example applications

Copy the plugin folder into the deployed `plugins` directory. The plugins are plain, unbundled VS Code extensions, so no packaging step is needed.

1. Optional: download the bundled VS Code built-ins via `npm run download:plugins`.
2. Copy the plugin into the deployed `plugins` directory:

    ```sh
    cp -r sample-plugins/sample-namespace/<plugin-name> plugins/
    ```

3. Start the example app, e.g.:

    ```sh
    npm run start:browser
    ```

4. Open the command palette and run `Hello from <plugin-name>`, or the steps in the plugin's own README.

## Package a sample plugin as a `.vsix`

Only needed to exercise the `Install from VSIX...` flow or to hand a sample plugin to someone outside this repository. For everything else, prefer copying the folder as described above.

The `build` script fetches `vsce` on demand via `npx`, so it needs network access the first time. It is cached under `~/.npm/_npx` and reused afterwards, not installed globally and not added to this repository.

1. From inside the plugin folder:

    ```sh
    npm run build
    ```

    This runs `npx @vscode/vsce@3 package --no-dependencies` and produces a `<plugin-name>-<version>.vsix` next to the source files.

2. Start Theia, e.g. `npm run start:browser`.
3. Open the Extensions view.
4. Use the `...` menu and pick `Install from VSIX...`, then select the built `.vsix`.
5. Open the command palette and run `Hello from <plugin-name>` to verify.
