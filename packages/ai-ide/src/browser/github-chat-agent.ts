// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { nls, CommandService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MCP_SERVERS_PREF } from '@theia/ai-mcp/lib/common/mcp-preferences';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/common';
import { PreferencesCommands } from '@theia/preferences/lib/browser/util/preference-types';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { githubTemplate, REQUIRED_GITHUB_MCP_SERVERS } from './github-prompt-template';

export const GitHubChatAgentId = 'GitHub';

@injectable()
export class GitHubChatAgent extends AbstractStreamParsingChatAgent {

    @inject(MCPFrontendService)
    protected readonly mcpService: MCPFrontendService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(FileService)
    protected readonly fileService: FileService;

    id: string = GitHubChatAgentId;
    name = GitHubChatAgentId;
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'default/code',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';
    override description = nls.localize('theia/ai/ide/github/description', 'This agent helps you interact with GitHub repositories, issues, pull requests, and other GitHub '
        + 'features through the GitHub MCP server. '
        + 'It can help you manage your repositories, create issues, handle pull requests, and perform various GitHub operations.');

    override iconClass: string = 'codicon codicon-github';
    protected override systemPromptId: string = 'github-system';
    override prompts = [{ id: 'github-system', defaultVariant: githubTemplate, variants: [] }];

    /**
     * Override invoke to check if the GitHub MCP server is configured and running,
     * and if not, offer to configure or start it.
     */
    override async invoke(request: MutableChatRequestModel): Promise<void> {
        try {
            if (await this.requiresConfiguration()) {
                // Ask the user if they want to configure the GitHub server
                request.response.response.addContent(new QuestionResponseContentImpl(nls.localize('theia/ai/ide/github/configureGitHubServer/question',
                    'The GitHub MCP server is not configured. Would you like to configure it now? '
                    + 'This will open the settings.json file where you can add your GitHub access token.'),
                    [
                        { text: nls.localize('theia/ai/ide/github/configureGitHubServer/yes', 'Yes, configure GitHub server'), value: 'configure' },
                        { text: nls.localize('theia/ai/ide/github/configureGitHubServer/no', 'No, cancel'), value: 'cancel' }
                    ],
                    request,
                    async selectedOption => {
                        if (selectedOption.value === 'configure') {
                            await this.offerConfiguration();
                            request.response.response.addContent(new MarkdownChatResponseContentImpl(nls.localize('theia/ai/ide/github/configureGitHubServer/followup',
                                'Settings file opened. Please add your GitHub Personal Access Token to the `serverAuthToken` property in the GitHub server configuration, then '
                                + ' save and try again.\n\n' +
                                'You can create a Personal Access Token at: https://github.com/settings/tokens'
                            )));
                            request.response.complete();
                        } else {
                            request.response.response.addContent(new MarkdownChatResponseContentImpl(nls.localize('theia/ai/ide/github/configureGitHubServer/canceled',
                                'GitHub server configuration cancelled. Please configure the GitHub MCP server to use this agent.')));
                            request.response.complete();
                        }
                    }
                ));
                request.response.waitForInput();
                return;
            }

            if (await this.requiresStartingServer()) {
                // Ask the user if they want to start the server
                request.response.response.addContent(new QuestionResponseContentImpl(nls.localize('theia/ai/ide/github/startGitHubServer/question',
                    'The GitHub MCP server is configured but not running. Would you like to start it now?'),
                    [
                        { text: nls.localize('theia/ai/ide/github/startGitHubServer/yes', 'Yes, start the server'), value: 'yes' },
                        { text: nls.localize('theia/ai/ide/github/startGitHubServer/no', 'No, cancel'), value: 'no' }
                    ],
                    request,
                    async selectedOption => {
                        if (selectedOption.value === 'yes') {
                            const progress = request.response.addProgressMessage({
                                content: nls.localize('theia/ai/ide/github/startGitHubServer/progress', 'Starting GitHub MCP server.'),
                                show: 'whileIncomplete'
                            });
                            try {
                                await this.startServer();
                                request.response.updateProgressMessage({ ...progress, show: 'whileIncomplete', status: 'completed' });
                                await super.invoke(request);
                            } catch (error) {
                                request.response.response.addContent(new ErrorChatResponseContentImpl(
                                    new Error(nls.localize('theia/ai/ide/github/startGitHubServer/error', 'Failed to start GitHub MCP server: {0}',
                                        error instanceof Error ? error.message : String(error)))
                                ));
                                request.response.complete();
                            }
                        } else {
                            request.response.response.addContent(new MarkdownChatResponseContentImpl(nls.localize('theia/ai/ide/github/startGitHubServer/canceled',
                                'Please start the GitHub MCP server to use this agent.')));
                            request.response.complete();
                        }
                    }
                ));
                request.response.waitForInput();
                return;
            }

            // If already configured and running, continue as normal
            await super.invoke(request);
        } catch (error) {
            request.response.response.addContent(new ErrorChatResponseContentImpl(
                new Error(nls.localize('theia/ai/ide/github/errorCheckingGitHubServerStatus', 'Error checking GitHub MCP server status: {0}',
                    error instanceof Error ? error.message : String(error)))
            ));
            request.response.complete();
        }
    }

    protected async requiresConfiguration(): Promise<boolean> {
        const serverConfigured = await this.mcpService.hasServer(REQUIRED_GITHUB_MCP_SERVERS[0].name);
        return !serverConfigured;
    }

    protected async requiresStartingServer(): Promise<boolean> {
        const serverStarted = await this.mcpService.isServerStarted(REQUIRED_GITHUB_MCP_SERVERS[0].name);
        return !serverStarted;
    }

    protected async startServer(): Promise<void> {
        await this.ensureServerStarted(REQUIRED_GITHUB_MCP_SERVERS[0]);
    }

    protected async offerConfiguration(): Promise<void> {
        const currentServers = this.preferenceService.get<Record<string, MCPServerDescription>>(MCP_SERVERS_PREF, {});
        const githubServer = REQUIRED_GITHUB_MCP_SERVERS[0];

        const { name, ...serverWithoutName } = githubServer;
        await this.preferenceService.set(MCP_SERVERS_PREF, {
            ...currentServers,
            [name]: serverWithoutName
        }, PreferenceScope.User);

        await this.openAndFocusOnGitHubConfig(name);
    }

    /**
     * Opens the user preferences JSON file and attempts to focus on the GitHub server configuration.
     */
    protected async openAndFocusOnGitHubConfig(serverName: string): Promise<void> {
        try {
            const configUri = this.preferenceService.getConfigUri(PreferenceScope.User);
            if (!configUri) {
                this.logger.debug('Could not get config URI for user preferences');
                return;
            }

            if (!await this.fileService.exists(configUri)) {
                await this.fileService.create(configUri);
            }

            const content = await this.fileService.read(configUri);
            const text = content.value;

            const preferencePattern = `"${MCP_SERVERS_PREF}"`;
            const preferenceMatch = text.indexOf(preferencePattern);

            let selection: { start: { line: number; character: number } } | undefined;

            if (preferenceMatch !== -1) {
                const serverPattern = `"${serverName}"`;
                const serverMatch = text.indexOf(serverPattern, preferenceMatch);

                if (serverMatch !== -1) {
                    const lines = text.substring(0, serverMatch).split('\n');
                    const line = lines.length - 1;
                    const character = lines[lines.length - 1].length;

                    selection = {
                        start: { line, character }
                    };
                }
            }

            await this.editorManager.open(configUri, {
                selection
            });
        } catch (error) {
            this.logger.debug('Failed to open and focus on GitHub configuration:', error);
            // Fallback to just opening the preferences file
            await this.commandService.executeCommand(PreferencesCommands.OPEN_USER_PREFERENCES_JSON.id);
        }
    }

    /**
     * Starts the GitHub MCP server if it doesn't exist or isn't running.
     *
     * @returns A promise that resolves when the server is started
     */
    async ensureServerStarted(server: MCPServerDescription): Promise<void> {
        try {
            if (!(await this.mcpService.hasServer(server.name))) {
                const currentServers = this.preferenceService.get<Record<string, MCPServerDescription>>(MCP_SERVERS_PREF, {});
                const { name, ...serverWithoutName } = server;
                await this.preferenceService.set(MCP_SERVERS_PREF, { ...currentServers, [name]: serverWithoutName }, PreferenceScope.User);
                await this.mcpService.addOrUpdateServer(server);
            }

            if (!(await this.mcpService.isServerStarted(server.name))) {
                await this.mcpService.startServer(server.name);
            }
        } catch (error) {
            this.logger.error(`Error starting GitHub MCP server ${server.name}: ${error}`);
            throw error;
        }
    }
}
