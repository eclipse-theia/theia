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

import { PromptService } from '@theia/ai-core/lib/common/prompt-service';
import { DisposableCollection, nls, URI } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangeType } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { CLAUDE_CHAT_AGENT_ID } from './claude-code-chat-agent';

const CLAUDE_COMMANDS = '.claude/commands';
const COMMAND_FRAGMENT_PREFIX = 'claude-code-slash-';
const DYNAMIC_COMMAND_PREFIX = 'claude-code-dynamic-';

interface StaticSlashCommand {
    name: string;
    description: string;
}

@injectable()
export class ClaudeCodeSlashCommandsContribution implements FrontendApplicationContribution {

    private readonly staticCommands: StaticSlashCommand[] = [
        {
            name: 'clear',
            description: nls.localize('theia/ai/claude-code/clearCommand/description', 'Create a new session'),
        },
        {
            name: 'compact',
            description: nls.localize('theia/ai/claude-code/compactCommand/description', 'Compact conversation with optional focus instructions'),
        },
        {
            name: 'config',
            description: nls.localize('theia/ai/claude-code/configCommand/description', 'Open Claude Code Configuration'),
        },
        {
            name: 'init',
            description: nls.localize('theia/ai/claude-code/initCommand/description', 'Initialize project with CLAUDE.md guide'),
        },
        {
            name: 'memory',
            description: nls.localize('theia/ai/claude-code/memoryCommand/description', 'Edit CLAUDE.md memory file'),
        },
        {
            name: 'review',
            description: nls.localize('theia/ai/claude-code/reviewCommand/description', 'Request code review'),
        },
        {
            name: 'resume',
            description: nls.localize('theia/ai/claude-code/resumeCommand/description', 'Resume a session'),
        }
    ];

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    protected readonly toDispose = new DisposableCollection();
    protected currentWorkspaceRoot: URI | undefined;
    protected fileWatcherDisposable: DisposableCollection | undefined;

    async onStart(): Promise<void> {
        this.registerStaticCommands();
        await this.initializeDynamicCommands();

        this.toDispose.push(
            this.workspaceService.onWorkspaceChanged(() => this.handleWorkspaceChange())
        );
    }

    onStop(): void {
        this.toDispose.dispose();
    }

    protected registerStaticCommands(): void {
        for (const command of this.staticCommands) {
            this.promptService.addBuiltInPromptFragment({
                id: `${COMMAND_FRAGMENT_PREFIX}${command.name}`,
                template: `/${command.name}`,
                isCommand: true,
                commandName: command.name,
                commandDescription: command.description,
                commandAgents: [CLAUDE_CHAT_AGENT_ID]
            });
        }
    }

    protected async initializeDynamicCommands(): Promise<void> {
        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot) {
            return;
        }

        this.currentWorkspaceRoot = workspaceRoot;
        await this.registerDynamicCommandsForWorkspace(workspaceRoot);
        this.setupFileWatcher(workspaceRoot);
    }

    protected async registerDynamicCommandsForWorkspace(workspaceRoot: URI): Promise<void> {
        const commandsUri = this.getCommandsUri(workspaceRoot);
        const files = await this.listMarkdownFiles(commandsUri);

        for (const filename of files) {
            await this.registerDynamicCommand(commandsUri, filename);
        }
    }

    protected async registerDynamicCommand(commandsDir: URI, filename: string): Promise<void> {
        const commandName = this.getCommandNameFromFilename(filename);
        const fileUri = commandsDir.resolve(filename);

        try {
            const content = await this.fileService.read(fileUri);
            this.promptService.addBuiltInPromptFragment({
                id: this.getDynamicCommandId(commandName),
                template: content.value,
                isCommand: true,
                commandName,
                commandAgents: [CLAUDE_CHAT_AGENT_ID]
            });
        } catch (error) {
            console.error(`Failed to register dynamic command ${commandName}:`, error);
        }
    }

    protected setupFileWatcher(workspaceRoot: URI): void {
        this.fileWatcherDisposable?.dispose();
        this.fileWatcherDisposable = new DisposableCollection();

        const commandsUri = this.getCommandsUri(workspaceRoot);

        this.fileWatcherDisposable.push(
            this.fileService.onDidFilesChange(async event => {
                const relevantChanges = event.changes.filter(change =>
                    this.isCommandFile(change.resource, commandsUri)
                );

                if (relevantChanges.length === 0) {
                    return;
                }

                for (const change of relevantChanges) {
                    await this.handleFileChange(change.resource, change.type, commandsUri);
                }
            })
        );

        this.toDispose.push(this.fileWatcherDisposable);
    }

    protected async handleFileChange(resource: URI, changeType: FileChangeType, commandsUri: URI): Promise<void> {
        const filename = resource.path.base;
        const commandName = this.getCommandNameFromFilename(filename);
        const fragmentId = this.getDynamicCommandId(commandName);

        if (changeType === FileChangeType.DELETED) {
            this.promptService.removePromptFragment(fragmentId);
        } else if (changeType === FileChangeType.ADDED || changeType === FileChangeType.UPDATED) {
            await this.registerDynamicCommand(commandsUri, filename);
        }
    }

    protected async handleWorkspaceChange(): Promise<void> {
        const newRoot = this.getWorkspaceRoot();

        if (this.currentWorkspaceRoot?.toString() === newRoot?.toString()) {
            return;
        }

        await this.clearDynamicCommands();
        this.currentWorkspaceRoot = newRoot;
        await this.initializeDynamicCommands();
    }

    protected async clearDynamicCommands(): Promise<void> {
        if (!this.currentWorkspaceRoot) {
            return;
        }

        const commandsUri = this.getCommandsUri(this.currentWorkspaceRoot);
        const files = await this.listMarkdownFiles(commandsUri);

        for (const filename of files) {
            const commandName = this.getCommandNameFromFilename(filename);
            this.promptService.removePromptFragment(this.getDynamicCommandId(commandName));
        }
    }

    protected getWorkspaceRoot(): URI | undefined {
        const roots = this.workspaceService.tryGetRoots();
        return roots.length > 0 ? roots[0].resource : undefined;
    }

    protected getCommandsUri(workspaceRoot: URI): URI {
        return workspaceRoot.resolve(CLAUDE_COMMANDS);
    }

    protected isCommandFile(resource: URI, commandsUri: URI): boolean {
        return resource.toString().startsWith(commandsUri.toString()) && resource.path.ext === '.md';
    }

    protected getCommandNameFromFilename(filename: string): string {
        return filename.replace(/\.md$/, '');
    }

    protected getDynamicCommandId(commandName: string): string {
        return `${DYNAMIC_COMMAND_PREFIX}${commandName}`;
    }

    protected async listMarkdownFiles(uri: URI): Promise<string[]> {
        const allFiles = await this.listFilesDirectly(uri);
        return allFiles.filter(file => file.endsWith('.md'));
    }

    protected async listFilesDirectly(uri: URI): Promise<string[]> {
        const result: string[] = [];
        if (!await this.fileService.exists(uri)) {
            return result;
        }

        const stat = await this.fileService.resolve(uri);
        if (stat && stat.isDirectory && stat.children) {
            for (const child of stat.children) {
                result.push(child.resource.path.base);
            }
        }

        return result;
    }

}
