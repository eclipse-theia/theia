# plugin-browser

A minimal example of a browser-only VS Code extension that runs inside the Theia plugin web worker.
It registers a single command, `plugin-browser.hello`, which displays an information message.

## How to use

1. Optional: download the bundled VS Code built-ins via `npm run download:plugins`.
2. Copy this plugin into the deployed `plugins` directory:

    ```sh
    cp -r sample-plugins/sample-namespace/plugin-browser plugins/
    ```

3. Start the browser example app:

    ```sh
    npm run start:browser
    ```

4. Open the command palette and run `Hello from plugin-browser`.
