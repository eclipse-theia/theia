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
import { isLocalMCPServerDescription, isRemoteMCPServerDescription, MCPServerDescription, MCPServerStatus, ToolInformation } from '../common';
import { Emitter } from '@theia/core/lib/common/event';
import { CallToolResult, CallToolResultSchema, ListResourcesResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport';

export class MCPServer {
    private description: MCPServerDescription;
    private transport: Transport;
    private client: Client;
    private error?: string;
    private status: MCPServerStatus;

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
            ...this.description,
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

        if (isLocalMCPServerDescription(this.description)) {
            this.setStatus(MCPServerStatus.Starting);
            console.log(
                `Starting server "${this.description.name}" with command: ${this.description.command} ` +
                `and args: ${this.description.args?.join(' ')} and env: ${JSON.stringify(this.description.env)}`
            );

            // Filter process.env to exclude undefined values
            const sanitizedEnv: Record<string, string> = Object.fromEntries(
                Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
            );

            const mergedEnv: Record<string, string> = {
                ...sanitizedEnv,
                ...(this.description.env || {})
            };
            this.transport = new StdioClientTransport({
                command: this.description.command,
                args: this.description.args,
                env: mergedEnv,
            });
        } else if (isRemoteMCPServerDescription(this.description)) {
            this.setStatus(MCPServerStatus.Connecting);
            console.log(`Connecting to server "${this.description.name}" via MCP Server Communication with URL: ${this.description.serverUrl}`);

            let descHeaders;
            if (this.description.headers) {
                descHeaders = this.description.headers;
            }

            // create header for auth token
            if (this.description.serverAuthToken) {
                if (!descHeaders) {
                    descHeaders = {};
                }

                if (this.description.serverAuthTokenHeader) {
                    descHeaders = { ...descHeaders, [this.description.serverAuthTokenHeader]: this.description.serverAuthToken };
                } else {
                    descHeaders = { ...descHeaders, Authorization: `Bearer ${this.description.serverAuthToken}` };
                }
            }

            if (descHeaders) {
                this.transport = new StreamableHTTPClientTransport(new URL(this.description.serverUrl), {
                    requestInit: { headers: descHeaders },
                });
            } else {
                this.transport = new StreamableHTTPClientTransport(new URL(this.description.serverUrl));
            }

            try {
                await this.client.connect(this.transport);
                connected = true;
                console.log(`MCP Streamable HTTP successful connected: ${this.description.serverUrl}`);
            } catch (e) {
                console.log(`MCP SSE fallback initiated: ${this.description.serverUrl}`);
                await this.client.close();
                if (descHeaders) {
                    this.transport = new SSEClientTransport(new URL(this.description.serverUrl), {
                        eventSourceInit: {
                            fetch: (url, init) =>
                                fetch(url, { ...init, headers: descHeaders }),
                        },
                        requestInit: { headers: descHeaders },
                    });
                } else {
                    this.transport = new SSEClientTransport(new URL(this.description.serverUrl));
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
            this.setStatus(isLocalMCPServerDescription(this.description) ? MCPServerStatus.Running : MCPServerStatus.Connected);
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
                `Failed to parse arguments for calling tool "${toolName}" in MCP server "${this.description.name}".
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
        this.description = description;

        if (isRemoteMCPServerDescription(description)) {
            this.status = MCPServerStatus.NotConnected;
        } else {
            this.status = MCPServerStatus.NotRunning;
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunnning() || !this.client) {
            return;
        }
        if (isLocalMCPServerDescription(this.description)) {
            console.log(`Stopping MCP server "${this.description.name}"`);
            this.setStatus(MCPServerStatus.NotRunning);
        } else {
            console.log(`Disconnecting MCP server "${this.description.name}"`);
            if (this.transport instanceof StreamableHTTPClientTransport) {
                console.log(`Terminating session for MCP server "${this.description.name}"`);
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
