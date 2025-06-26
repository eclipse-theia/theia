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
import { CommandContribution, CommandRegistry, MessageService, nls } from '@theia/core';
import { QuickInputService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MCPFrontendService, MCPServerStatus } from '../common/mcp-server-manager';

export const StartMCPServer = {
    id: 'mcp.startserver',
    label: nls.localize('theia/ai/mcp/start/label', 'MCP: Start MCP Server'),
};
export const StopMCPServer = {
    id: 'mcp.stopserver',
    label: nls.localize('theia/ai/mcp/stop/label', 'MCP: Stop MCP Server'),
};

@injectable()
export class MCPCommandContribution implements CommandContribution {
    @inject(AICommandHandlerFactory)
    protected readonly commandHandlerFactory: AICommandHandlerFactory;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService)
    protected messageService: MessageService;

    @inject(MCPFrontendService)
    protected readonly mcpFrontendService: MCPFrontendService;

    private async getMCPServerSelection(serverNames: string[]): Promise<string | undefined> {
        if (!serverNames || serverNames.length === 0) {
            return undefined;
        }
        const options = serverNames.map(mcpServerName => ({ label: mcpServerName }));
        const result = await this.quickInputService.showQuickPick(options);
        return result?.label;
    }

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand(StopMCPServer, this.commandHandlerFactory({
            execute: async () => {
                try {
                    const startedServers = await this.mcpFrontendService.getStartedServers();
                    if (!startedServers || startedServers.length === 0) {
                        this.messageService.error(nls.localize('theia/ai/mcp/error/noRunningServers', 'No MCP servers running.'));
                        return;
                    }
                    const selection = await this.getMCPServerSelection(startedServers);
                    if (!selection) {
                        return;
                    }
                    await this.mcpFrontendService.stopServer(selection);
                } catch (error) {
                    console.error('Error while stopping MCP server:', error);
                }
            }
        }));

        commandRegistry.registerCommand(StartMCPServer, this.commandHandlerFactory({
            execute: async () => {
                try {
                    const servers = await this.mcpFrontendService.getServerNames();
                    const startedServers = await this.mcpFrontendService.getStartedServers();
                    const startableServers = servers.filter(server => !startedServers.includes(server));
                    if (!startableServers || startableServers.length === 0) {
                        if (startedServers && startedServers.length > 0) {
                            this.messageService.error(nls.localize('theia/ai/mcp/error/allServersRunning', 'All MCP servers are already running.'));
                        } else {
                            this.messageService.error(nls.localize('theia/ai/mcp/error/noServersConfigured', 'No MCP servers configured.'));
                        }
                        return;
                    }

                    const selection = await this.getMCPServerSelection(startableServers);
                    if (!selection) {
                        return;
                    }
                    await this.mcpFrontendService.startServer(selection);
                    const serverDescription = await this.mcpFrontendService.getServerDescription(selection);
                    if (serverDescription && serverDescription.status) {
                        if (serverDescription.status === MCPServerStatus.Running
                            || serverDescription.status === MCPServerStatus.Connected) {
                            let toolNames: string | undefined = undefined;
                            if (serverDescription.tools) {
                                toolNames = serverDescription.tools.map(tool => tool.name).join(',');
                            }
                            this.messageService.info(
                                nls.localize('theia/ai/mcp/info/serverStarted', 'MCP server "{0}" successfully started. Registered tools: {1}', selection, toolNames ||
                                    nls.localize('theia/ai/mcp/tool/noTools', 'No tools available.'))
                            );
                            return;
                        }
                        if (serverDescription.error) {
                            console.error('Error while starting MCP server:', serverDescription.error);
                        }
                    }
                    this.messageService.error(nls.localize('theia/ai/mcp/error/startFailed', 'An error occurred while starting the MCP server.'));
                } catch (error) {
                    this.messageService.error(nls.localize('theia/ai/mcp/error/startFailed', 'An error occurred while starting the MCP server.'));
                    console.error('Error while starting MCP server:', error);
                }
            }
        }));
    }
}
