// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    countRunningTeamMembers,
    filterTeamMembersForDisplay,
    type WorkHubTeamMember,
} from '../common/qaap-work-hub-team';
import { fetchAgentApprovals, type QaapAgentApprovalRequestDTO } from '../common/qaap-agent-approval-client';
import { type WorkHubApprovalItem } from './mobile-projects-team-hub-ui';

/** Panel surface for Tasks hub approval polling and attention badges. */
export interface MobileProjectsTasksHubAttentionHost {
    query: string;
    visible: boolean;
    agentApprovalsFetchGeneration: number;
    cachedAgentApprovals: QaapAgentApprovalRequestDTO[];

    collectTeamMembersForHub(): WorkHubTeamMember[];
    collectTeamApprovalItems(members: readonly WorkHubTeamMember[]): WorkHubApprovalItem[];
    isTasksHubView(): boolean;
    isHomeHubView(): boolean;
    renderList(): void;
    updateTasksAttentionChrome(): void;
    renderSubtitle(): void;
}

export class MobileProjectsTasksHubAttentionUi {
    constructor(protected readonly host: MobileProjectsTasksHubAttentionHost) { }

    countTasksAttention(): { needsYou: number; running: number } {
        const members = this.host.collectTeamMembersForHub();
        const approvals = this.host.collectTeamApprovalItems(members);
        return {
            needsYou: approvals.length,
            running: countRunningTeamMembers(members),
        };
    }

    refreshTasksHubApprovals(forceRender = true): void {
        const generation = ++this.host.agentApprovalsFetchGeneration;
        void fetchAgentApprovals().then(approvals => {
            if (generation !== this.host.agentApprovalsFetchGeneration || !this.host.visible
                || (!this.host.isTasksHubView() && !this.host.isHomeHubView())) {
                return;
            }
            this.host.cachedAgentApprovals = approvals;
            if (forceRender) {
                this.host.renderList();
            } else if (this.host.isHomeHubView()) {
                this.host.renderList();
            } else {
                this.host.updateTasksAttentionChrome();
                this.host.renderSubtitle();
            }
        }).catch(() => {
            if (generation !== this.host.agentApprovalsFetchGeneration || !this.host.visible
                || (!this.host.isTasksHubView() && !this.host.isHomeHubView())) {
                return;
            }
            this.host.cachedAgentApprovals = [];
            if (forceRender) {
                this.host.renderList();
            } else if (this.host.isHomeHubView()) {
                this.host.renderList();
            } else {
                this.host.updateTasksAttentionChrome();
                this.host.renderSubtitle();
            }
        });
    }

    getFilteredTeamHubState(): {
        members: WorkHubTeamMember[];
        filteredApprovals: WorkHubApprovalItem[];
    } {
        const all = this.host.collectTeamMembersForHub();
        const approvals = this.host.collectTeamApprovalItems(all);
        const approvalIds = new Set(approvals.map(item => item.member.id));
        const members = filterTeamMembersForDisplay(
            all.filter(member => !approvalIds.has(member.id)),
            this.host.query,
        );
        const filteredApprovals = approvals.filter(item => {
            if (!this.host.query.trim()) {
                return true;
            }
            const q = this.host.query.trim().toLowerCase();
            return item.member.title.toLowerCase().includes(q)
                || item.member.projectName.toLowerCase().includes(q)
                || item.member.agentId.toLowerCase().includes(q)
                || (item.summary?.toLowerCase().includes(q) ?? false);
        });
        return { members, filteredApprovals };
    }
}
