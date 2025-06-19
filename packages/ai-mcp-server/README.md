# Theia AI MCP Server

This package provides Model Context Protocol (MCP) server functionality for Theia, enabling AI tools to access Theia services and workspace information.

## Features

- **Backend MCP Contributions**: Run MCP tools on the backend (Node.js)
- **Frontend MCP Contributions**: Run MCP tools on the frontend (browser) to access frontend-only services
- **Frontend-Backend Delegation**: Seamless proxy between backend MCP server and frontend Theia services
- **HTTP Transport**: RESTful HTTP API for MCP communication
- **Sample Contributions**: Example implementations for workspace access

## Environment Configuration

The MCP server can be configured via environment variables:

```bash
# Enable/disable the MCP server
THEIA_MCP_SERVER_ENABLED=true

# Configure the HTTP server
THEIA_MCP_SERVER_PORT=3001
THEIA_MCP_SERVER_HOSTNAME=localhost
```

## Development Setup

### Starting the MCP Server

1. Set environment variables:
```bash
export THEIA_MCP_SERVER_ENABLED=true
export THEIA_MCP_SERVER_PORT=3001
export THEIA_MCP_SERVER_HOSTNAME=localhost
```

2. Start Theia application
3. The MCP server will automatically start and be available at `http://localhost:3001`

### Debugging

#### Check Server Status

Visit `http://localhost:3001/debug` to see:
- Server ID and running status
- Number of registered contributions (backend/frontend)
- Active sessions
- Configuration details

#### Check Health

Visit `http://localhost:3001/health` for a simple health check.

#### Common Issues

**"Not connected" errors:**
- This means the frontend-backend RPC connection isn't established yet
- This is normal during startup - the connection is established when the frontend loads
- Check browser console for frontend errors

**Git repository errors:**
- These are from external MCP Git servers, not this implementation
- Check your MCP client configuration for Git server settings

#### Enable Debug Logging

Add to your Theia application:
```bash
# Enable debug logging for MCP
DEBUG=mcp:* npm start
```

Or set log level in your application:
```typescript
// In your backend module or application
container.bind(ILogLevel).toConstantValue(LogLevel.DEBUG);
```

## API Endpoints

- `GET /` - Server information
- `GET /health` - Health check
- `GET /debug` - Debug information
- `POST /mcp` - MCP protocol endpoint (initialize)
- `GET|POST|DELETE /mcp` - MCP protocol endpoint (with session)

## Architecture

```
┌─────────────────┐    ┌──────────────────────┐
│ MCP Client      │◄──►│ Theia MCP Server     │
│ (Claude, etc.)  │    │ (HTTP Transport)     │
└─────────────────┘    └──────────────────────┘
                                │
                                ▼
                       ┌──────────────────────┐
                       │ Backend              │
                       │ Contributions        │
                       │ (Node.js)            │
                       └──────────────────────┘
                                │
                                ▼ (RPC)
                       ┌──────────────────────┐
                       │ Frontend             │
                       │ Contributions        │
                       │ (Browser)            │
                       └──────────────────────┘
```

## Creating Custom Contributions

### Backend Contribution

```typescript
@injectable()
export class MyBackendContribution implements MCPTheiaContribution {
    readonly runOnFrontend = false; // Run on backend
    
    async configure(server: McpServer): Promise<void> {
        server.tool('my-tool', {
            type: 'object',
            properties: {
                input: { type: 'string' }
            }
        }, async (args) => {
            // Your backend logic here
            return {
                content: [{ type: 'text', text: 'Result' }]
            };
        });
    }
}
```

### Frontend Contribution

```typescript
@injectable()
export class MyFrontendContribution implements MCPTheiaContribution {
    readonly runOnFrontend = true; // Run on frontend
    
    @inject(WorkspaceService)
    protected workspaceService: WorkspaceService;
    
    async getTools(): Promise<Tool[]> {
        return [{
            name: 'workspace-tool',
            description: 'Access workspace',
            inputSchema: { type: 'object', properties: {} }
        }];
    }
    
    async getTool(name: string): Promise<ToolProvider | undefined> {
        if (name === 'workspace-tool') {
            return {
                handler: async (args) => {
                    // Access frontend-only services
                    const roots = await this.workspaceService.roots;
                    return { roots: roots.map(r => r.resource.toString()) };
                },
                inputSchema: z.object({})
            };
        }
    }
}
```

### Register Contributions

In your module:

```typescript
// Backend module
bind(MyBackendContribution).toSelf().inSingletonScope();
bind(MCPTheiaContribution).toService(MyBackendContribution);

// Frontend module  
bind(MyFrontendContribution).toSelf().inSingletonScope();
bind(MCPTheiaContribution).toService(MyFrontendContribution);
```

## Testing

Run tests:
```bash
npm test
```

## Security Considerations

- The MCP server exposes Theia functionality over HTTP
- Only enable in trusted environments
- Consider authentication/authorization for production use
- Frontend contributions can access any frontend service