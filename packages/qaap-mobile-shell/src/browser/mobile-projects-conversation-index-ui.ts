// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { ChatService } from '@theia/ai-chat';
import type { QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import { filterVpsTaskSummaries } from '../common/qaap-work-hub-surfaces';
import type { MobileProjectsActiveTasks, MobileProjectTaskView } from './mobile-projects-active-tasks';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsConversationFlags } from './mobile-projects-conversation-flags';

/** Panel surface for per-project conversation queries and task counters. */
export interface MobileProjectsConversationIndexHost {
    chatService: ChatService | undefined;
    conversationFlags: MobileProjectsConversationFlags | undefined;
    preparedCwdByProjectId: Map<string, string>;
    projectsService: MobileProjectsService;
    conversations: MobileProjectsConversations | undefined;
    activeTasks: MobileProjectsActiveTasks | undefined;
    chatServiceSessionSummariesByProjectId: Map<string, QaapAgentConversationSummaryDTO[]>;

    chatServiceSummariesUi: import('./mobile-projects-chat-service-summaries-ui').MobileProjectsChatServiceSummariesUi;
}

/** Conversation list queries, ordering, flags, and legacy task-view projection. */
export class MobileProjectsConversationIndexUi {

    constructor(protected readonly host: MobileProjectsConversationIndexHost) { }

    activeInfoForProject(project: MobileProjectEntry): ReturnType<MobileProjectsActiveTasks['getForCwd']> {
        const cwd = this.host.projectsService.getProjectCwd(project);
        return cwd && this.host.activeTasks ? this.host.activeTasks.getForCwd(cwd) : undefined;
    }

    isProjectRunning(project: MobileProjectEntry): boolean {
        return this.countRunningTasks(project) > 0;
    }

    countRunningTasks(project: MobileProjectEntry): number {
        return this.vpsTasksForProject(project).filter(c => c.status === 'streaming').length;
    }

    /** VPS agent conversations/tasks for one project (excludes local Theia chat). */
    vpsTasksForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[] {
        return filterVpsTaskSummaries(this.conversationsForProject(project));
    }

    /**
     * Local Theia chat sessions. The Chat surface was removed from the mobile shell, so these are
     * hidden from every list, counter, and recents row — only agentic VPS tasks are surfaced.
     */
    localChatsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[] {
        void project;
        return [];
    }

    countDoneTasks(project: MobileProjectEntry): number {
        return this.vpsTasksForProject(project).filter(c => c.status === 'idle' && c.messageCount > 0).length;
    }

    countNeedsInputTasks(project: MobileProjectEntry): number {
        return this.vpsTasksForProject(project).filter(c => {
            const session = c.sessionId ? this.host.chatService?.getSession(c.sessionId) : undefined;
            return !!session && this.host.chatServiceSummariesUi.isChatSessionWaitingForInput(session);
        }).length;
    }

    countFailedTasks(project: MobileProjectEntry): number {
        return this.vpsTasksForProject(project).filter(c => c.status === 'failed').length;
    }

    countUnreadTasks(project: MobileProjectEntry): number {
        if (!this.host.conversationFlags) {
            return 0;
        }
        return this.vpsTasksForProject(project).filter(c => this.isConversationUnread(c)).length;
    }

    /**
     * A conversation is "unread" when the agent has produced new activity since the user last
     * opened it. Conversations the user has never opened only count as unread if their last
     * message is from the agent — otherwise the row would render as a permanent badge.
     */
    isConversationUnread(summary: QaapAgentConversationSummaryDTO): boolean {
        if (!this.host.conversationFlags) {
            return false;
        }
        if (summary.lastMessageRole !== 'agent' || !summary.messageCount) {
            return false;
        }
        const lastSeen = this.host.conversationFlags.getLastSeen(summary.id);
        return summary.updatedAt > lastSeen;
    }

    /** All persistent agent conversations the panel knows about for this project. */
    conversationsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[] {
        const directChatSessions = this.host.chatServiceSessionSummariesByProjectId.get(project.id) ?? [];
        if (!this.host.conversations) {
            return directChatSessions;
        }
        const cwd = this.host.preparedCwdByProjectId.get(project.id)
            ?? this.host.projectsService.getProjectCwd(project);
        let list = cwd ? this.host.conversations.getConversationsForCwd(cwd) : [];
        if (list.length === 0) {
            list = this.host.conversations.findConversationsForProject(project);
        }
        // Parallel-run variants live in a tmpdir worktree but belong to this repo (parallelBaseCwd).
        const variants = cwd ? this.host.conversations.getVariantsForBaseCwd(cwd) : [];
        return this.mergeConversationSummaries(directChatSessions, [...list, ...variants]);
    }

    mergeConversationSummaries(
        first: QaapAgentConversationSummaryDTO[],
        second: QaapAgentConversationSummaryDTO[],
    ): QaapAgentConversationSummaryDTO[] {
        const byId = new Map<string, QaapAgentConversationSummaryDTO>();
        const bySessionId = new Map<string, string>();
        for (const item of [...first, ...second]) {
            if (item.sessionId) {
                const existingId = bySessionId.get(item.sessionId);
                if (existingId) {
                    const existing = byId.get(existingId);
                    if (existing) {
                        byId.set(existingId, this.preferConversationSummary(existing, item));
                    }
                    continue;
                }
                bySessionId.set(item.sessionId, item.id);
            }
            byId.set(item.id, item);
        }
        return [...byId.values()].sort((a, b) => this.compareConversationOrder(a, b));
    }

    /**
     * Order conversations within a project card. Highest first: priority chats (and never paused),
     * then streaming chats, then idle chats, then paused chats sink to the bottom. Within each tier
     * the more recently updated one wins.
     */
    compareConversationOrder(
        a: QaapAgentConversationSummaryDTO,
        b: QaapAgentConversationSummaryDTO,
    ): number {
        const fa = this.resolveConversationFlags(a);
        const fb = this.resolveConversationFlags(b);
        const aPriority = fa.priority && !fa.paused ? 1 : 0;
        const bPriority = fb.priority && !fb.paused ? 1 : 0;
        if (aPriority !== bPriority) {
            return bPriority - aPriority;
        }
        const aPaused = fa.paused ? 1 : 0;
        const bPaused = fb.paused ? 1 : 0;
        if (aPaused !== bPaused) {
            return aPaused - bPaused;
        }
        const aStreaming = a.status === 'streaming' ? 1 : 0;
        const bStreaming = b.status === 'streaming' ? 1 : 0;
        if (aStreaming !== bStreaming) {
            return bStreaming - aStreaming;
        }
        return b.updatedAt - a.updatedAt;
    }

    /**
     * Position of a conversation in the fork tree:
     *   'none'   — no fork relationship
     *   'parent' — at least one other conversation was forked from this one
     *   'child'  — this conversation was forked from another
     *   'both'   — both of the above (forked in and out)
     */
    resolveConversationLineage(
        summary: QaapAgentConversationSummaryDTO,
        parentIds: ReadonlySet<string>,
    ): 'none' | 'parent' | 'child' | 'both' {
        const isChild = !!summary.forkedFromId;
        const isParent = parentIds.has(summary.id);
        if (isParent && isChild) {
            return 'both';
        }
        if (isParent) {
            return 'parent';
        }
        if (isChild) {
            return 'child';
        }
        return 'none';
    }

    /**
     * Effective priority/paused state for a conversation. VPS-backed conversations carry the
     * flags on the summary itself; Theia-chat summaries pick them up from the local override store.
     */
    resolveConversationFlags(summary: QaapAgentConversationSummaryDTO): { priority: boolean; paused: boolean } {
        if (summary.source === 'theia-chat' && this.host.conversationFlags) {
            const overrides = this.host.conversationFlags.get(summary.id);
            return {
                priority: !!(summary.priority || overrides.priority),
                paused: !!(summary.paused || overrides.paused),
            };
        }
        return { priority: !!summary.priority, paused: !!summary.paused };
    }

    preferConversationSummary(
        current: QaapAgentConversationSummaryDTO,
        next: QaapAgentConversationSummaryDTO,
    ): QaapAgentConversationSummaryDTO {
        if (current.status !== 'streaming' && next.status === 'streaming') {
            return { ...next, id: current.id };
        }
        if (current.id.startsWith('theia-chat-service:')) {
            return {
                ...current,
                title: current.title || next.title,
                messageCount: Math.max(current.messageCount, next.messageCount),
                updatedAt: Math.max(current.updatedAt, next.updatedAt),
                lastMessagePreview: current.lastMessagePreview ?? next.lastMessagePreview,
            };
        }
        return next.updatedAt > current.updatedAt ? next : current;
    }

    summaryToTaskView(conversation: QaapAgentConversationSummaryDTO): MobileProjectTaskView {
        return {
            id: conversation.id,
            title: conversation.title,
            command: conversation.lastMessagePreview ?? '',
            cwd: conversation.cwd,
            state: this.conversationTaskState(conversation),
            createdAt: conversation.createdAt,
            finishedAt: conversation.status !== 'streaming' ? conversation.updatedAt : undefined,
        };
    }

    tasksForProject(project: MobileProjectEntry): MobileProjectTaskView[] {
        const conversations = this.conversationsForProject(project);
        if (conversations.length === 0) {
            return this.fallbackTasksFromProject(project);
        }
        return conversations.map(c => this.summaryToTaskView(c));
    }

    conversationTaskState(conversation: QaapAgentConversationSummaryDTO): string {
        const session = conversation.sessionId ? this.host.chatService?.getSession(conversation.sessionId) : undefined;
        if (session && this.host.chatServiceSummariesUi.isChatSessionWaitingForInput(session)) {
            return 'needs-input';
        }
        if (conversation.status === 'streaming' || (session && this.host.chatServiceSummariesUi.isChatSessionWorking(session))) {
            return 'running';
        }
        if (conversation.status === 'failed') {
            return 'failed';
        }
        return 'completed';
    }

    fallbackTasksFromProject(project: MobileProjectEntry): MobileProjectTaskView[] {
        const activeInfo = this.activeInfoForProject(project);
        if (!activeInfo?.taskId && project.status !== 'working') {
            return [];
        }
        const title = activeInfo?.title
            ?? (project.status === 'working' && project.task && project.task !== '—' ? project.task : undefined);
        if (!title) {
            return [];
        }
        const cwd = this.host.preparedCwdByProjectId.get(project.id)
            ?? this.host.projectsService.getProjectCwd(project)
            ?? '';
        const isRunning = project.status === 'working' || !!activeInfo?.taskId;
        return [{
            id: activeInfo?.taskId ?? `fallback-${project.id}`,
            title: title ?? nls.localize('qaap/mobileProjects/taskRunning', 'Background task'),
            command: title ?? '',
            cwd,
            state: isRunning ? 'running' : 'completed',
            createdAt: Date.now(),
        }];
    }

}
