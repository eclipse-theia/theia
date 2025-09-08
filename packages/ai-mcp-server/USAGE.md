# MCP Server Usage Examples

This document provides practical examples of how to use the Theia MCP Server.

## Testing the MCP Server

### Using WebSocket-based Clients (Recommended)

For testing use: `npx @modelcontextprotocol/inspector` open the app with the token pre-filled.
In the app select Streamable HTTP as the Transport Type and add your endpoint (e.g. `http://localhost:3000/mcp`) in the URL field.

## Available Tools

The MCP server currently has the following tools available:

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `test-tool` | A simple test tool for verification | None |

Additional tools are added through backend and frontend contributions.

## Integration with AI Agents

The MCP server is designed to be integrated with AI agents and tools that follow the Model Context Protocol specification. These agents can use the provided tools to interact with the Theia workspace.

## Security Considerations

- The MCP server has full access to Theia's command system and workspace
- Only enable the server in trusted environments
- Consider using authentication/authorization for HTTP transport in production

## Debugging

Enable debug logging by setting the log level:

```bash
THEIA_LOG_LEVEL=debug theia start
```

The server will log MCP operations, session management, and error details.

## Development Notes

When developing against the MCP server, note that it uses:

1. JSON-RPC 2.0 over HTTP
2. Streamable HTTP transport that requires specific headers and protocol handling
3. Session management via the `mcp-session-id` header

For development and testing purposes, examine the server logs when `THEIA_LOG_LEVEL=debug` is enabled to understand the expected protocol interactions.
