<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - AI MCP UI EXTENSION</h2>

<hr />

</div>

## Description

The Model Context Server (MCP) UI Integration package provides the UI for users to start and use MCP servers

### Features

- Start and stop MCP servers.
- Provide preference schema for autocomplete etc. in preferences

### Commands

#### Start MCP Server

- **Command ID:** `mcp.startserver`
- **Label:** `MCP: Start MCP Server`
- **Functionality:** Allows you to start a MCP server by selecting from a list of configured servers.

#### Stop MCP Server

- **Command ID:** `mcp.stopserver`
- **Label:** `MCP: Stop MCP Server`
- **Functionality:** Allows you to stop a running MCP server by selecting from a list of currently running servers.

### Usage

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

### Configuration

To configure MCP servers, open the preferences and add entries to the `MCP Servers Configuration` section.
See the Theia MCP package (`@theia/ai-mcp`) README for more information.

### More Information

[Theia AI MCP README](https://github.com/eclipse-theia/theia/tree/master/packages/ai-mcp)
[User documentation on MCP in the Theia IDE](https://theia-ide.org/docs/user_ai/#mcp-integration)
[List of available MCP servers](https://github.com/modelcontextprotocol/servers)

## Additional Information

- [API documentation for `@theia/mcp-ui`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_ai-mcp-ui.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
