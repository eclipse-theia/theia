// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { ChatService, ChatSession, ChatSessionMetadata } from '@theia/ai-chat';
import type { QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry } from './mobile-projects-types';

export interface MobileProjectsChatServiceSummariesHost {
    chatServiceSessionSummariesByProjectId: Map<string, QaapAgentConversationSummaryDTO[]>;
    chatService: ChatService | undefined;
    projects: MobileProjectEntry[];
    expandedId: string | undefined;
    projectsService: MobileProjectsService;
    chatSessionProjectIds: Map<string, string>;

    trackChatServiceSessionModels(): void;
}

export class MobileProjectsChatServiceSummariesUi {
    constructor(protected readonly host: MobileProjectsChatServiceSummariesHost) { }

    async refreshChatServiceSessionSummaries(): Promise<void> {
        this.host.chatServiceSessionSummariesByProjectId.clear();
        if (!this.host.chatService) {
            return;
        }
        this.host.trackChatServiceSessionModels();
        let persisted: ChatSessionMetadata[] = [];
        try {
            persisted = Object.values(await this.host.chatService.getPersistedSessions());
        } catch {
            persisted = [];
        }
        const activeSessions = new Map(this.host.chatService.getSessions()
            .filter(session => !session.model.isEmpty())
            .map(session => [session.id, session]));
        const active = this.host.chatService.getSessions()
            .filter(session => !session.model.isEmpty())
            .map(session => ({
                sessionId: session.id,
                title: session.title ?? nls.localize('qaap/mobileProjects/untitledTask', 'Untitled task'),
                saveDate: session.lastInteraction?.getTime?.() ?? Date.now(),
                location: session.model.location,
            } satisfies ChatSessionMetadata));
        const byId = new Map<string, ChatSessionMetadata>();
        for (const session of [...persisted, ...active]) {
            byId.set(session.sessionId, session);
        }
        const sessions = [...byId.values()].sort((a, b) => b.saveDate - a.saveDate);
        if (sessions.length === 0) {
            return;
        }
        const currentName = this.host.projectsService.getCurrentWorkspaceName()?.toLowerCase();
        const currentCwd = this.host.projectsService.getCurrentWorkspaceCwd();
        const targetProject = this.host.projects.find(project =>
            project.isCurrent
            || this.host.projectsService.projectMatchesCurrentWorkspace(project)
            || (!!currentName && project.name.toLowerCase() === currentName)
            || (!!currentCwd && currentCwd.toLowerCase().endsWith(`/${project.name.toLowerCase()}`))
            || (!!project.github && !!currentCwd && currentCwd.toLowerCase().endsWith(`/${project.github.owner.toLowerCase()}/${project.github.name.toLowerCase()}`))
        ) ?? this.host.projects.find(project => project.id === this.host.expandedId);
        if (!targetProject) {
            return;
        }
        const cwd = this.host.projectsService.getProjectCwd(targetProject) ?? currentCwd ?? targetProject.name;
        for (const session of sessions) {
            const project = this.projectForChatSession(session.sessionId, targetProject);
            if (activeSessions.has(session.sessionId) && !this.host.chatSessionProjectIds.has(session.sessionId)) {
                this.rememberChatSessionProject(session.sessionId, project);
            }
            const projectCwd = this.host.projectsService.getProjectCwd(project) ?? cwd;
            const modelSession = activeSessions.get(session.sessionId);
            const summary: QaapAgentConversationSummaryDTO = {
                id: this.chatServiceConversationId(session.sessionId),
                source: 'theia-chat',
                cwd: projectCwd,
                workspacePath: projectCwd,
                sessionId: session.sessionId,
                agentId: modelSession?.pinnedAgent?.id ?? 'chat',
                title: modelSession?.title ?? session.title,
                status: modelSession && this.isChatSessionWorking(modelSession) ? 'streaming' : 'idle',
                createdAt: session.saveDate,
                updatedAt: modelSession?.lastInteraction?.getTime?.() ?? session.saveDate,
                messageCount: modelSession?.model.getRequests().length ?? 1,
                lastMessagePreview: this.chatSessionPreview(modelSession) ??
                    nls.localize('qaap/mobileProjects/workspaceChatPreview', 'Workspace chat'),
                lastMessageRole: 'user',
            };
            const existing = this.host.chatServiceSessionSummariesByProjectId.get(project.id) ?? [];
            existing.push(summary);
            this.host.chatServiceSessionSummariesByProjectId.set(project.id, existing);
        }
    }

    projectForChatSession(sessionId: string, fallback: MobileProjectEntry): MobileProjectEntry {
        const mappedId = this.host.chatSessionProjectIds.get(sessionId);
        if (mappedId) {
            return this.host.projects.find(project => project.id === mappedId) ?? fallback;
        }
        return fallback;
    }

    rememberChatSessionProject(sessionId: string | undefined, project: MobileProjectEntry): void {
        if (sessionId) {
            this.host.chatSessionProjectIds.set(sessionId, project.id);
        }
    }

    isChatSessionWorking(session: ChatSession): boolean {
        return session.model.getRequests().some(request =>
            !request.response.isComplete && !request.response.isCanceled
        );
    }

    isChatSessionWaitingForInput(session: ChatSession): boolean {
        return session.model.getRequests().some(request => request.response.isWaitingForInput);
    }

    chatSessionPreview(session: ChatSession | undefined): string | undefined {
        const request = session?.model.getRequests().at(-1);
        return request?.request.displayText?.trim() || request?.request.text?.trim();
    }

    chatServiceConversationId(sessionId: string): string {
        return `theia-chat-service:${encodeURIComponent(sessionId)}`;
    }

}
