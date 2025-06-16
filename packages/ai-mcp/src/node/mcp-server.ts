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
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MCPServerDescription, MCPServerStatus, ToolInformation } from '../common';
import { Emitter } from '@theia/core/lib/common/event';
import { CallToolResult, CallToolResultSchema, ListResourcesResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport';

export type TransportType = 'stdio' | 'server';

export class MCPServer {
    private name: string;
    private command: string;
    private args?: string[];
    private transport: Transport;
    private client: Client;
    private env?: { [key: string]: string };
    private serverUrl: string;
    private serverAuthToken?: string;
    private serverAuthTokenHeader?: string;
    private autostart?: boolean;
    private error?: string;
    private status: MCPServerStatus;
    private transportType: TransportType;

    // Event emitter for status updates
    private readonly onDidUpdateStatusEmitter = new Emitter<MCPServerStatus>();
    readonly onDidUpdateStatus = this.onDidUpdateStatusEmitter.event;

    constructor(description: MCPServerDescription) {
        this.update(description);
    }

    getStatus(): MCPServerStatus {
        return this.status;
    }

    setStatus(status: MCPServerStatus): void {
        this.status = status;
        this.onDidUpdateStatusEmitter.fire(status);
    }

    isRunnning(): boolean {
        return this.status === MCPServerStatus.Running
            || this.status === MCPServerStatus.Connected;
    }

    async getDescription(): Promise<MCPServerDescription> {
        let toReturnTools: ToolInformation[] | undefined = undefined;
        if (this.isRunnning()) {
            try {
                const { tools } = await this.getTools();
                toReturnTools = tools.map(tool => ({
                    name: tool.name,
                    description: tool.description
                }));
            } catch (error) {
                console.error('Error fetching tools for description:', error);
            }
        }

        return {
            name: this.name,
            command: this.command,
            args: this.args,
            env: this.env,
            serverUrl: this.serverUrl,
            serverAuthToken: this.serverAuthToken,
            serverAuthTokenHeader: this.serverAuthTokenHeader,
            autostart: this.autostart,
            status: this.status,
            error: this.error,
            tools: toReturnTools
        };
    }

    async start(): Promise<void> {
        if (this.isRunnning()
            && (this.status === MCPServerStatus.Starting || this.status === MCPServerStatus.Connecting)) {
            return;
        }

        let connected = false;
        this.client = new Client(
            {
                name: 'theia-client',
                version: '1.0.0',
            },
            {
                capabilities: {}
            }
        );
        this.error = undefined;

        if (this.transportType === 'stdio') {
            this.setStatus(MCPServerStatus.Starting);
            console.log(`Starting server "${this.name}" with command: ${this.command} and args: ${this.args?.join(' ')} and env: ${JSON.stringify(this.env)}`);

            // Filter process.env to exclude undefined values
            const sanitizedEnv: Record<string, string> = Object.fromEntries(
                Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
            );

            const mergedEnv: Record<string, string> = {
                ...sanitizedEnv,
                ...(this.env || {})
            };
            this.transport = new StdioClientTransport({
                command: this.command,
                args: this.args,
                env: mergedEnv,
            });
        } else {
            this.setStatus(MCPServerStatus.Connecting);
            console.log(`Connecting to server "${this.name}" via MCP Server Communication with URL: ${this.serverUrl}`);

            // create header for auth token
            let authHeader;
            if (this.serverAuthToken) {
                if (this.serverAuthTokenHeader) {
                    authHeader = {
                        [this.serverAuthTokenHeader]: this.serverAuthToken,
                    };
                } else {
                    authHeader = {
                        Authorization: `Bearer ${this.serverAuthToken}`,
                    };
                }
            }

            if (authHeader) {
                this.transport = new StreamableHTTPClientTransport(new URL(this.serverUrl), {
                    requestInit: { headers: authHeader },
                });
            } else {
                this.transport = new StreamableHTTPClientTransport(new URL(this.serverUrl));
            }

            try {
                await this.client.connect(this.transport);
                connected = true;
                console.log(`MCP Streamable HTTP successful connected: ${this.serverUrl}`);
            } catch (e) {
                console.log(`MCP SSE fallback initiated: ${this.serverUrl}`);
                await this.client.close();
                if (authHeader) {
                    this.transport = new SSEClientTransport(new URL(this.serverUrl), {
                        eventSourceInit: {
                            fetch: (url, init) =>
                                fetch(url, { ...init, headers: authHeader }),
                        },
                        requestInit: { headers: authHeader },
                    });
                } else {
                    this.transport = new SSEClientTransport(new URL(this.serverUrl));
                }
            }
        }

        this.transport.onerror = error => {
            console.error('Error: ', error);
            this.error = 'Error: ' + error;
            this.setStatus(MCPServerStatus.Errored);
        };

        this.client.onerror = error => {
            console.error('Error in MCP client: ', error);
            this.error = 'Error in MCP client: ' + error;
            this.setStatus(MCPServerStatus.Errored);
        };

        try {
            if (!connected) {
                await this.client.connect(this.transport);
            }
            this.setStatus(this.transportType === 'stdio' ? MCPServerStatus.Running : MCPServerStatus.Connected);
        } catch (e) {
            this.error = 'Error on MCP startup: ' + e;
            await this.client.close();
            this.setStatus(MCPServerStatus.Errored);
        }
    }

    async callTool(toolName: string, arg_string: string): Promise<CallToolResult> {
        let args;
        try {
            args = JSON.parse(arg_string);
        } catch (error) {
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
        // need to cast since other result schemas (second parameter) might be possible
        return this.client.callTool(params, CallToolResultSchema) as Promise<CallToolResult>;
    }

    async getTools(): ReturnType<Client['listTools']> {
        if (this.isRunnning()) {
            return this.client.listTools();
        }
        return { tools: [] };
    }

    update(description: MCPServerDescription): void {
        this.name = description.name;
        this.command = description.command ? description.command : '';
        this.args = description.args;
        this.env = description.env;

        if (description.serverUrl) {
            this.transportType = 'server';
            this.serverUrl = description.serverUrl;
            this.serverAuthToken = description.serverAuthToken;
            this.serverAuthTokenHeader = description.serverAuthTokenHeader;
            this.status = MCPServerStatus.NotConnected;
        } else {
            this.transportType = 'stdio';
            this.status = MCPServerStatus.NotRunning;
        }

        this.autostart = description.autostart;
    }

    async stop(): Promise<void> {
        if (!this.isRunnning() || !this.client) {
            return;
        }
        if (this.transportType === 'stdio') {
            console.log(`Stopping MCP server "${this.name}"`);
            this.setStatus(MCPServerStatus.NotRunning);
        } else {
            console.log(`Disconnecting MCP server "${this.name}"`);
            if (this.transport instanceof StreamableHTTPClientTransport) {
                console.log(`Terminating session for MCP server "${this.name}"`);
                await (this.transport as StreamableHTTPClientTransport).terminateSession();
            }
            this.setStatus(MCPServerStatus.NotConnected);
        }
        await this.client.close();
    }

    readResource(resourceId: string): Promise<ReadResourceResult> {
        const params = { uri: resourceId };
        return this.client.readResource(params);
    }

    getResources(): Promise<ListResourcesResult> {
        return this.client.listResources();
    }
}
