// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { SingleTextInputDialog } from '@theia/core/lib/browser/dialogs';
import { ChatRequestModel, ChatService, ChatSession } from '@theia/ai-chat';
import {
    cancelConversation,
    conversationToSummary,
    deleteConversation,
    forkConversation,
    isConversationAutoApproveEnabled,
    renameConversation,
    retryConversation,
    updateConversation,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import { MobileSnackbar } from './mobile-snackbar';
import type { MobileProjectsConversationFlags } from './mobile-projects-conversation-flags';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsTranscriptLiveUi } from './mobile-projects-transcript-live-ui';
import type { MobileProjectsTranscriptSheetUi } from './mobile-projects-transcript-sheet-ui';
import type { MobileWorkHubSessionsSidebar } from './mobile-work-hub-sessions-sidebar';
import type { MobileProjectEntry } from './mobile-projects-types';

/** Panel surface for task card menu actions (rename, fork, pause, cancel, delete, …). */
export interface MobileProjectsConversationActionsHost {
    messageService: MessageService | undefined;
    chatService: ChatService | undefined;
    conversationFlags: MobileProjectsConversationFlags | undefined;
    conversations: MobileProjectsConversations | undefined;
    projects: MobileProjectEntry[];
    sessionsSidebar: MobileWorkHubSessionsSidebar | undefined;
    transcriptAutoApproveBusy: boolean;

    closeCardMenu(): void;
    renderList(): void;
    transcriptSheetUi: MobileProjectsTranscriptSheetUi;
    getOrRestoreProjectChatSession(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<ChatSession | undefined>;
    applyTaskStartedToProject(cwd: string, title: string, taskId: string): void;
    isWatchingOpenTranscript(conversationId: string): boolean;
    transcriptLiveUi: MobileProjectsTranscriptLiveUi;
    resolveActiveTranscriptChatHost(): HTMLElement | undefined;
}

/** Task card actions invoked from project lists and the sessions sidebar. */
export class MobileProjectsConversationActionsUi {

    constructor(protected readonly host: MobileProjectsConversationActionsHost) { }

    async onForkConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.host.closeCardMenu();
        try {
            const full = await forkConversation(summary.id);
            const forked = conversationToSummary(full);
            this.host.conversations?.recordSnapshot(forked);
            this.host.renderList();
            await this.host.transcriptSheetUi.openTranscriptSheet(project, forked);
        } catch (error) {
            this.host.messageService?.error(nls.localize(
                'qaap/mobileProjects/forkTaskFailed',
                'Could not fork task: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    async onRenameConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.host.closeCardMenu();
        if (summary.source === 'theia-chat' && (!summary.sessionId || !this.host.chatService)) {
            return;
        }
        const dialog = new SingleTextInputDialog({
            title: nls.localize('qaap/mobileProjects/renameTaskDialog', 'Rename task'),
            initialValue: summary.title,
            placeholder: nls.localize('qaap/mobileProjects/renameTaskPlaceholder', 'Task name'),
            validate: (value, mode) => {
                if (mode !== 'preview' && !value.trim()) {
                    return nls.localize('qaap/mobileProjects/renameTaskRequired', 'Enter a task name');
                }
                return true;
            },
        });
        const value = await dialog.open();
        const title = value?.trim();
        if (!title || title === summary.title) {
            return;
        }
        try {
            if (summary.source === 'theia-chat') {
                await this.host.getOrRestoreProjectChatSession(project, summary);
                await this.host.chatService!.renameSession(summary.sessionId!, title);
                await this.host.conversations?.refreshTheiaChatSessionsForProjects(this.host.projects);
            } else {
                const full = await renameConversation(summary.id, title);
                this.host.conversations?.recordSnapshot(conversationToSummary(full));
            }
            this.host.renderList();
        } catch (error) {
            this.host.messageService?.error(nls.localize(
                'qaap/mobileProjects/renameTaskFailed',
                'Could not rename task: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    async onSetConversationPriority(
        summary: QaapAgentConversationSummaryDTO,
        priority: boolean,
    ): Promise<void> {
        this.host.closeCardMenu();
        try {
            if (summary.source === 'theia-chat') {
                if (!this.host.conversationFlags) {
                    return;
                }
                this.host.conversationFlags.set(summary.id, { priority });
                this.host.conversations?.recordSnapshot({ ...summary, priority: priority || undefined });
            } else {
                const full = await updateConversation(summary.id, { priority });
                this.host.conversations?.recordSnapshot(conversationToSummary(full));
            }
            this.host.renderList();
            if (this.host.sessionsSidebar?.isVisible()) {
                this.host.sessionsSidebar.refreshList();
            }
        } catch (error) {
            this.host.messageService?.error(nls.localize(
                'qaap/mobileProjects/priorityFailed',
                'Could not update task priority: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    async onSetConversationPaused(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        paused: boolean,
    ): Promise<void> {
        this.host.closeCardMenu();
        try {
            if (paused && summary.status === 'streaming') {
                await this.onCancelConversation(project, summary);
            }
            if (summary.source === 'theia-chat') {
                if (!this.host.conversationFlags) {
                    return;
                }
                this.host.conversationFlags.set(summary.id, { paused });
                this.host.conversations?.recordSnapshot({ ...summary, paused: paused || undefined });
            } else {
                const full = await updateConversation(summary.id, { paused });
                this.host.conversations?.recordSnapshot(conversationToSummary(full));
            }
            this.host.renderList();
        } catch (error) {
            this.host.messageService?.error(nls.localize(
                'qaap/mobileProjects/pauseFailed',
                'Could not change task pause state: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    async toggleConversationAutoApproveById(conversationId: string): Promise<void> {
        const summary = this.host.conversations?.findSummaryById(conversationId);
        if (!summary || summary.source === 'theia-chat') {
            return;
        }
        await this.onSetConversationAutoApprove(summary, !isConversationAutoApproveEnabled(summary));
    }

    async onSetConversationAutoApprove(
        summary: QaapAgentConversationSummaryDTO,
        autoApprove: boolean,
    ): Promise<void> {
        if (this.host.transcriptAutoApproveBusy) {
            return;
        }
        this.host.closeCardMenu();
        this.host.transcriptAutoApproveBusy = true;
        try {
            const full = await updateConversation(summary.id, { autoApprove });
            const next = conversationToSummary(full);
            this.host.conversations?.recordSnapshot(next);
            this.host.renderList();
            MobileSnackbar.show(
                autoApprove
                    ? nls.localize('qaap/mobileProjects/taskAutoApproveEnabled', 'Auto-approve enabled for this task')
                    : nls.localize('qaap/mobileProjects/taskAutoApproveDisabled', 'Auto-approve disabled — tool calls may wait for approval'),
                { kind: 'success', duration: 2200 },
            );
        } catch (error) {
            this.host.messageService?.error(nls.localize(
                'qaap/mobileProjects/taskAutoApproveFailed',
                'Could not update auto-approve: {0}',
                error instanceof Error ? error.message : String(error),
            ));
        } finally {
            this.host.transcriptAutoApproveBusy = false;
        }
    }

    async onCancelConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.host.closeCardMenu();
        try {
            if (summary.source === 'theia-chat') {
                const session = await this.host.getOrRestoreProjectChatSession(project, summary);
                const request = [...(session?.model.getRequests() ?? [])]
                    .reverse()
                    .find(candidate => ChatRequestModel.isInProgress(candidate));
                if (session && request) {
                    await this.host.chatService?.cancelRequest(session.id, request.id);
                }
            } else {
                await cancelConversation(summary.id);
            }
        } catch (error) {
            this.host.messageService?.error(nls.localize(
                'qaap/mobileProjects/cancelTaskFailed',
                'Could not cancel run: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    async onRetryConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.host.closeCardMenu();
        try {
            const retried = await retryConversation(summary.id);
            this.host.conversations?.recordSnapshot(conversationToSummary(retried));
            const retriedTurn = [...retried.messages].reverse().find(message => message.role === 'user');
            this.host.applyTaskStartedToProject(retried.cwd, retriedTurn?.content ?? retried.title, retried.id);
            if (this.host.isWatchingOpenTranscript(summary.id)) {
                const chatHost = this.host.resolveActiveTranscriptChatHost();
                if (chatHost) {
                    this.host.transcriptLiveUi.scheduleTranscriptConversationRefresh(project, summary, chatHost);
                }
            }
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/taskRetried', 'Task restarted'),
                { kind: 'success', duration: 1400 }
            );
        } catch (error) {
            this.host.messageService?.error(nls.localize(
                'qaap/mobileProjects/retryTaskFailed',
                'Could not retry: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    async onDeleteConversation(summary: QaapAgentConversationSummaryDTO): Promise<void> {
        this.host.closeCardMenu();
        const confirmed = await new ConfirmDialog({
            title: nls.localize('qaap/mobileProjects/deleteTask', 'Delete task'),
            msg: nls.localize('qaap/mobileProjects/deleteTaskConfirm', 'Delete this task? This cannot be undone.'),
        }).open();
        if (!confirmed) {
            return;
        }
        try {
            if (summary.source === 'theia-chat') {
                if (!summary.sessionId || !this.host.chatService) {
                    return;
                }
                await this.host.chatService.deleteSession(summary.sessionId);
                this.host.conversations?.removeSnapshot(summary.id, summary.cwd, summary.source);
                await this.host.conversations?.refreshTheiaChatSessionsForProjects(this.host.projects);
            } else {
                await deleteConversation(summary.id);
                this.host.conversations?.removeSnapshot(summary.id, summary.cwd, summary.source);
            }
            this.host.transcriptSheetUi.closeTranscriptSheet();
            this.host.renderList();
        } catch (error) {
            this.host.messageService?.error(nls.localize(
                'qaap/mobileProjects/deleteTaskFailed',
                'Could not delete task: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }
}
