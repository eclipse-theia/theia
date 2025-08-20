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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ContributionProvider } from '@theia/core';
import { ILogger } from '@theia/core/lib/common/logger';
import { Tool, Resource, ResourceContents, Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types';
import { MCPToolDelegateClient } from '../common/mcp-tool-delegate';
import { MCPFrontendContribution } from './mcp-frontend-contribution';

/**
 * Frontend client implementation that handles MCP tool delegation requests from the backend.
 *
 * This class acts as a bridge between the backend MCP server and frontend contributions,
 * forwarding backend requests (tool calls, resource access, prompts) to registered
 * MCPFrontendContribution instances and aggregating their responses.
 *
 * Called by the backend via the MCPToolDelegateClient interface to access frontend-provided
 * MCP tools, resources, and prompts.
 */
@injectable()
export class MCPToolDelegateClientImpl implements MCPToolDelegateClient {

    @inject(ContributionProvider)
    @named(MCPFrontendContribution)
    protected readonly contributions: ContributionProvider<MCPFrontendContribution>;

    @inject(ILogger)
    protected readonly logger: ILogger;

    private getFrontendContributions(): MCPFrontendContribution[] {
        return this.contributions.getContributions();
    }

    async callTool(serverId: string, toolName: string, args: unknown): Promise<unknown> {
        const contributions = this.getFrontendContributions();

        for (const contribution of contributions) {
            if (contribution.getTool) {
                const tool = await contribution.getTool(toolName);
                if (tool) {
                    return await tool.handler(JSON.stringify(args));
                }
            }
        }
        throw new Error(`Tool ${toolName} not found in server ${serverId}`);
    }

    async listTools(serverId: string): Promise<Tool[]> {
        const contributions = this.getFrontendContributions();
        const allTools: Tool[] = [];

        for (const contribution of contributions) {
            if (contribution.getTools) {
                const tools = await contribution.getTools();
                allTools.push(...tools);
            }
        }
        return allTools;
    }

    async listResources(serverId: string): Promise<Resource[]> {
        const contributions = this.getFrontendContributions();
        const allResources: Resource[] = [];

        for (const contribution of contributions) {
            if (contribution.getResources) {
                const resources = await contribution.getResources();
                allResources.push(...resources);
            }
        }
        return allResources;
    }

    async readResource(serverId: string, uri: string): Promise<ResourceContents> {
        const contributions = this.getFrontendContributions();

        for (const contribution of contributions) {
            if (contribution.readResource) {
                try {
                    const result = await contribution.readResource(uri);
                    return result as ResourceContents;
                } catch (error) {
                    // Continue to next contribution
                    this.logger.debug(`Error getting resource ${uri}:`, error);
                }
            }
        }
        throw new Error(`Resource ${uri} not found in server ${serverId}`);
    }

    async listPrompts(serverId: string): Promise<Prompt[]> {
        const contributions = this.getFrontendContributions();
        const allPrompts: Prompt[] = [];

        for (const contribution of contributions) {
            if (contribution.getPrompts) {
                const prompts = await contribution.getPrompts();
                allPrompts.push(...prompts);
            }
        }
        return allPrompts;
    }

    async getPrompt(serverId: string, name: string, args: unknown): Promise<PromptMessage[]> {
        const contributions = this.getFrontendContributions();

        for (const contribution of contributions) {
            if (contribution.getPrompt) {
                try {
                    return await contribution.getPrompt(name, args);
                } catch (error) {
                    // Continue to next contribution
                    this.logger.debug(`Error getting prompt ${name}:`, error);
                }
            }
        }
        throw new Error(`Prompt ${name} not found in server ${serverId}`);
    }
}
