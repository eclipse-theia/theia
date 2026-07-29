# Theia Sample Plugins

A small collection of minimal VS Code extensions used by Theia to exercise the plugin runtime. Each plugin lives under `sample-namespace/` and registers a simple `Hello from <plugin-name>` command. Some demonstrate specific runtime variants (browser-only, ESM, etc.).

## Test sample plugin in Theia example applications

Two options:

### A) Copy the plugin folder into the deployed `plugins` directory

1. Optional: download the bundled VS Code built-ins via `npm run download:plugins`.
2. Copy the plugin into the deployed `plugins` directory:

    ```sh
    cp -r sample-plugins/sample-namespace/<plugin-name> plugins/
    ```

3. Start the example app, e.g.:

    ```sh
    npm run start:browser
    ```

4. Open the command palette and run `Hello from <plugin-name>`.

### B) Install from the Extensions view

1. Package the plugin as a `.vsix`. From inside the plugin folder:

    ```sh
    npm run build
    ```

    This runs `vsce package --no-dependencies` and produces a `<plugin-name>-<version>.vsix` next to the source files.

2. Start Theia, e.g. `npm run start:browser`.
3. Open the Extensions view.
4. Use the `...` menu and pick `Install from VSIX...`, then select the built `.vsix`.
5. Open the command palette and run `Hello from <plugin-name>` to verify.
