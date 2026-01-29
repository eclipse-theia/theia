// *****************************************************************************
// Copyright (C) 2025 EclipseSource.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { McpServer, RegisteredTool, RegisteredPrompt, RegisteredResource } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { MCPToolFrontendDelegate } from '../common/mcp-tool-delegate';
import { z } from 'zod';

/**
 * Manages the registration and delegation of frontend MCP contributions
 */
@injectable()
export class MCPFrontendContributionManager {

    @inject(ILogger)
    protected readonly logger: ILogger;

    // Frontend delegates are set dynamically when connections are established
    private frontendDelegates = new Map<string, MCPToolFrontendDelegate>();
    private mcpServer?: McpServer;
    private serverId?: string;

    private registeredElements: Map<string, (RegisteredTool | RegisteredPrompt | RegisteredResource)[]> = new Map();

    /**
     * Set the MCP server instance and setup frontend delegate notifications
     */
    async setMCPServer(server: McpServer, serverId: string): Promise<void> {
        this.mcpServer = server;
        this.serverId = serverId;
        this.registerExistingFrontendContributions();
    }

    /**
     * Add a frontend delegate (called when a frontend connection is established)
     */
    addFrontendDelegate(delegateId: string, delegate: MCPToolFrontendDelegate): void {
        this.frontendDelegates.set(delegateId, delegate);

        if (this.mcpServer && this.serverId) {
            this.registerFrontendContributionsFromDelegate(delegateId, delegate).catch(error => {
                this.logger.warn(`Failed to register frontend contributions from delegate ${delegateId}:`, error);
            });
        }
    }

    /**
     * Remove a frontend delegate (called when a frontend connection is closed)
     */
    removeFrontendDelegate(delegateId: string): void {
        this.frontendDelegates.delete(delegateId);
        this.unregisterFrontendContributionsFromDelegate(delegateId);
    }

    /**
     * Unregister frontend contributions from a specific delegate
     */
    private unregisterFrontendContributionsFromDelegate(delegateId: string): void {
        if (!this.mcpServer) {
            this.logger.warn('MCP server not set, cannot unregister frontend contributions');
            return;
        }

        const elements = this.registeredElements.get(delegateId);
        if (elements) {
            for (const element of elements) {
                try {
                    element.remove();
                } catch (error) {
                    this.logger.warn(`Failed to unregister element from delegate ${delegateId}: ${error}`);
                }
            }
            this.registeredElements.delete(delegateId);

            // Notify that lists have changed
            this.mcpServer.sendToolListChanged();
            this.mcpServer.sendResourceListChanged();
            this.mcpServer.sendPromptListChanged();
        }
    }

    /**
     * Register frontend contributions from existing delegates
     */
    private async registerExistingFrontendContributions(): Promise<void> {
        for (const [delegateId, delegate] of this.frontendDelegates) {
            try {
                await this.registerFrontendContributionsFromDelegate(delegateId, delegate);
            } catch (error) {
                this.logger.warn(`Failed to register frontend contributions from delegate ${delegateId}:`, error);
            }
        }
    }

    /**
     * Register frontend contributions from a specific delegate
     */
    private async registerFrontendContributionsFromDelegate(delegateId: string, delegate: MCPToolFrontendDelegate): Promise<void> {
        if (!this.mcpServer || !this.serverId) {
            this.logger.warn('MCP server not set, cannot register frontend contributions');
            return;
        }

        try {
            await this.registerFrontendToolsFromDelegate(delegate, delegateId);
            this.mcpServer.sendToolListChanged();
            // Register resources from frontend
            await this.registerFrontendResourcesFromDelegate(delegate, delegateId);
            this.mcpServer.sendResourceListChanged();

            // Register prompts from frontend
            await this.registerFrontendPromptsFromDelegate(delegate, delegateId);
            this.mcpServer.sendPromptListChanged();

        } catch (error) {
            this.logger.warn(`Failed to register frontend MCP contributions from delegate ${delegateId}: ${error}`);
            // Don't re-throw to prevent server startup failure
        }
    }

    /**
     * Unregister frontend contributions for a server
     * @param serverId Unique identifier for the server instance
     */
    async unregisterFrontendContributions(serverId: string): Promise<void> {
        for (const [delegateId] of this.frontendDelegates) {
            try {
                this.unregisterFrontendContributionsFromDelegate(delegateId);
                // Backend delegates don't need lifecycle notifications
            } catch (error) {
                this.logger.warn(`Error unregistering server from frontend delegate ${delegateId}:`, error);
            }
        }
    }

    /**
     * Register tools from frontend contributions
     */
    protected async registerFrontendToolsFromDelegate(delegate: MCPToolFrontendDelegate, delegateId: string): Promise<void> {
        if (!this.mcpServer || !this.serverId) {
            throw new Error('MCP server not set');
        }

        try {
            const tools = await delegate.listTools(this.serverId);
            for (const tool of tools) {
                const registeredTool = this.mcpServer.registerTool(
                    `${tool.name}_${delegateId}`,
                    {
                        description: tool.description ?? '',
                        // Cast needed: SDK's Tool.inputSchema type is looser than what z.fromJSONSchema expects
                        inputSchema: z.fromJSONSchema(tool.inputSchema as Parameters<typeof z.fromJSONSchema>[0])
                    },
                    async args => {
                        try {
                            const result = await delegate.callTool(
                                this.serverId!,
                                tool.name,
                                args
                            );
                            return {
                                content: [{
                                    type: 'text',
                                    text: typeof result === 'string' ? result : JSON.stringify(result)
                                }]
                            };
                        } catch (error) {
                            this.logger.error(`Error calling frontend tool ${tool.name}:`, error);
                            throw error;
                        }
                    }
                );
                const registeredElements = this.registeredElements.get(delegateId) ?? [];
                registeredElements.push(registeredTool);
                this.registeredElements.set(delegateId, registeredElements);
            }

        } catch (error) {
            this.logger.warn(`Failed to register frontend tools from delegate ${delegateId}: ${error}`);
            throw error;
        }
    }

    /**
     * Register resources from frontend contributions
     */
    protected async registerFrontendResourcesFromDelegate(delegate: MCPToolFrontendDelegate, delegateId: string): Promise<void> {
        if (!this.mcpServer || !this.serverId) {
            throw new Error('MCP server not set');
        }

        try {
            const resources = await delegate.listResources(this.serverId);

            for (const resource of resources) {
                const registeredResource = this.mcpServer.resource(
                    `${resource.name}_${delegateId}`,
                    resource.uri,
                    async uri => {
                        try {
                            const result = await delegate.readResource(this.serverId!, uri.href);
                            return result as unknown as ReadResourceResult;
                        } catch (error) {
                            this.logger.error(`Error reading frontend resource ${resource.name}:`, error);
                            throw error;
                        }
                    }
                );
                const registeredElements = this.registeredElements.get(delegateId) ?? [];
                registeredElements.push(registeredResource);
                this.registeredElements.set(delegateId, registeredElements);
            }

        } catch (error) {
            this.logger.warn(`Failed to register frontend resources from delegate ${delegateId}: ${error}`);
            throw error;
        }
    }

    /**
     * Register prompts from frontend contributions
     */
    protected async registerFrontendPromptsFromDelegate(delegate: MCPToolFrontendDelegate, delegateId: string): Promise<void> {
        if (!this.mcpServer || !this.serverId) {
            throw new Error('MCP server not set');
        }

        try {
            const prompts = await delegate.listPrompts(this.serverId);

            for (const prompt of prompts) {
                const registeredPrompt = this.mcpServer.prompt(
                    `${prompt.name}_${delegateId}`,
                    prompt.description ?? '',
                    prompt.arguments ?? {},
                    async args => {
                        try {
                            const messages = await delegate.getPrompt(this.serverId!, prompt.name, args);
                            return {
                                messages
                            };
                        } catch (error) {
                            this.logger.error(`Error getting frontend prompt ${prompt.name}:`, error);
                            throw error;
                        }
                    }
                );
                const registeredElements = this.registeredElements.get(delegateId) ?? [];
                registeredElements.push(registeredPrompt);
                this.registeredElements.set(delegateId, registeredElements);
            }
        } catch (error) {
            this.logger.warn(`Failed to register frontend prompts from delegate ${delegateId}: ${error}`);
            throw error;
        }
    }
}
