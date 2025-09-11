# Theia AI MCP Server

This package provides Model Context Protocol (MCP) server functionality for Theia, enabling AI tools to access Theia services and workspace information.

## Features

- **HTTP Transport**: RESTful HTTP API for MCP communication using the StreamableHTTPServerTransport
- **Backend MCP Contributions**: Register backend-only tools, resources, and prompts
- **Frontend MCP Contributions**: Register frontend-only tools, resources, and prompts that can access frontend services
- **Frontend-Backend Delegation**: Allows frontend contributions to be exposed through the backend MCP server

## Development Setup

### Starting the MCP Server

1. Start Theia application
2. The MCP server will automatically start and be available at `/mcp` e.g. `http://localhost:3000/mcp`

## API Endpoints

- `POST /mcp` - MCP protocol endpoint (for all MCP protocol operations)

## Architecture

The MCP server architecture consists of:

1. **HTTP Transport Layer**: Manages HTTP connections using StreamableHTTPServerTransport
2. **MCP Server**: Core server implementation that handles MCP protocol messages
3. **Backend Contributions**: Extensions that run on the Node.js backend
4. **Frontend Contributions**: Extensions that run in the browser frontend
5. **Frontend-Backend Bridge**: RPC mechanism to connect frontend and backend

## Creating Backend Contributions

Backend contributions run in the Node.js backend and have access to backend services:

```typescript
@injectable()
export class MyBackendContribution implements MCPBackendContribution {
    @inject(ILogger)
    protected readonly logger: ILogger;
    
    async configure(server: McpServer): Promise<void> {
        // Register a tool
        server.tool('my-backend-tool', {
            type: 'object',
            properties: {
                input: { type: 'string' }
            }
        }, async (args) => {
            this.logger.info('my-backend-tool called with args:', args);
            return {
                content: [{ type: 'text', text: 'Result from backend' }]
            };
        });
        
        // Register a resource
        server.resource(
            'my-resource',
            'theia://resource-uri',
            async (uri) => {
                return {
                    content: 'Resource content'
                };
            }
        );
        
        // Register a prompt
        server.prompt(
            'my-prompt',
            'Prompt description',
            {}, // Arguments schema
            async (args) => {
                return {
                    messages: [{
                        role: 'user',
                        content: { type: 'text', text: 'Prompt content' }
                    }]
                };
            }
        );
    }
}
```

Register the contribution in your backend module:

```typescript
bind(MyBackendContribution).toSelf().inSingletonScope();
bind(MCPBackendContribution).toService(MyBackendContribution);
```

## Creating Frontend Contributions

Frontend contributions run in the browser and have access to frontend services:

```typescript
@injectable()
export class MyFrontendContribution implements MCPFrontendContribution {
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    
    async getTools(): Promise<Tool[]> {
        return [{
            name: 'workspace-info',
            description: 'Get workspace info',
            inputSchema: {
                type: 'object',
                properties: {}
            }
        }];
    }
    
    async getTool(name: string): Promise<ToolProvider | undefined> {
        if (name === 'workspace-info') {
            return {
                handler: async () => {
                    const roots = await this.workspaceService.roots;
                    return { 
                        roots: roots.map(r => r.resource.toString()) 
                    };
                },
                inputSchema: z.object({})
            };
        }
    }
    
    async getResources(): Promise<Resource[]> {
        return [{
            name: 'Workspace Information',
            uri: 'workspace://info',
            description: 'Workspace info',
            mimeType: 'application/json'
        }];
    }
    
    async readResource(uri: string): Promise<unknown> {
        if (uri === 'workspace://info') {
            const roots = await this.workspaceService.roots;
            return { roots: roots.map(r => r.resource.toString()) };
        }
    }
    
    async getPrompts(): Promise<Prompt[]> {
        return [{
            name: 'workspace-context',
            description: 'Generate workspace context',
            arguments: []
        }];
    }
    
    async getPrompt(name: string, args: unknown): Promise<PromptMessage[]> {
        if (name === 'workspace-context') {
            return [{
                role: 'user',
                content: { type: 'text', text: 'Workspace context information' }
            }];
        }
    }
}
```

Register the contribution in your frontend module:

```typescript
bind(MyFrontendContribution).toSelf().inSingletonScope();
bind(MCPFrontendContribution).toService(MyFrontendContribution);
```

## Security Considerations

- The MCP server exposes Theia functionality over HTTP
- Only enable the server in trusted environments
- Consider adding authentication and authorization for production use
- Restrict access to sensitive operations in your contributions
