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
import {MCPServerDescription, MCPServerStatus, ToolInformation} from '../common';
import {Emitter} from '@theia/core/lib/common/event';

export type TransportType = 'stdio' | 'sse';

export class MCPServer {
    private name: string;
    private command: string;
    private args?: string[];
    private client: Client;
    private env?: { [key: string]: string };
    private autostart?: boolean;
    private error?: string;
    private status: MCPServerStatus = MCPServerStatus.NotRunning;

    // Event emitter for status updates
    private readonly onDidUpdateStatusEmitter = new Emitter<MCPServerStatus>();
    readonly onDidUpdateStatus = this.onDidUpdateStatusEmitter.event;
    private readonly transportType: TransportType;
    private readonly sseUrl?: string;

    constructor(description: MCPServerDescription) {
        this.name = description.name;
        this.command = description.command;
        this.args = description.args;
        this.env = description.env;
        this.autostart = description.autostart;
        if (this.env?.sseUrl) {
            this.sseUrl = this.env.sseUrl;
            this.transportType = 'sse';
        } else {
            this.transportType = 'stdio';
        }
        console.log(this.autostart);
    }

    getStatus(): MCPServerStatus {
        return this.status;
    }

    setStatus(status: MCPServerStatus): void {
        this.status = status;
        this.onDidUpdateStatusEmitter.fire(status);
    }

    isRunnning(): boolean {
        return this.status === MCPServerStatus.Running;
    }

    async getDescription(): Promise<MCPServerDescription> {
        let toReturnTools: ToolInformation[] | undefined = undefined;
        if (this.isRunnning()) {
            try {
                const {tools} = await this.getTools();
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
            autostart: this.autostart,
            status: this.status,
            error: this.error,
            tools: toReturnTools
        };
    }

    async start(): Promise<void> {
        if (this.isRunnning() && this.status === MCPServerStatus.Starting) {
            return;
        }

        this.setStatus(MCPServerStatus.Starting);
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
            this.error = 'Error: ' + error;
            this.setStatus(MCPServerStatus.Errored);
        };

        this.client = new Client({
            name: 'theia-client',
            version: '1.0.0',
        }, {
            capabilities: {}
        });
        this.client.onerror = (error: Error) => {
            console.error('Error in MCP client: ' + error);
            this.error = 'Error in MCP client: ' + error;
            this.setStatus(MCPServerStatus.Errored);
        };

        try {
            await this.client.connect(transport);
            this.setStatus(MCPServerStatus.Running);
        } catch (e) {
            this.error = 'Error on MCP startup: ' + e;
            this.client.close();
            this.setStatus(MCPServerStatus.Errored);
        }
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

    update(description: MCPServerDescription): void {
        this.name = description.name;
        this.command = description.command;
        this.args = description.args;
        this.env = description.env;
        this.autostart = description.autostart;
    }

    stop(): void {
        if (!this.isRunnning() || !this.client) {
            return;
        }
        console.log(`Stopping MCP server "${this.name}"`);
        this.client.close();
        this.setStatus(MCPServerStatus.NotRunning);
    }

    listResources(): ReturnType<Client['listResources']> {
        return this.client.listResources();
    }

    readResource(resourceId: string): ReturnType<Client['readResource']> {
        const params = {uri: resourceId};
        return this.client.readResource(params);
    }
}
