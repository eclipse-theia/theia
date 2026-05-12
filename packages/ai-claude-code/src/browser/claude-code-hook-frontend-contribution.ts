// *****************************************************************************
// Copyright (C) 2026 Ericsson and Others.
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

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ILogger, MessageService } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AgentSessionHookData, AgentSessionHookRegistry } from '@theia/ai-core';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { URI } from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { OutputChannelManager } from '@theia/output/lib/browser/output-channel';

@injectable()
export class ClaudeCodeHookFrontendContribution implements FrontendApplicationContribution {

    @inject(AgentSessionHookRegistry)
    protected readonly hookRegistry: AgentSessionHookRegistry;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @postConstruct()
    protected init(): void {
        this.hookRegistry.onHookEvent(event => this.handleHookEvent(event));
    }

    async onStart(): Promise<void> {
        // Registration happens in @postConstruct
    }

    protected handleHookEvent(event: AgentSessionHookData): void {
        switch (event.event) {
            case 'PostToolUse':
                this.handlePostToolUse(event);
                break;
            case 'PostToolUseFailure':
                this.handlePostToolUseFailure(event);
                break;
            case 'PostToolBatch':
                this.handlePostToolBatch(event);
                break;
            case 'Notification':
                this.handleNotification(event);
                break;
            case 'PermissionRequest':
                this.handlePermissionRequest(event);
                break;
            case 'InstructionsLoaded':
                this.handleInstructionsLoaded(event);
                break;
            case 'ConfigChange':
                this.handleConfigChange(event);
                break;
            case 'PermissionDenied':
            case 'StopFailure':
            case 'Setup':
            case 'SubagentStart':
            case 'SubagentStop':
            case 'TaskCreated':
            case 'TaskCompleted':
            case 'TeammateIdle':
            case 'UserPromptExpansion':
            case 'CwdChanged':
            case 'FileChanged':
            case 'WorktreeCreate':
            case 'WorktreeRemove':
            case 'PreCompact':
            case 'PostCompact':
            case 'Elicitation':
            case 'ElicitationResult':
                this.handleGenericHookEvent(event);
                break;
        }
    }

    protected async handlePostToolUse(event: AgentSessionHookData): Promise<void> {
        const filePath = event.toolInput?.file_path as string | undefined;
        if (!filePath) {
            return;
        }
        await this.refreshFileInEditor(filePath);
    }

    protected handlePostToolUseFailure(event: AgentSessionHookData): void {
        const toolName = event.toolName || 'unknown tool';
        const error = event.payload?.error as string || 'unknown error';
        this.getHookOutputChannel().appendLine(`[PostToolUseFailure] ${toolName}: ${error}`);
    }

    protected async handlePostToolBatch(event: AgentSessionHookData): Promise<void> {
        // Refresh all files that were modified in this batch
        const toolResults = event.payload?.tool_results as Array<{ tool_name?: string; tool_input?: Record<string, unknown> }> | undefined;
        if (!toolResults) {
            return;
        }
        for (const result of toolResults) {
            if (['Write', 'Edit', 'MultiEdit'].includes(result.tool_name || '')) {
                const filePath = result.tool_input?.file_path as string | undefined;
                if (filePath) {
                    await this.refreshFileInEditor(filePath);
                }
            }
        }
    }

    protected handlePermissionRequest(event: AgentSessionHookData): void {
        const toolName = event.payload?.tool_name as string || 'unknown';
        this.getHookOutputChannel().appendLine(`[PermissionRequest] Tool: ${toolName}`);
    }

    protected handleInstructionsLoaded(event: AgentSessionHookData): void {
        const filePath = event.payload?.file_path as string || event.payload?.source as string || 'unknown';
        this.getHookOutputChannel().appendLine(`[InstructionsLoaded] ${filePath}`);
    }

    protected handleConfigChange(event: AgentSessionHookData): void {
        const source = event.payload?.source as string || 'unknown';
        this.getHookOutputChannel().appendLine(`[ConfigChange] Source: ${source}`);
    }

    protected handleGenericHookEvent(event: AgentSessionHookData): void {
        const detail = event.toolName || event.payload?.reason || event.payload?.agent_type || '';
        this.getHookOutputChannel().appendLine(`[${event.event}]${detail ? ' ' + detail : ''}`);
    }

    protected handleNotification(event: AgentSessionHookData): void {
        const message = event.payload?.message as string
            || event.payload?.title as string
            || 'Claude Code notification';
        this.messageService.info(message);
    }

    protected async refreshFileInEditor(filePath: string): Promise<void> {
        const roots = await this.workspaceService.roots;
        if (roots.length === 0) {
            return;
        }
        const rootUri = roots[0].resource;
        const fileUri = rootUri.resolve(filePath);
        for (const editor of this.editorManager.all) {
            if (editor.editor.uri.toString() === fileUri.toString()) {
                try {
                    await this.fileService.resolve(new URI(fileUri.toString()), { resolveMetadata: true });
                } catch { /* File may have been deleted */ }
                break;
            }
        }
    }

    protected getHookOutputChannel() {
        return this.outputChannelManager.getChannel('Claude Code Hooks');
    }
}
