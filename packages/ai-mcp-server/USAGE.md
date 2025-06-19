# MCP Server Usage Examples

This document provides practical examples of how to use the Theia MCP Server.

## Starting the MCP Server

### HTTP Transport

```bash
# Enable MCP server with HTTP transport on default port (3001)
THEIA_MCP_SERVER_ENABLED=true THEIA_MCP_SERVER_TRANSPORT=http theia start

# Specify a custom port and hostname
THEIA_MCP_SERVER_ENABLED=true THEIA_MCP_SERVER_TRANSPORT=http THEIA_MCP_SERVER_PORT=8080 THEIA_MCP_SERVER_HOSTNAME=0.0.0.0 theia start

# Example: Start on port 4000, accessible from any IP
THEIA_MCP_SERVER_ENABLED=true THEIA_MCP_SERVER_TRANSPORT=http THEIA_MCP_SERVER_PORT=4000 THEIA_MCP_SERVER_HOSTNAME=0.0.0.0 theia start
```

## Connecting External AI Tools

### Using HTTP Transport

Once the server is running with HTTP transport, you can connect external AI tools to:

```
# Default port (3001)
http://localhost:3001/mcp

# Custom port
http://localhost:YOUR_PORT/mcp
```

**Note:** The MCP server runs as a standalone HTTP server on the specified port (default 3001) and supports GET (SSE), POST (requests), and DELETE (session termination) methods.

#### Example HTTP Requests

**List Available Tools:**
```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

**Execute a Command:**
```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "execute-command",
      "arguments": {
        "commandId": "workbench.action.files.save"
      }
    },
    "id": 2
  }'
```

**Get Workspace Information:**
```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get-workspace-info"
    },
    "id": 3
  }'
```

**Read a File:**
```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "resources/read",
    "params": {
      "uri": "file:///path/to/your/file.ts"
    },
    "id": 4
  }'
```



## Available Operations

### Commands

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `list-commands` | List all available Theia commands | None |
| `get-command-info` | Get details about a specific command | `commandId: string` |
| `execute-command` | Execute a Theia command | `commandId: string, args?: any[]` |
| `is-command-enabled` | Check if a command is enabled | `commandId: string, args?: any[]` |

### Workspace Operations

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `get-workspace-info` | Get current workspace information | None |
| `list-directory` | List directory contents | `path?: string, recursive?: boolean` |
| `file-exists` | Check if a file exists | `path: string` |

### File Resources

| Resource Pattern | Description |
|------------------|-------------|
| `file://{path}` | Access file content by path |

### Prompts

| Prompt Name | Description | Parameters |
|-------------|-------------|------------|
| `analyze-file` | Generate analysis prompts for files | `path: string, analysisType?: 'syntax'\|'semantic'\|'structure'\|'dependencies'` |
| `workspace-overview` | Generate workspace overview prompt | None |

## Common Use Cases

### 1. Code Analysis by AI

```bash
# Get file content for analysis
curl -X POST http://localhost:3001/mcp-server/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "resources/read",
    "params": {
      "uri": "file:///workspace/src/myfile.ts"
    },
    "id": 1
  }'

# Get analysis prompt
curl -X POST http://localhost:3001/mcp-server/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "prompts/get",
    "params": {
      "name": "analyze-file",
      "arguments": {
        "path": "/workspace/src/myfile.ts",
        "analysisType": "structure"
      }
    },
    "id": 2
  }'
```

### 2. Automated Code Operations

```bash
# Save all files
curl -X POST http://localhost:3001/mcp-server/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "execute-command",
      "arguments": {
        "commandId": "workbench.action.files.saveAll"
      }
    },
    "id": 1
  }'
```

### 3. Workspace Exploration

```bash
# Get workspace overview
curl -X POST http://localhost:3001/mcp-server/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list-directory",
      "arguments": {
        "recursive": true
      }
    },
    "id": 1
  }'
```

## Error Handling

The MCP server returns standard JSON-RPC 2.0 error responses:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Command 'invalid.command' not found"
  },
  "id": 1
}
```

Tool-level errors are returned with `isError: true`:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [{
      "type": "text",
      "text": "Error: File not found"
    }],
    "isError": true
  },
  "id": 1
}
```

## Session Management

The HTTP transport supports session management for stateful operations:

1. Send an `initialize` request without a session ID
2. Server responds with a session ID in the response
3. Include the session ID in subsequent requests via the `mcp-session-id` header
4. Use DELETE requests to terminate sessions

## Security Considerations

- The MCP server has full access to Theia's command system and workspace
- Only enable the server in trusted environments
- Consider using authentication/authorization for HTTP transport in production
- Monitor command execution for security implications

## Debugging

Enable debug logging by setting the log level:

```bash
THEIA_LOG_LEVEL=debug THEIA_MCP_SERVER_ENABLED=true theia start
```

The server will log MCP operations, session management, and error details.