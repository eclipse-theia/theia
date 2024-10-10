# AI Llamafile Integration

The AI Llamafile package provides an integration that allows users to manage and interact with Llamafile language models within Theia IDE.

## Features

-   Start and stop Llamafile language servers.

## Commands

### Start Llamafile

-   **Command ID:** `llamafile.start`
-   **Label:** `Start Llamafile`
-   **Functionality:** Allows you to start a Llamafile language server by selecting from a list of configured Llamafiles.

### Stop Llamafile

-   **Command ID:** `llamafile.stop`
-   **Label:** `Stop Llamafile`
-   **Functionality:** Allows you to stop a running Llamafile language server by selecting from a list of currently running Llamafiles.

## Usage

1. **Starting a Llamafile Language Server:**

    - Use the command palette to invoke `Start Llamafile`.
    - A quick pick menu will appear with a list of configured Llamafiles.
    - Select a Llamafile to start its language server.

2. **Stopping a Llamafile Language Server:**
    - Use the command palette to invoke `Stop Llamafile`.
    - A quick pick menu will display a list of currently running Llamafiles.
    - Select a Llamafile to stop its language server.

## Dependencies

This extension depends on the `@theia/ai-core` package for AI-related services and functionalities.

## Configuration

Make sure to configure your Llamafiles properly within the preference settings.
This setting is an array of objects, where each object defines a llamafile with a user-friendly name, the file uri, and the port to start the server on.

Example Configuration:

```json
{
    "ai-features.llamafile.llamafiles": [
        {
            "name": "MyLlamaFile",
            "uri": "file:///path/to/my.llamafile",
            "port": 30000
        }
    ]
}
```
