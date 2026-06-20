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
import { injectable, inject, named } from '@theia/core/shared/inversify';
import { MessageService, nls, ILogger } from '@theia/core';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { isRemoteMCPServerDescription, MCPFrontendService, MCPServerDescription, MCPServerManager, MCPServerStatus } from '../common/mcp-server-manager';
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

    @inject(ILogger) @named('ai-mcp:MCPFrontendServiceImpl')
    protected readonly logger: ILogger;

    @inject(WorkspaceTrustService)
    protected readonly workspaceTrustService: WorkspaceTrustService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    /**
     * Non-interactive start. The backend OAuth provider rejects `redirectToAuthorization`, so this
     * path cannot launch a browser tab. Use {@link startServerInteractive} for direct user actions.
     */
    async startServer(serverName: string): Promise<void> {
        await this.mcpServerManager.startServer(serverName);
        await this.registerTools(serverName);
    }

    async startServerInteractive(serverName: string): Promise<boolean> {
        const description = await this.mcpServerManager.getServerDescription(serverName);
        const usesOAuth = description && isRemoteMCPServerDescription(description) && !!description.oauth;
        if (usesOAuth && !await this.workspaceTrustService.getWorkspaceTrust()) {
            this.messageService.error(nls.localize('theia/ai/mcp/error/oauthRequiresTrustedWorkspace',
                'Starting OAuth-enabled MCP servers requires a trusted workspace.'));
            return false;
        }
        // Pass `interactive: true` so the OAuth provider permits `redirectToAuthorization` to launch
        // the browser. The non-interactive default rejects authorization, keeping autostart silent.
        await this.mcpServerManager.startServer(serverName, { interactive: true });
        await this.registerTools(serverName);
        return true;
    }

    async signIn(serverName: string): Promise<boolean> {
        const description = await this.mcpServerManager.getServerDescription(serverName);
        if (!description || !isRemoteMCPServerDescription(description) || !description.oauth) {
            return false;
        }
        if (!await this.workspaceTrustService.getWorkspaceTrust()) {
            this.messageService.error(nls.localize('theia/ai/mcp/error/oauthRequiresTrustedWorkspace',
                'Starting OAuth-enabled MCP servers requires a trusted workspace.'));
            return false;
        }
        // Stop first so a stale in-flight authorization wait is cancelled and a fresh flow starts.
        await this.mcpServerManager.stopServer(serverName);
        await this.mcpServerManager.startServer(serverName, { interactive: true });
        const afterStart = await this.mcpServerManager.getServerDescription(serverName);
        const connected = afterStart?.status === MCPServerStatus.Connected || afterStart?.status === MCPServerStatus.Running;
        if (connected) {
            // Sign-in only: leave the server stopped. The tokens remain in the credential store.
            await this.mcpServerManager.stopServer(serverName);
        }
        return connected;
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
        this.unregisterTools(serverName);
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

    protected unregisterTools(serverName: string): void {
        this.toolInvocationRegistry.unregisterAllTools(`mcp_${serverName}`);
        this.promptService.removePromptFragment(this.getPromptTemplateId(serverName));
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
        this.unregisterTools(serverName);
        await this.mcpServerManager.stopServer(serverName);
    }

    async signOut(serverName: string): Promise<void> {
        this.unregisterTools(serverName);
        await this.mcpServerManager.signOut(serverName);
    }

    hasStoredOAuthCredentials(serverName: string): Promise<boolean> {
        return this.mcpServerManager.hasStoredOAuthCredentials(serverName);
    }

    getStartedServers(): Promise<string[]> {
        return this.mcpServerManager.getRunningServers();
    }

    getActiveServers(): Promise<string[]> {
        return this.mcpServerManager.getActiveServers();
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
            this.logger.error('Error while trying to get tools: ' + error);
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
                    this.logger.error(`Error in tool handler for ${tool.name} on MCP server ${serverName}:`, error);
                    throw error;
                }
            },
        };
    }
}
