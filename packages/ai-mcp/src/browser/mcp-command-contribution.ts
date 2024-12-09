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
import { QuickInputService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MCPServerManager } from '../common/mcp-server-manager';
import { ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';

export const StartMCPServer = {
    id: 'mcp.startserver',
    label: 'MCP: Start MCP Server',
};
export const StopMCPServer = {
    id: 'mcp.stopserver',
    label: 'MCP: Stop MCP Server',
};

@injectable()
export class MCPCommandContribution implements CommandContribution {
    @inject(AICommandHandlerFactory)
    protected readonly commandHandlerFactory: AICommandHandlerFactory;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService)
    protected messageService: MessageService;

    @inject(MCPServerManager)
    protected readonly mcpServerManager: MCPServerManager;

    @inject(ToolInvocationRegistry)
    protected readonly toolInvocationRegistry: ToolInvocationRegistry;

    private async getMCPServerSelection(serverNames: String[]): Promise<string | undefined> {
        if (!serverNames || serverNames.length === 0) {
            this.messageService.error('No MCP Servers configured.');
            return undefined;
        }
        const options = serverNames.map(mcpServerName => ({ label: mcpServerName as string }));
        const result = await this.quickInputService.showQuickPick(options);
        if (!result) {
            return undefined;
        }
        return result.label;
    }

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand(StopMCPServer, this.commandHandlerFactory({
            execute: async () => {
                try {
                    const selection = await this.getMCPServerSelection(await this.mcpServerManager.getStartedServers());
                    if (!selection) {
                        return;
                    }
                    this.toolInvocationRegistry.unregisterAllTools(`mcp_${selection}`);
                    this.mcpServerManager.stopServer(selection);
                } catch (error) {
                    console.error('Error while stopping MCP server:', error);
                }
            }
        }));

        commandRegistry.registerCommand(StartMCPServer, this.commandHandlerFactory({
            execute: async () => {
                try {
                    const selection = await this.getMCPServerSelection(await this.mcpServerManager.getServerNames());
                    if (!selection) {
                        return;
                    }
                    this.mcpServerManager.startServer(selection);
                    const { tools } = await this.mcpServerManager.getTools(selection);
                    const toolRequests: ToolRequest[] = tools.map((tool: any) => this.convertToToolRequest(tool, selection));

                    for (const toolRequest of toolRequests) {
                        this.toolInvocationRegistry.registerTool(toolRequest);
                    }
                } catch (error) {
                    console.error('Error while starting MCP server:', error);
                }
            }
        }));
    }

    convertToToolRequest(tool: any, serverName: string): ToolRequest {
        const id = `mcp_${serverName}_${tool.name}`;
        return {
            id: id,
            name: id,
            providerName: `mcp_${serverName}`,
            parameters: tool.inputSchema ? {
                type: tool.inputSchema.type,
                properties: tool.inputSchema.properties,
            } : undefined,
            description: tool.description,
            handler: async (arg_string: string) => {
                try {
                    return await this.mcpServerManager.callTool(serverName, tool.name, arg_string);
                } catch (error) {
                    console.error(`Error in tool handler for ${tool.name} on server ${serverName}:`, error);
                    throw error;
                }
            },
        };
    }

}
