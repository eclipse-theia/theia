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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

export class MCPServer {
    private name: string;
    private command: string;
    private args?: string[];
    private client: Client;
    private env?: { [key: string]: string };
    private started: boolean = false;

    constructor(name: string, command: string, args?: string[], env?: Record<string, string>) {
        this.name = name;
        this.command = command;
        this.args = args;
        this.env = env;
    }

    isStarted(): boolean {
        return this.started;
    }

    async start(): Promise<void> {
        if (this.started) {
            return;
        }
        console.log(`Starting server "${this.name}" with command: ${this.command} and args: ${this.args?.join(' ')} and env: ${JSON.stringify(this.env)}`);
        // Filter process.env to exclude undefined values
        const sanitizedEnv: Record<string, string> = Object.fromEntries(
            Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
        );

        const mergedEnv: Record<string, string> = {
            ...sanitizedEnv,
            ...(this.env || {})
        };
        const transport = new StdioClientTransport({
            command: this.command,
            args: this.args,
            env: mergedEnv,
        });
        transport.onerror = error => {
            console.error('Error: ' + error);
        };

        this.client = new Client({
            name: 'theia-client',
            version: '1.0.0',
        }, {
            capabilities: {}
        });
        this.client.onerror = error => {
            console.error('Error in MCP client: ' + error);
        };

        await this.client.connect(transport);
        this.started = true;
    }

    async callTool(toolName: string, arg_string: string): ReturnType<Client['callTool']> {
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
        return this.client.callTool(params);
    }

    async getTools(): ReturnType<Client['listTools']> {
        return this.client.listTools();
    }

    async getResources(): ReturnType<Client['listResources']> {
        return this.client.listResources();
    }

    async getResourceContent(resourceId: string): ReturnType<Client['readResource']> {
        return this.client.readResource({ uri: resourceId });
    }

    update(command: string, args?: string[], env?: { [key: string]: string }): void {
        this.command = command;
        this.args = args;
        this.env = env;
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
