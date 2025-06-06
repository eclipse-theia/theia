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
import { MCPFrontendService, MCPServerDescription, MCPServerManager } from '../common/mcp-server-manager';
import { ToolInvocationRegistry, ToolRequest, PromptService, ToolCallContent, ToolCallContentResult } from '@theia/ai-core';
import { ListToolsResult, TextContent } from '@modelcontextprotocol/sdk/types';

@injectable()
export class MCPFrontendServiceImpl implements MCPFrontendService {

    @inject(MCPServerManager)
    protected readonly mcpServerManager: MCPServerManager;

    @inject(ToolInvocationRegistry)
    protected readonly toolInvocationRegistry: ToolInvocationRegistry;

    @inject(PromptService)
    protected readonly promptService: PromptService;

    async startServer(serverName: string): Promise<void> {
        await this.mcpServerManager.startServer(serverName);
        await this.registerTools(serverName);
    }

    async hasServer(serverName: string): Promise<boolean> {
        const serverNames = await this.getServerNames();
        return serverNames.includes(serverName);
    }

    async isServerStarted(serverName: string): Promise<boolean> {
        const startedServers = await this.getStartedServers();
        return startedServers.includes(serverName);
    }

    async registerToolsForAllStartedServers(): Promise<void> {
        const startedServers = await this.getStartedServers();
        for (const serverName of startedServers) {
            await this.registerTools(serverName);
        }
    }

    async registerTools(serverName: string): Promise<void> {
        const returnedTools = await this.getTools(serverName);
        if (returnedTools) {
            const toolRequests: ToolRequest[] = returnedTools.tools.map(tool => this.convertToToolRequest(tool, serverName));
            toolRequests.forEach(toolRequest =>
                this.toolInvocationRegistry.registerTool(toolRequest)
            );

            this.createPromptTemplate(serverName, toolRequests);
        }
    }

    getPromptTemplateId(serverName: string): string {
        return `mcp_${serverName}_tools`;
    }

    protected createPromptTemplate(serverName: string, toolRequests: ToolRequest[]): void {
        const templateId = this.getPromptTemplateId(serverName);
        const functionIds = toolRequests.map(tool => `~{${tool.id}}`);
        const template = functionIds.join('\n');

        this.promptService.addBuiltInPromptFragment({
            id: templateId,
            template
        });
    }

    async stopServer(serverName: string): Promise<void> {
        this.toolInvocationRegistry.unregisterAllTools(`mcp_${serverName}`);
        this.promptService.removePromptFragment(this.getPromptTemplateId(serverName));
        await this.mcpServerManager.stopServer(serverName);
    }

    getStartedServers(): Promise<string[]> {
        return this.mcpServerManager.getRunningServers();
    }

    getServerNames(): Promise<string[]> {
        return this.mcpServerManager.getServerNames();
    }

    async getServerDescription(name: string): Promise<MCPServerDescription | undefined> {
        return this.mcpServerManager.getServerDescription(name);
    }

    async getTools(serverName: string): Promise<ListToolsResult | undefined> {
        try {
            return await this.mcpServerManager.getTools(serverName);
        } catch (error) {
            console.error('Error while trying to get tools: ' + error);
            return undefined;
        }
    }

    async addOrUpdateServer(description: MCPServerDescription): Promise<void> {
        return this.mcpServerManager.addOrUpdateServer(description);
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
            } : {
                type: 'object',
                properties: {}
            },
            description: tool.description,
            handler: async (arg_string: string): Promise<ToolCallContent> => {
                try {
                    const result = await this.mcpServerManager.callTool(serverName, tool.name, arg_string);
                    if (result.isError) {
                        const textContent = result.content.find(callContent => callContent.type === 'text') as TextContent | undefined;
                        return { content: [{ type: 'error', data: textContent?.text ?? 'Unknown Error' }] };
                    }
                    const content = result.content.map<ToolCallContentResult>(callContent => {
                        switch (callContent.type) {
                            case 'image':
                                return { type: 'image', base64data: callContent.data, mimeType: callContent.mimeType };
                            case 'text':
                                return { type: 'text', text: callContent.text };
                            case 'resource': {
                                return { type: 'text', text: JSON.stringify(callContent.resource) };
                            }
                            default: {
                                return { type: 'text', text: JSON.stringify(callContent) };
                            }
                        }
                    });
                    return { content };
                } catch (error) {
                    console.error(`Error in tool handler for ${tool.name} on MCP server ${serverName}:`, error);
                    throw error;
                }
            },
        };
    }
}
