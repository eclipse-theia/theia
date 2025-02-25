# Model Context Server (MCP) Integration

The AI MCP package provides an integration that allows users to start and use MCP servers to provide additional tool functions to LLMs, e.g. search or file access (outside of the workspace).

## Features
-   Add MCP servers via settings.json
-   Start and stop MCP servers.
-   Use tool functions provided by MCP servers in prompt templates

## Commands

### Start MCP Server

-   **Command ID:** `mcp.startserver`
-   **Label:** `MCP: Start MCP Server`
-   **Functionality:** Allows you to start a MCP server by selecting from a list of configured servers.

### Stop MCP Server

-   **Command ID:** `mcp.stopserver`
-   **Label:** `MCP: Stop MCP Server`
-   **Functionality:** Allows you to stop a running MCP server by selecting from a list of currently running servers.

## Usage

1. **Starting a MCP Server:**

    - Use the command palette to invoke `MCP: Start MCP Server`.
    - A quick pick menu will appear with a list of configured MCP servers.
    - Select a server to start.

2. **Stopping a MCP Server:**
    - Use the command palette to invoke `MCP: Stop MCP Server`.
    - A quick pick menu will display a list of currently running MCP servers.
    - Select a server to stop.

3. **Using provided tool functions**
    - Only functions of started MCP servers can be used
    - Open a prompt template and add the added tool functions
    - Type '~{' to open the auto completion 

## Configuration

To configure MCP servers, open the preferences and add entries to the `MCP Servers Configuration` section. Each server requires a unique identifier (e.g., `"brave-search"` or `"filesystem"`) and configuration details such as the command, arguments, optional environment variables, and autostart (true by default).

`"autostart"` (true by default) will automatically start the respective MCP server whenever you restart your Theia application. In your current session, however, you'll still need to **manually start it** using the `"MCP: Start MCP Server"` command.


Example Configuration:

```json
{
    "ai-features.mcp.mcpServers": {
        "memory": {
            "command": "npx",
            "args": [
              "-y",
              "@modelcontextprotocol/server-memory"
            ],
            "autostart": false
          },
          "brave-search": {
            "command": "npx",
            "args": [
              "-y",
              "@modelcontextprotocol/server-brave-search"
            ],
            "env": {
              "BRAVE_API_KEY": "YOUR_API_KEY"
            }
          },
          "filesystem": {
            "command": "npx",
            "args": [
              "-y",
              "@modelcontextprotocol/server-filesystem",
              "ABSOLUTE_PATH_TO_ALLOWED_DIRECTORY",
            ]
          },
          "git": {
            "command": "uv",
            "args": [
              "--directory",
              "/path/to/repo",
              "run",
              "mcp-server-git"
            ]
          },
          "git2": {
            "command": "uvx",
            "args": [
              "mcp-server-git",
              "--repository",
              "/path/to/otherrepo"
            ]
          }
    }
}
```

Example prompt (for search)
```md
~{mcp_brave-search_brave_web_search}
```

Example User query
```md
Search the internet for XYZ
```

## More Information
[User documentation on MCP in the Theia IDE](https://theia-ide.org/docs/user_ai/#mcp-integration)
[List of available MCP servers](https://github.com/modelcontextprotocol/servers)
