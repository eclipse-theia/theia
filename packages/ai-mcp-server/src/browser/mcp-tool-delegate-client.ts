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
 * Frontend registry that manages MCP contributions and coordinates with backend.
 * This is the equivalent of FrontendLanguageModelRegistryImpl.
 * Implements FrontendApplicationContribution to be initialized during frontend startup.
 * Also implements MCPToolDelegateClient to handle backend requests directly.
 */
@injectable()
export class MCPToolDelegateClientImpl implements MCPToolDelegateClient {

    @inject(ContributionProvider)
    @named(MCPFrontendContribution)
    protected readonly contributions: ContributionProvider<MCPFrontendContribution>;

    @inject(ILogger)
    protected readonly logger: ILogger;

    /**
     * Get all frontend contributions
     */
    private getFrontendContributions(): MCPFrontendContribution[] {
        return this.contributions.getContributions();
    }

    // MCPToolDelegateClient implementation - handle backend requests directly

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
                } catch {
                    // Continue to next contribution
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
                } catch {
                    // Continue to next contribution
                }
            }
        }
        throw new Error(`Prompt ${name} not found in server ${serverId}`);
    }
}
