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
import { MCPServerDescription, MCPServerManager } from '../common/mcp-server-manager';
import { MCPServer } from './mcp-server';

@injectable()
export class MCPServerManagerImpl implements MCPServerManager {
    async stopServer(serverName: string): Promise<void> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`Server "${serverName}" not found.`);
        }
        server.stop();
        console.log(`Server "${serverName}" stopped.`);
    }

    async getStartedServers(): Promise<string[]> {
        const startedServers: string[] = [];
        for (const [name, server] of this.servers.entries()) {
            if (server.isStarted()) {
                startedServers.push(name);
            }
        }
        return startedServers;
    }

    callTool(serverName: string, toolName: string, arg_string: string): unknown {
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
    }
    async getServerNames(): Promise<string[]> {
        return Array.from(this.servers.keys());
    }

    public async getTools(serverName: string): Promise<any> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found.`);
        }
        return server.getTools();

    }
    private servers: Map<string, MCPServer> = new Map();
    addOrUpdateServer(description: MCPServerDescription): void {
        const { name, command, args, env } = description;
        const existingServer = this.servers.get(name);

        if (existingServer) {
            existingServer.update(command, args, env);
        } else {
            const newServer = new MCPServer(name, command, args, env);
            this.servers.set(name, newServer);
        }
    }

    removeServer(name: string): void {
        const server = this.servers.get(name);
        if (server) {
            server.stop();
            this.servers.delete(name);
        } else {
            console.warn(`MCP server "${name}" not found.`);
        }
    }
}