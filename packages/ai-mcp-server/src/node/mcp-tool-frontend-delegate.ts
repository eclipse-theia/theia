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

import { injectable } from '@theia/core/shared/inversify';
import { Tool, Resource, ResourceContents, Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types';
import { MCPToolFrontendDelegate, MCPToolDelegateClient } from '../common/mcp-tool-delegate';

@injectable()
export class MCPToolFrontendDelegateImpl implements MCPToolFrontendDelegate {

    private client?: MCPToolDelegateClient;

    setClient(client: MCPToolDelegateClient): void {
        this.client = client;
        // Note: Frontend delegate registration is now handled via RPC connection lifecycle
        // The MCPFrontendContributionManager will be notified through the ConnectionHandler
    }

    async callTool(serverId: string, toolName: string, args: unknown): Promise<unknown> {
        if (!this.client) {
            throw new Error('MCPToolDelegateClient not set');
        }
        return this.client.callTool(serverId, toolName, args);
    }

    async listTools(serverId: string): Promise<Tool[]> {
        if (!this.client) {
            throw new Error('MCPToolDelegateClient not set');
        }
        return this.client.listTools(serverId);
    }

    async listResources(serverId: string): Promise<Resource[]> {
        if (!this.client) {
            throw new Error('MCPToolDelegateClient not set');
        }
        return this.client.listResources(serverId);
    }

    async readResource(serverId: string, uri: string): Promise<ResourceContents> {
        if (!this.client) {
            throw new Error('MCPToolDelegateClient not set');
        }
        return this.client.readResource(serverId, uri);
    }

    async listPrompts(serverId: string): Promise<Prompt[]> {
        if (!this.client) {
            throw new Error('MCPToolDelegateClient not set');
        }
        return this.client.listPrompts(serverId);
    }

    async getPrompt(serverId: string, name: string, args: unknown): Promise<PromptMessage[]> {
        if (!this.client) {
            throw new Error('MCPToolDelegateClient not set');
        }
        return this.client.getPrompt(serverId, name, args);
    }
}
