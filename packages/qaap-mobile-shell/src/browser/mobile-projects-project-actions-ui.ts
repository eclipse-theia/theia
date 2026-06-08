// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { ChatService } from '@theia/ai-chat';
import { deleteConversation, type QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry } from './mobile-projects-types';

/** Panel surface for repository card menu actions. */
export interface MobileProjectsProjectActionsHost {
    projects: MobileProjectEntry[];
    chatService: ChatService | undefined;
    conversations: MobileProjectsConversations | undefined;
    projectsService: MobileProjectsService;
    messageService: MessageService | undefined;
    delegate: { onProjectsChanged?: () => void };

    closeCardMenu(): void;
    transcriptSheetUi: import('./mobile-projects-transcript-sheet-ui').MobileProjectsTranscriptSheetUi;
    render(): void;
    renderList(): void;
    conversationsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    refreshChatServiceSessionSummaries(): Promise<void>;
}

/** Repository card actions: rename, duplicate, clear tasks, remove. */
export class MobileProjectsProjectActionsUi {

    constructor(protected readonly host: MobileProjectsProjectActionsHost) { }

    async onRenameProject(project: MobileProjectEntry): Promise<void> {
        this.host.closeCardMenu();
        const renamed = await this.host.projectsService.renameProject(project);
        if (!renamed) {
            return;
        }
        this.host.projects = await this.host.projectsService.loadProjects();
        this.host.render();
        this.host.delegate.onProjectsChanged?.();
    }

    async onDuplicateProject(project: MobileProjectEntry): Promise<void> {
        this.host.closeCardMenu();
        const duplicated = await this.host.projectsService.duplicateProject(project);
        if (!duplicated) {
            return;
        }
        this.host.projects = await this.host.projectsService.loadProjects();
        this.host.render();
        this.host.delegate.onProjectsChanged?.();
    }

    async onClearProjectChats(project: MobileProjectEntry): Promise<void> {
        this.host.closeCardMenu();
        const conversations = this.host.conversationsForProject(project);
        if (conversations.length === 0) {
            return;
        }
        const confirmed = await new ConfirmDialog({
            title: nls.localize('qaap/mobileProjects/clearAllTasks', 'Clear all tasks'),
            msg: nls.localize(
                'qaap/mobileProjects/clearAllTasksConfirm',
                'Clear all tasks for this project? This cannot be undone.'
            ),
        }).open();
        if (!confirmed) {
            return;
        }
        try {
            for (const summary of conversations) {
                if (summary.source === 'theia-chat') {
                    if (summary.sessionId && this.host.chatService) {
                        await this.host.chatService.deleteSession(summary.sessionId);
                        this.host.conversations?.removeSnapshot(summary.id, summary.cwd, summary.source);
                    }
                } else {
                    await deleteConversation(summary.id);
                    this.host.conversations?.removeSnapshot(summary.id, summary.cwd, summary.source);
                }
            }
            await this.host.conversations?.refreshTheiaChatSessionsForProjects(this.host.projects);
            this.host.transcriptSheetUi.closeTranscriptSheet();
            await this.host.refreshChatServiceSessionSummaries();
            this.host.renderList();
        } catch (error) {
            this.host.messageService?.error(nls.localize(
                'qaap/mobileProjects/clearAllTasksFailed',
                'Could not clear tasks: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    async onRemoveProject(project: MobileProjectEntry): Promise<void> {
        this.host.closeCardMenu();
        const removed = await this.host.projectsService.removeProject(project);
        if (!removed) {
            return;
        }
        this.host.projects = await this.host.projectsService.loadProjects();
        this.host.render();
        this.host.delegate.onProjectsChanged?.();
    }
}
