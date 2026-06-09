// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import {
    collectAgentMembers,
    type WorkHubTeamMember,
} from '../common/qaap-work-hub-team';
import {
    isConversationAutoApproveEnabled,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import { type QaapAgentApprovalRequestDTO } from '../common/qaap-agent-approval-client';
import { cwdMatchesProject, type MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry, MobileProjectsHubView } from './mobile-projects-types';
import { type WorkHubApprovalItem } from './mobile-projects-team-hub-ui';

/** Panel surface for Team hub member/approval data and navigation. */
export interface MobileProjectsHubTeamDataHost {
    projects: MobileProjectEntry[];
    hubView: MobileProjectsHubView;
    cachedAgentApprovals: QaapAgentApprovalRequestDTO[];
    activeTasks: MobileProjectsActiveTasks | undefined;
    projectsService: MobileProjectsService;

    conversationsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    transcriptSheetUi: import('./mobile-projects-transcript-sheet-ui').MobileProjectsTranscriptSheetUi;
    showTaskLog(project: MobileProjectEntry, taskId: string): Promise<void>;
    openProjectDetail(project: MobileProjectEntry): Promise<void>;
    conversationIndexUi: import('./mobile-projects-conversation-index-ui').MobileProjectsConversationIndexUi
}

/** Collects Team hub members/approvals and handles member row navigation. */
export class MobileProjectsHubTeamDataUi {

    constructor(protected readonly host: MobileProjectsHubTeamDataHost) { }

    collectTeamMembersForHub(): WorkHubTeamMember[] {
        const conversations: Array<{
            projectId: string;
            projectName: string;
            cwd: string;
            id: string;
            agentId: string;
            title: string;
            status: QaapAgentConversationSummaryDTO['status'];
            paused?: boolean;
            activityLabel?: string;
            turnProgressCurrent?: number;
            turnProgressTotal?: number;
            linesAdded?: number;
            linesRemoved?: number;
            createdAt: number;
            updatedAt: number;
        }> = [];
        for (const project of this.host.projects) {
            for (const summary of this.host.conversationIndexUi.conversationsForProject(project)) {
                if (summary.source === 'theia-chat') {
                    continue;
                }
                conversations.push({
                    projectId: project.id,
                    projectName: project.name,
                    cwd: summary.cwd,
                    id: summary.id,
                    agentId: summary.agentId,
                    title: summary.title,
                    status: summary.status,
                    paused: summary.paused,
                    activityLabel: summary.activityLabel,
                    turnProgressCurrent: summary.turnProgressCurrent,
                    turnProgressTotal: summary.turnProgressTotal,
                    linesAdded: summary.linesAdded,
                    linesRemoved: summary.linesRemoved,
                    createdAt: summary.createdAt,
                    updatedAt: summary.updatedAt,
                });
            }
        }
        return collectAgentMembers({
            tasks: this.host.activeTasks?.getAllTasks() ?? [],
            conversations,
        }).map(member => ({
            ...member,
            projectId: member.projectId ?? this.resolveProjectIdForTeamMember(member),
        }));
    }

    collectTeamApprovalItems(members: readonly WorkHubTeamMember[]): WorkHubApprovalItem[] {
        const memberByConversationId = new Map<string, WorkHubTeamMember>();
        for (const member of members) {
            if (member.conversationId) {
                memberByConversationId.set(member.conversationId, member);
            }
        }
        const items: WorkHubApprovalItem[] = [];
        const seenConversationIds = new Set<string>();
        for (const approval of this.host.cachedAgentApprovals) {
            const member = memberByConversationId.get(approval.conversationId)
                ?? this.buildApprovalMemberFromRequest(approval, members);
            if (!member) {
                continue;
            }
            seenConversationIds.add(approval.conversationId);
            items.push({
                member,
                approvalId: approval.id,
                summary: approval.summary,
                detail: approval.detail,
            });
        }
        for (const member of members) {
            if (!member.conversationId || member.kind !== 'conversation' || seenConversationIds.has(member.conversationId)) {
                continue;
            }
            const project = this.resolveProjectForTeamMember(member);
            const summary = project
                ? this.host.conversationIndexUi.conversationsForProject(project).find(c => c.id === member.conversationId)
                : undefined;
            if (!summary || summary.source === 'theia-chat' || isConversationAutoApproveEnabled(summary)) {
                continue;
            }
            if (summary.status !== 'streaming' && summary.status !== 'idle') {
                continue;
            }
            items.push({
                member,
                hint: summary.status === 'streaming'
                    ? nls.localize(
                        'qaap/mobileProjects/teamApprovalHintStreaming',
                        'Manual tool approval — enable YOLO or approve on the VPS.',
                    )
                    : nls.localize(
                        'qaap/mobileProjects/teamApprovalHintIdle',
                        'Manual tool approval is on for this task.',
                    ),
            });
        }
        return items.sort((a, b) => b.member.updatedAt - a.member.updatedAt);
    }

    buildApprovalMemberFromRequest(
        approval: QaapAgentApprovalRequestDTO,
        members: readonly WorkHubTeamMember[],
    ): WorkHubTeamMember | undefined {
        const existing = members.find(member => member.conversationId === approval.conversationId);
        if (existing) {
            return existing;
        }
        const project = this.host.projects.find(p => {
            const cwd = this.host.projectsService.getProjectCwd(p);
            return cwd === approval.cwd;
        });
        return {
            id: `approval:${approval.conversationId}`,
            cwd: approval.cwd,
            agentId: approval.agentId,
            title: approval.conversationTitle,
            projectName: project?.name ?? approval.cwd.split('/').filter(Boolean).pop() ?? approval.cwd,
            projectId: project?.id,
            state: 'streaming',
            kind: 'conversation',
            conversationId: approval.conversationId,
            childCount: 0,
            createdAt: approval.createdAt,
            updatedAt: approval.createdAt,
        };
    }

    resolveProjectIdForTeamMember(member: WorkHubTeamMember): string | undefined {
        for (const project of this.host.projects) {
            const cwd = this.host.projectsService.getProjectCwd(project);
            if (cwd === member.cwd || cwdMatchesProject(member.cwd, project)) {
                return project.id;
            }
        }
        return undefined;
    }

    resolveProjectForTeamMember(member: WorkHubTeamMember): MobileProjectEntry | undefined {
        if (member.projectId) {
            return this.host.projects.find(p => p.id === member.projectId);
        }
        return this.host.projects.find(p => {
            const cwd = this.host.projectsService.getProjectCwd(p);
            return cwd === member.cwd || cwdMatchesProject(member.cwd, p);
        });
    }

    onTeamMemberClick(member: WorkHubTeamMember): void {
        if (member.conversationId) {
            const project = this.resolveProjectForTeamMember(member);
            const summary = project
                ? this.host.conversationIndexUi.conversationsForProject(project).find(c => c.id === member.conversationId)
                : undefined;
            if (project && summary) {
                void this.host.transcriptSheetUi.openTranscriptSheet(project, summary);
                return;
            }
        }
        if (member.taskId) {
            const project = this.resolveProjectForTeamMember(member);
            if (project) {
                void this.host.showTaskLog(project, member.taskId);
                return;
            }
        }
        const project = this.resolveProjectForTeamMember(member);
        if (project) {
            this.host.hubView = 'repos';
            this.host.projectsService.setHubView('repos');
            void this.host.openProjectDetail(project);
        }
    }
}
