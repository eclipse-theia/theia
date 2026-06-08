// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsExecutionSurfaceTabsUi } from './mobile-projects-execution-surface-tabs-ui';
import type { MobileProjectsTranscriptSheetUi } from './mobile-projects-transcript-sheet-ui';
import type { MobileProjectsConversationFlags } from './mobile-projects-conversation-flags';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectTaskView } from './mobile-projects-active-tasks';

export interface MobileProjectsConversationOpenHost {
    conversations: MobileProjectsConversations | undefined;
    conversationFlags: MobileProjectsConversationFlags | undefined;
    delegate: {
        onDismiss(): void;
        onOpenAgentOnTask?(project: MobileProjectEntry): void | Promise<void>;
    };

    conversationsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    closeCardMenu(): void;
    executionSurfaceTabsUi: MobileProjectsExecutionSurfaceTabsUi;
    transcriptSheetUi: MobileProjectsTranscriptSheetUi;
    hide(): void;
}

export class MobileProjectsConversationOpenUi {
    constructor(protected readonly host: MobileProjectsConversationOpenHost) { }

    async openTaskInAgent(project: MobileProjectEntry, task?: MobileProjectTaskView): Promise<void> {
        // Task ids now correspond to conversation ids — tap opens the transcript sheet in-place so
        // the user can read/continue the conversation without switching workspaces.
        if (task && this.host.conversations) {
            const summary = this.host.conversationsForProject(project).find(c => c.id === task.id);
            if (summary) {
                await this.openConversationSummary(project, summary);
                return;
            }
        }
        const entry = task ? { ...project, task: task.title } : project;
        this.host.hide();
        this.host.delegate.onDismiss();
        await this.host.delegate.onOpenAgentOnTask?.(entry);
    }

    async openConversationSummary(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.host.closeCardMenu();
        this.host.executionSurfaceTabsUi.setExecutionSurfaceTab(project, 'messages');
        // Opening a chat clears its unread badge — record the high-water mark before navigating so
        // the project glyph drops the "new replies" treatment on the next render.
        this.host.conversationFlags?.markRead(summary.id, summary.updatedAt);
        await this.host.transcriptSheetUi.openTranscriptSheet(project, summary);
    }

}
