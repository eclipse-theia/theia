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

import { CHAT_VIEW_LANGUAGE_ID } from '@theia/ai-chat-ui/lib/browser/chat-view-language-contribution';
import { nls, URI } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import * as monaco from '@theia/monaco-editor-core';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { CLAUDE_CHAT_AGENT_ID } from './claude-code-chat-agent';

const CLAUDE_COMMANDS = '.claude/commands';

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

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    onStart(): void {
        monaco.languages.registerCompletionItemProvider(CHAT_VIEW_LANGUAGE_ID, {
            triggerCharacters: ['/'],
            provideCompletionItems: (model, position, _context, _token) =>
                this.provideSlashCompletions(model, position),
        });
    }

    protected async provideSlashCompletions(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): Promise<monaco.languages.CompletionList> {
        const isClaudeCode = this.contextKeyService.match(`chatInputReceivingAgent == '${CLAUDE_CHAT_AGENT_ID}'`);
        if (!isClaudeCode) {
            return { suggestions: [] };
        }

        const completionRange = this.getCompletionRange(model, position, '/');
        if (completionRange === undefined) {
            return { suggestions: [] };
        }

        try {
            const suggestions: monaco.languages.CompletionItem[] = [];

            // Add static commands
            this.staticCommands.forEach(command => {
                suggestions.push({
                    insertText: `${command.name} `,
                    kind: monaco.languages.CompletionItemKind.Function,
                    label: command.name,
                    range: completionRange,
                    detail: command.description
                });
            });

            // Add dynamic commands from .claude/commands directory
            const roots = this.workspaceService.tryGetRoots();
            if (roots.length >= 1) {
                const uri = roots[0].resource;
                const claudeCommandsUri = uri.resolve(CLAUDE_COMMANDS);
                const files = await this.listFilesDirectly(claudeCommandsUri);
                const commands = files
                    .filter(file => file.endsWith('.md'))
                    .map(file => file.replace(/\.md$/, ''));

                commands.forEach(commandName => {
                    suggestions.push({
                        insertText: `${commandName} `,
                        kind: monaco.languages.CompletionItemKind.Function,
                        label: commandName,
                        range: completionRange,
                        detail: nls.localize('theia/ai/claude-code/commandDetail', 'Claude command: {0}', commandName)
                    });
                });
            }

            return { suggestions };
        } catch (error) {
            console.error('Error in Claude completion provider:', error);
            return { suggestions: [] };
        }
    }

    protected getCompletionRange(model: monaco.editor.ITextModel, position: monaco.Position, triggerCharacter: string): monaco.Range | undefined {
        const wordInfo = model.getWordUntilPosition(position);
        const lineContent = model.getLineContent(position.lineNumber);

        // one to the left, and -1 for 0-based index
        const characterBeforeCurrentWord = lineContent[wordInfo.startColumn - 1 - 1];
        if (characterBeforeCurrentWord !== triggerCharacter) {
            return undefined;
        }

        return new monaco.Range(
            position.lineNumber,
            wordInfo.startColumn,
            position.lineNumber,
            position.column
        );
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
