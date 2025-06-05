// *****************************************************************************
// Copyright (C) 2025 EclipseSource
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

import { interfaces } from '@theia/core/shared/inversify';
import { RPCProtocol } from '../../common/rpc-protocol';
import {
    McpServerDefinitionRegistryMain,
    McpServerDefinitionRegistryExt,
    McpServerDefinitionDto,
    isMcpHttpServerDefinitionDto,
} from '../../common/lm-protocol';
import { MAIN_RPC_CONTEXT } from '../../common/plugin-api-rpc';
import { MCPServerManager, MCPServerDescription } from '@theia/ai-mcp/lib/common';

export class McpServerDefinitionRegistryMainImpl implements McpServerDefinitionRegistryMain {
    private readonly proxy: McpServerDefinitionRegistryExt;
    private readonly providers = new Map<number, string>();
    private readonly mcpServerManager: MCPServerManager | undefined;

    constructor(
        rpc: RPCProtocol,
        container: interfaces.Container
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.MCP_SERVER_DEFINITION_REGISTRY_EXT);
        try {
            this.mcpServerManager = container.get(MCPServerManager);
        } catch {
            // MCP Server Manager is optional
            this.mcpServerManager = undefined;
        }
    }

    $registerMcpServerDefinitionProvider(handle: number, name: string): void {
        this.providers.set(handle, name);
        this.loadServerDefinitions(handle);
    }

    $unregisterMcpServerDefinitionProvider(handle: number): void {
        if (!this.mcpServerManager) {
            console.warn('MCP Server Manager not available - MCP server definitions will not be loaded');
            return;
        }
        const provider = this.providers.get(handle);
        if (!provider) {
            console.warn(`No MCP Server provider found for handle '${handle}' - MCP server definitions will not be loaded`);
            return;
        }
        this.mcpServerManager.removeServer(provider);
        this.providers.delete(handle);
    }

    $onDidChangeMcpServerDefinitions(handle: number): void {
        // Reload server definitions when provider reports changes
        this.loadServerDefinitions(handle);
    }

    async $getServerDefinitions(handle: number): Promise<McpServerDefinitionDto[]> {
        try {
            return await this.proxy.$provideServerDefinitions(handle);
        } catch (error) {
            console.error('Error getting MCP server definitions:', error);
            return [];
        }
    }

    async $resolveServerDefinition(handle: number, server: McpServerDefinitionDto): Promise<McpServerDefinitionDto | undefined> {
        try {
            return await this.proxy.$resolveServerDefinition(handle, server);
        } catch (error) {
            console.error('Error resolving MCP server definition:', error);
            return server;
        }
    }

    private async loadServerDefinitions(handle: number): Promise<void> {
        if (!this.mcpServerManager) {
            console.warn('MCP Server Manager not available - MCP server definitions will not be loaded');
            return;
        }

        try {
            const definitions = await this.$getServerDefinitions(handle);

            for (const definition of definitions) {
                const resolved = await this.$resolveServerDefinition(handle, definition);
                if (resolved) {
                    const mcpServerDescription = this.convertToMcpServerDescription(resolved);
                    this.mcpServerManager.addOrUpdateServer(mcpServerDescription);
                }
            }
        } catch (error) {
            console.error('Error loading MCP server definitions:', error);
        }
    }

    private convertToMcpServerDescription(definition: McpServerDefinitionDto): MCPServerDescription {
        if (isMcpHttpServerDefinitionDto(definition)) {
            // For HTTP servers, we would need to create a bridge or adapter
            // For now, we'll create a placeholder stdio server that could proxy to HTTP
            console.warn(`HTTP transport not yet supported for MCP server '${definition.label}'. Skipping.`);
            throw new Error(`HTTP transport not yet supported for MCP server '${definition.label}'`);
        }

        // Convert env values to strings, filtering out null values
        let convertedEnv: Record<string, string> | undefined;
        if (definition.env) {
            convertedEnv = {};
            for (const [key, value] of Object.entries(definition.env)) {
                if (value !== null) {
                    convertedEnv[key] = String(value);
                }
            }
        }

        return {
            name: definition.label,
            command: definition.command!,
            args: definition.args,
            env: convertedEnv,
            autostart: false, // Extensions should manage their own server lifecycle
        };
    }
}
