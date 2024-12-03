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
import { AICommandHandlerFactory } from '@theia/ai-core/lib/browser/ai-command-handler-factory';
import { CommandContribution, CommandRegistry, MessageService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MCPServerManager } from '../common/mcp-server-manager';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListResourcesResultSchema } from '@modelcontextprotocol/sdk/types';

export const StartMCPServer = {
    id: 'mcp.startserver',
    label: 'MCP: Start MCP Server',
};
export const ListMCPCapabilities = {
    id: 'mcp.listCapabilities',
    label: 'MCP: List Capabilites',
};

@injectable()
export class MCPCommandContribution implements CommandContribution {

    @inject(AICommandHandlerFactory)
    protected readonly commandHandlerFactory: AICommandHandlerFactory;


    @inject(MessageService)
    protected messageService: MessageService;

    @inject(MCPServerManager)
    protected readonly mcpServerManager: MCPServerManager;



    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand(ListMCPCapabilities, this.commandHandlerFactory({
            execute: async () => {
                const transport = new StdioClientTransport({
                    command: "localhost",
                });

                const client = new Client({
                    name: "example-client",
                    version: "1.0.0",
                }, {
                    capabilities: {}
                });

                await client.connect(transport);

                // List available capabilites
                const resources = await client.request(
                    { method: "capabilites/list" },
                    ListResourcesResultSchema
                );
                this.messageService.info(JSON.stringify(resources));
            }
        }));

        commandRegistry.registerCommand(StartMCPServer, this.commandHandlerFactory({
            execute: async () => {
                this.mcpServerManager.startServer();
            }
        }));
    }
}
