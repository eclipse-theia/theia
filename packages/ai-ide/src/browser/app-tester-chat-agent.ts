/* eslint-disable max-len */

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

import { AbstractStreamParsingChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import { ErrorChatResponseContentImpl, MarkdownChatResponseContentImpl, MutableChatRequestModel, QuestionResponseContentImpl } from '@theia/ai-chat/lib/common/chat-model';
import { LanguageModelRequirement } from '@theia/ai-core/lib/common';
import { MCPFrontendService, MCPServerDescription } from '@theia/ai-mcp/lib/common/mcp-server-manager';
import { nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MCP_SERVERS_PREF } from '@theia/ai-mcp/lib/browser/mcp-preferences';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/browser';
import { appTesterTemplate, appTesterTemplateVariant, REQUIRED_MCP_SERVERS } from './app-tester-prompt-template';

export const AppTesterChatAgentId = 'AppTester';
@injectable()
export class AppTesterChatAgent extends AbstractStreamParsingChatAgent {

    @inject(MCPFrontendService)
    protected readonly mcpService: MCPFrontendService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    id: string = AppTesterChatAgentId;
    name = AppTesterChatAgentId;
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'openai/gpt-4o',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';
    override description = nls.localize('theia/ai/chat/app-tester/description', 'This agent tests your application user interface to verify user-specified test scenarios through the Playwright MCP server. '
        + 'It can automate testing workflows and provide detailed feedback on application functionality.');

    override iconClass: string = 'codicon codicon-beaker';
    protected override systemPromptId: string = 'app-tester-system';
    override prompts = [{ id: 'app-tester-system', defaultVariant: appTesterTemplate, variants: [appTesterTemplateVariant] }];

    /**
     * Override invoke to check if the Playwright MCP server is running, and if not, ask the user if it should be started.
     */
    override async invoke(request: MutableChatRequestModel): Promise<void> {
        try {
            if (await this.requiresStartingServers()) {
                // Ask the user if they want to start the server
                request.response.response.addContent(new QuestionResponseContentImpl(
                    'The Playwright MCP servers are not running. Would you like to start them now? This may install the Playwright MCP servers.',
                    [
                        { text: 'Yes, start the servers', value: 'yes' },
                        { text: 'No, cancel', value: 'no' }
                    ],
                    request,
                    async selectedOption => {
                        if (selectedOption.value === 'yes') {
                            // Show progress
                            const progress = request.response.addProgressMessage({ content: 'Starting Playwright MCP servers.', show: 'whileIncomplete' });
                            try {
                                await this.startServers();
                                // Remove progress, continue with normal flow
                                request.response.updateProgressMessage({ ...progress, show: 'whileIncomplete', status: 'completed' });
                                await super.invoke(request);
                            } catch (error) {
                                request.response.response.addContent(new ErrorChatResponseContentImpl(
                                    new Error('Failed to start Playwright MCP server: ' + (error instanceof Error ? error.message : String(error)))
                                ));
                                request.response.complete();
                            }
                        } else {
                            // Continue without starting the server
                            request.response.response.addContent(new MarkdownChatResponseContentImpl('Please setup the MCP servers.'));
                            request.response.complete();
                        }
                    }
                ));
                request.response.waitForInput();
                return;
            }
            // If already running, continue as normal
            await super.invoke(request);
        } catch (error) {
            request.response.response.addContent(new ErrorChatResponseContentImpl(
                new Error('Error checking Playwright MCP server status: ' + (error instanceof Error ? error.message : String(error)))
            ));
            request.response.complete();
        }
    }

    protected async requiresStartingServers(): Promise<boolean> {
        const allStarted = await Promise.all(REQUIRED_MCP_SERVERS.map(server => this.mcpService.isServerStarted(server.name)));
        return allStarted.some(started => !started);
    }

    protected async startServers(): Promise<void> {
        await this.ensureServersStarted(...REQUIRED_MCP_SERVERS);
    }

    /**
     * Starts the Playwright MCP server if it doesn't exist or isn't running.
     *
     * @returns A promise that resolves when the server is started
     */
    async ensureServersStarted(...servers: MCPServerDescription[]): Promise<void> {
        try {
            const serversToInstall: MCPServerDescription[] = [];
            const serversToStart: MCPServerDescription[] = [];

            for (const server of servers) {
                if (!(await this.mcpService.hasServer(server.name))) {
                    serversToInstall.push(server);
                }
                if (!(await this.mcpService.isServerStarted(server.name))) {
                    serversToStart.push(server);
                }
            }

            for (const server of serversToInstall) {
                const currentServers = this.preferenceService.get<Record<string, MCPServerDescription>>(MCP_SERVERS_PREF, {});
                await this.preferenceService.set(MCP_SERVERS_PREF, { ...currentServers, [server.name]: server }, PreferenceScope.User);
                await this.mcpService.addOrUpdateServer(server);
            }

            for (const server of serversToStart) {
                await this.mcpService.startServer(server.name);
            }
        } catch (error) {
            this.logger.error(`Error starting MCP servers ${servers.map(s => s.name)}: ${error}`);
            throw error;
        }
    }
}
