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
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio';
import {SSEClientTransport} from '@modelcontextprotocol/sdk/client/sse';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';

export type TransportType = 'stdio' | 'sse';

export interface MCPServerConfig {
    name: string;
    command?: string;
    args?: string[];
    env?: { [key: string]: string };
    transportType?: TransportType;
    sseUrl?: string;
}

export class MCPServer {
    private name: string;
    private command: string;
    private args?: string[];
    private client: Client;
    private env?: { [key: string]: string };
    private started: boolean = false;
    private transportType: TransportType = 'stdio';
    private sseUrl?: string;

    constructor(name: string, command: string, args?: string[], env?: Record<string, string>, transportType: TransportType = 'stdio', sseUrl?: string) {
        this.name = name;
        this.command = command;
        this.args = args;
        this.env = env;
        this.transportType = transportType;
        this.sseUrl = sseUrl;
    }

    isStarted(): boolean {
        return this.started;
    }

    async start(): Promise<void> {
        if (this.started) {
            return;
        }

        console.log(`Starting server "${this.name}" with transport: ${this.transportType}`);

        let transport;

        if (this.transportType === 'sse') {
            if (!this.sseUrl) {
                throw new Error(`SSE transport requires a URL, but none was provided for server "${this.name}"`);
            }

            console.log(`Using SSE transport with URL: ${this.sseUrl}`);
            transport = new SSEClientTransport(new URL(this.sseUrl));
        } else {
            // Default to stdio transport
            console.log(`Using stdio transport with command: ${this.command} and args: ${this.args?.join(' ')} and env: ${JSON.stringify(this.env)}`);

            // Filter process.env to exclude undefined values
            const sanitizedEnv: Record<string, string> = Object.fromEntries(
                Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
            );

            const mergedEnv: Record<string, string> = {
                ...sanitizedEnv,
                ...(this.env || {})
            };

            transport = new StdioClientTransport({
                command: this.command,
                args: this.args,
                env: mergedEnv,
            });
        }

        transport.onerror = (error: Error) => {
            console.error('Error: ' + error);
        };

        this.client = new Client({
            name: 'theia-client',
            version: '1.0.0',
        }, {
            capabilities: {}
        });
        this.client.onerror = (error: Error) => {
            console.error('Error in MCP client: ' + error);
        };

        await this.client.connect(transport);
        this.started = true;
    }

    async callTool(toolName: string, arg_string: string): ReturnType<Client['callTool']> {
        let args;
        try {
            args = JSON.parse(arg_string);
        } catch (error: unknown) {
            console.error(
                `Failed to parse arguments for calling tool "${toolName}" in MCP server "${this.name}" with command "${this.command}".
                Invalid JSON: ${arg_string}`,
                error
            );
        }
        const params = {
            name: toolName,
            arguments: args,
        };
        return this.client.callTool(params);
    }

    async getTools(): ReturnType<Client['listTools']> {
        return this.client.listTools();
    }

    update(command: string, args?: string[], env?: {
        [key: string]: string
    }, transportType?: TransportType, sseUrl?: string): void {
        this.command = command;
        this.args = args;
        this.env = env;
        if (transportType) {
            this.transportType = transportType;
        }
        if (sseUrl) {
            this.sseUrl = sseUrl;
        }
    }

    stop(): void {
        if (!this.started || !this.client) {
            return;
        }
        console.log(`Stopping MCP server "${this.name}"`);
        this.client.close();
        this.started = false;
    }
}
