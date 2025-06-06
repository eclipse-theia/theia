# MCP Server Usage Examples

This document provides practical examples of how to use the Theia MCP Server.

## Starting the MCP Server

### HTTP Transport

```bash
# Enable MCP server with HTTP transport on default port (3001)
THEIA_MCP_SERVER_ENABLED=true theia start

# Specify a custom port and hostname
THEIA_MCP_SERVER_ENABLED=true THEIA_MCP_SERVER_PORT=8080 THEIA_MCP_SERVER_HOSTNAME=0.0.0.0 theia start

# Example: Start on port 4000, accessible from any IP
THEIA_MCP_SERVER_ENABLED=true THEIA_MCP_SERVER_PORT=4000 THEIA_MCP_SERVER_HOSTNAME=0.0.0.0 theia start
```

## Connecting to the MCP Server

The MCP server is built on the Model Context Protocol and uses a JSON-RPC 2.0 API over a streamable HTTP transport.

### Server Information

To check if the server is running and get basic information:

```bash
curl http://localhost:3001/
```

This should return information about the server:

```json
{
  "name": "MCP Theia Server",
  "version": "1.0.0",
  "endpoints": {
    "mcp": "/mcp"
  },
  "transport": "streamable-http"
}
```

## Testing the MCP Server

### Basic Server Availability Check

The simplest way to verify that the MCP server is running is to check the root endpoint:

```bash
curl http://localhost:3001/
```

If this returns server information, the server is running.

### Using WebSocket-based Clients (Recommended)

For testing use: `npx @modelcontextprotocol/inspector` open the app with the token pre-filled.
In the app select Streamable HTTP as the Transport Type and add `http://localhost:3001/mcp` in the URL field.

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
THEIA_LOG_LEVEL=debug THEIA_MCP_SERVER_ENABLED=true theia start
```

The server will log MCP operations, session management, and error details.

## Development Notes

When developing against the MCP server, note that it uses:

1. JSON-RPC 2.0 over HTTP
2. Streamable HTTP transport that requires specific headers and protocol handling
3. Session management via the `mcp-session-id` header

For development and testing purposes, examine the server logs when `THEIA_LOG_LEVEL=debug` is enabled to understand the expected protocol interactions.
