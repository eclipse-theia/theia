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
import { ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';

@injectable()
export class MCPFrontendService {
    @inject(MCPServerManager)
    protected readonly mcpServerManager: MCPServerManager;

    @inject(ToolInvocationRegistry)
    protected readonly toolInvocationRegistry: ToolInvocationRegistry;

    async startServer(serverName: string): Promise<void> {
        await this.mcpServerManager.startServer(serverName);
        this.registerTools(serverName);
    }

    async registerToolsForAllStartedServers(): Promise<void> {
        const startedServers = await this.getStartedServers();
        for (const serverName of startedServers) {
            await this.registerTools(serverName);
        }
    }

    async registerTools(serverName: string): Promise<void> {
        const { tools } = await this.getTools(serverName);
        const toolRequests: ToolRequest[] = tools.map(tool => this.convertToToolRequest(tool, serverName));
        toolRequests.forEach(toolRequest =>
            this.toolInvocationRegistry.registerTool(toolRequest)
        );
    }

    async stopServer(serverName: string): Promise<void> {
        this.toolInvocationRegistry.unregisterAllTools(`mcp_${serverName}`);
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
