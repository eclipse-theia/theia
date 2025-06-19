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
import { injectable } from '@theia/core/shared/inversify';
import { MCPServerDescription, MCPServerManager, MCPFrontendNotificationService } from '../common/mcp-server-manager';
import { MCPServer } from './mcp-server';
import { Disposable } from '@theia/core/lib/common/disposable';
import { CallToolResult, ListResourcesResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types';

@injectable()
export class MCPServerManagerImpl implements MCPServerManager {

    protected servers: Map<string, MCPServer> = new Map();
    protected clients: Array<MCPFrontendNotificationService> = [];
    protected serverListeners: Map<string, Disposable> = new Map();

    async stopServer(serverName: string): Promise<void> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found.`);
        }
        await server.stop();
        console.log(`MCP server "${serverName}" stopped.`);
        this.notifyClients();
    }

    async getRunningServers(): Promise<string[]> {
        const runningServers: string[] = [];
        for (const [name, server] of this.servers.entries()) {
            if (server.isRunnning()) {
                runningServers.push(name);
            }
        }
        return runningServers;
    }

    callTool(serverName: string, toolName: string, arg_string: string): Promise<CallToolResult> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${toolName}" not found.`);
        }
        return server.callTool(toolName, arg_string);
    }

    async startServer(serverName: string): Promise<void> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found.`);
        }
        await server.start();
        this.notifyClients();
    }

    async getServerNames(): Promise<string[]> {
        return Array.from(this.servers.keys());
    }

    async getServerDescription(name: string): Promise<MCPServerDescription | undefined> {
        const server = this.servers.get(name);
        return server ? await server.getDescription() : undefined;
    }

    public async getTools(serverName: string): ReturnType<MCPServer['getTools']> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found.`);
        }
        return await server.getTools();
    }

    addOrUpdateServer(description: MCPServerDescription): void {
        const existingServer = this.servers.get(description.name);

        if (existingServer) {
            existingServer.update(description);
        } else {
            const newServer = new MCPServer(description);
            this.servers.set(description.name, newServer);

            // Subscribe to status updates from the new server
            const listener = newServer.onDidUpdateStatus(() => {
                this.notifyClients();
            });

            // Store the listener for later disposal
            this.serverListeners.set(description.name, listener);
        }
        this.notifyClients();
    }

    removeServer(name: string): void {
        const server = this.servers.get(name);
        if (server) {
            server.stop();
            this.servers.delete(name);

            // Clean up the status listener
            const listener = this.serverListeners.get(name);
            if (listener) {
                listener.dispose();
                this.serverListeners.delete(name);
            }
        } else {
            console.warn(`MCP server "${name}" not found.`);
        }
        this.notifyClients();
    }

    setClient(client: MCPFrontendNotificationService): void {
        this.clients.push(client);
    }

    disconnectClient(client: MCPFrontendNotificationService): void {
        const index = this.clients.indexOf(client);
        if (index !== -1) {
            this.clients.splice(index, 1);
        }
        this.servers.forEach(server => {
            server.stop();
        });
    }

    private notifyClients(): void {
        this.clients.forEach(client => client.didUpdateMCPServers());
    }

    readResource(serverName: string, resourceId: string): Promise<ReadResourceResult> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found.`);
        }
        return server.readResource(resourceId);
    }

    getResources(serverName: string): Promise<ListResourcesResult> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found.`);
        }
        return server.getResources();
    }
}
