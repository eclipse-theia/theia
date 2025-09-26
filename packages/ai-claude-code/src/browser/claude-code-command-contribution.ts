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

import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { codicon } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ChatCommands } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { AIActivationService } from '@theia/ai-core/lib/browser';

export const OPEN_CLAUDE_CODE_CONFIG = Command.toLocalizedCommand({
    id: 'chat:open-claude-code-config',
    category: 'Chat',
    iconClass: codicon('bracket'),
    label: 'Open Claude Code Configuration'
}, 'theia/ai-claude-code/open-config', ChatCommands.CHAT_CATEGORY);

export const OPEN_CLAUDE_CODE_MEMORY = Command.toLocalizedCommand({
    id: 'chat:open-claude-code-memory',
    category: 'Chat',
    iconClass: codicon('bracket'),
    label: 'Open Claude Code Memory (CLAUDE.MD)'
}, 'theia/ai-claude-code/open-memory', ChatCommands.CHAT_CATEGORY);

@injectable()
export class ClaudeCodeCommandContribution implements CommandContribution {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(OPEN_CLAUDE_CODE_CONFIG, {
            execute: async () => await this.openFileInWorkspace('.claude/settings.json', JSON.stringify({}, undefined, 2)),
            isVisible: () => this.activationService.isActive,
            isEnabled: () => this.activationService.isActive
        });
        commands.registerCommand(OPEN_CLAUDE_CODE_MEMORY, {
            execute: async () => await this.openFileInWorkspace('.claude/CLAUDE.md', ''),
            isVisible: () => this.activationService.isActive,
            isEnabled: () => this.activationService.isActive
        });
    }

    protected async openFileInWorkspace(file: string, initialContent: string): Promise<void> {
        const roots = this.workspaceService.tryGetRoots();
        if (roots.length < 1) {
            return;
        }
        const uri = roots[0].resource;
        const claudeSettingsUri = uri.resolve(file);
        if (! await this.fileService.exists(claudeSettingsUri)) {
            await this.fileService.write(claudeSettingsUri, initialContent, { encoding: 'utf8' });
        }
        this.editorManager.open(claudeSettingsUri);
    }
}
