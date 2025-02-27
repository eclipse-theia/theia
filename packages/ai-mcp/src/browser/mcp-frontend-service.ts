// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
import { injectable, inject } from '@theia/core/shared/inversify';
import { MCPServer, MCPServerManager } from '../common/mcp-server-manager';
import { AIVariableService, ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';
import { DisposableCollection } from '@theia/core';

@injectable()
export class MCPFrontendService {
    @inject(MCPServerManager)
    protected readonly mcpServerManager: MCPServerManager;

    @inject(ToolInvocationRegistry)
    protected readonly toolInvocationRegistry: ToolInvocationRegistry;

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    private resourcesVariableRegistrations: Map<string, DisposableCollection> = new Map();

    async startServer(serverName: string): Promise<void> {
        await this.mcpServerManager.startServer(serverName);
        this.registerTools(serverName);
        await this.registerResourcesVariables(serverName);
    }

    async registerToolsForAllStartedServers(): Promise<void> {
        const startedServers = await this.getStartedServers();
        for (const serverName of startedServers) {
            await this.registerTools(serverName);
            await this.registerResourcesVariables(serverName);
        }
    }

    async registerTools(serverName: string): Promise<void> {
        const { tools } = await this.getTools(serverName);
        const toolRequests: ToolRequest[] = tools.map(tool => this.convertToToolRequest(tool, serverName));
        toolRequests.forEach(toolRequest =>
            this.toolInvocationRegistry.registerTool(toolRequest)
        );
    }

    async registerResourcesVariables(serverName: string): Promise<void> {
        // Clean up any existing registrations for this server
        this.unregisterResourcesVariables(serverName);

        // Create a new collection for this server's variable registrations
        const registrations = new DisposableCollection();
        this.resourcesVariableRegistrations.set(serverName, registrations);

        try {
            // Get all resources from the server
            const { resources } = await this.mcpServerManager.getResources(serverName);

            // Register a variable for each resource
            for (const resource of resources) {
                const variableId = `mcp_${serverName}_resource_${this.sanitizeId(resource.uri)}`;
                const variableName = this.sanitizeId(resource.name);
                const description = resource.description || `Resource from ${serverName}`;

                const registration = this.variableService.registerResolver(
                    {
                        id: variableId,
                        name: variableName,
                        description: description,
                        label: variableName,
                        iconClasses: ['mcp-resource-icon']
                    },
                    {
                        canResolve: async request => request.variable.id === variableId ? 100 : 0,
                        resolve: async request => {
                            try {
                                const resourceObject = await this.mcpServerManager.getResourceContent(serverName, resource.uri);
                                // Handle different types of resource content (text or binary)
                                let value = '';
                                if (resourceObject.contents && resourceObject.contents.length > 0) {
                                    const content = resourceObject.contents[0];
                                    if (content.text !== undefined) {
                                        // Use text content directly if available
                                        value = content.text as string;
                                    } else if (content.blob !== undefined) {
                                        value = content.blob as string;
                                    }
                                }
                                return {
                                    variable: request.variable,
                                    value
                                };
                            } catch (error) {
                                console.error(`Error resolving resource ${resource.uri} from server ${serverName}:`, error);
                                return {
                                    variable: request.variable,
                                    value: `Could not retrieve resource content: ${error}`
                                };
                            }
                        }
                    }
                );

                registrations.push(registration);
            }

        } catch (error) {
            console.error(`Error registering resources variables for server ${serverName}:`, error);
        }
    }

    private sanitizeId(uri: string): string {
        // Replace any non-alphanumeric characters with underscores
        return uri.replace(/[^a-zA-Z0-9]/g, '_');
    }

    private unregisterResourcesVariables(serverName: string): void {
        const registrations = this.resourcesVariableRegistrations.get(serverName);
        if (registrations) {
            registrations.dispose();
            this.resourcesVariableRegistrations.delete(serverName);
        }
    }

    async stopServer(serverName: string): Promise<void> {
        this.toolInvocationRegistry.unregisterAllTools(`mcp_${serverName}`);
        this.unregisterResourcesVariables(serverName);
        await this.mcpServerManager.stopServer(serverName);
    }

    getStartedServers(): Promise<string[]> {
        return this.mcpServerManager.getStartedServers();
    }

    getServerNames(): Promise<string[]> {
        return this.mcpServerManager.getServerNames();
    }

    getTools(serverName: string): ReturnType<MCPServer['getTools']> {
        return this.mcpServerManager.getTools(serverName);
    }

    getResources(serverName: string): ReturnType<MCPServer['getResources']> {
        return this.mcpServerManager.getResources(serverName);
    }

    async getResourceContent(serverName: string, resourceId: string): ReturnType<MCPServer['getResourceContent']> {
        return this.mcpServerManager.getResourceContent(serverName, resourceId);
    }

    private convertToToolRequest(tool: Awaited<ReturnType<MCPServerManager['getTools']>>['tools'][number], serverName: string): ToolRequest {
        const id = `mcp_${serverName}_${tool.name}`;
        return {
            id: id,
            name: id,
            providerName: `mcp_${serverName}`,
            parameters: ToolRequest.isToolRequestParameters(tool.inputSchema) ? {
                type: tool.inputSchema.type,
                properties: tool.inputSchema.properties,
                required: tool.inputSchema.required
            } : undefined,
            description: tool.description,
            handler: async (arg_string: string) => {
                try {
                    return await this.mcpServerManager.callTool(serverName, tool.name, arg_string);
                } catch (error) {
                    console.error(`Error in tool handler for ${tool.name} on MCP server ${serverName}:`, error);
                    throw error;
                }
            },
        };
    }
}
