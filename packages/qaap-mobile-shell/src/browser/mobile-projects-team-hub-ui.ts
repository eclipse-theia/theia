// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import {
    buildTeamTree,
    type WorkHubTeamMember,
} from '../common/qaap-work-hub-team';
import {
    appendSubtitleMetaPart,
    createAgentMetaBadge,
    createAgentRowAvatar,
} from './qaap-agent-ui';

export interface WorkHubApprovalItem {
    readonly member: WorkHubTeamMember;
    readonly hint?: string;
    readonly approvalId?: string;
    readonly summary?: string;
    readonly detail?: string;
}

export interface MobileProjectsTeamHubUiDeps {
    resolveAgentLabel(agentId: string): string;
    onMemberClick(member: WorkHubTeamMember): void;
    onOpenWorkflows?(): void;
    onEnableAutoApprove?(member: WorkHubTeamMember): void;
    onApproveRequest?(approvalId: string, member: WorkHubTeamMember): void;
    onRejectRequest?(approvalId: string, member: WorkHubTeamMember): void;
}

export interface MobileProjectsTeamHubRenderOptions {
    readonly searchQuery?: string;
    readonly approvals?: readonly WorkHubApprovalItem[];
    /** When true, omit standalone empty states (used inside the Tasks hub). */
    readonly embedded?: boolean;
}

/** Work Hub Team tab — active leaders and subtasks spawned via qaap-task. */
export class MobileProjectsTeamHubUi {

    constructor(protected readonly deps: MobileProjectsTeamHubUiDeps) { }

    renderDashboard(host: HTMLElement, members: readonly WorkHubTeamMember[], options: MobileProjectsTeamHubRenderOptions = {}): void {
        host.replaceChildren();
        this.renderSections(host, members, options);
    }

    /** Renders team/approval rows into `host`. Returns false when embedded and there is nothing to show. */
    renderSections(host: HTMLElement, members: readonly WorkHubTeamMember[], options: MobileProjectsTeamHubRenderOptions = {}): boolean {
        const hasQuery = !!options.searchQuery?.trim();
        const approvals = options.approvals ?? [];
        if (members.length === 0 && approvals.length === 0) {
            if (options.embedded) {
                return false;
            }
            host.append(hasQuery ? this.createSearchEmptyState() : this.createEmptyState());
            return true;
        }
        const tree = buildTeamTree(members);
        const list = document.createElement('div');
        list.className = 'theia-mobile-hub-team';
        if (approvals.length > 0) {
            list.append(this.createApprovalSection(approvals));
        }
        if (tree.roots.length > 0) {
            const head = document.createElement('div');
            head.className = 'theia-mobile-hub-team-section-head';
            const label = document.createElement('span');
            label.className = 'theia-mobile-hub-team-section-label';
            label.textContent = nls.localize('qaap/mobileProjects/teamSectionActive', 'In progress');
            const count = document.createElement('span');
            count.className = 'theia-mobile-hub-team-section-count';
            count.textContent = String(tree.roots.length);
            head.append(label, count);
            list.append(head);
            for (const root of tree.roots) {
                list.append(this.createMemberRow(root, false));
                const children = tree.childrenByParent.get(root.id) ?? [];
                for (const child of children) {
                    list.append(this.createMemberRow(child, true));
                }
            }
        }
        host.append(list);
        if (!options.embedded && this.deps.onOpenWorkflows) {
            host.append(this.createWorkflowsLink());
        }
        return true;
    }

    protected createEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty theia-mod-team-empty';
        const title = document.createElement('div');
        title.className = 'theia-mobile-projects-empty-title';
        title.textContent = nls.localize('qaap/mobileProjects/teamEmpty', 'No agents working');
        const body = document.createElement('div');
        body.className = 'theia-mobile-projects-empty-body';
        body.textContent = nls.localize(
            'qaap/mobileProjects/teamEmptyBody',
            'Start a chat with @qaiq or @codex — leaders can delegate sub-tasks with qaap-task.',
        );
        empty.append(title, body);
        if (this.deps.onOpenWorkflows) {
            empty.append(this.createWorkflowsLink());
        }
        return empty;
    }

    protected createSearchEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty theia-mod-team-empty';
        const title = document.createElement('div');
        title.className = 'theia-mobile-projects-empty-title';
        title.textContent = nls.localize('qaap/mobileProjects/teamSearchEmpty', 'No matching agents');
        const body = document.createElement('div');
        body.className = 'theia-mobile-projects-empty-body';
        body.textContent = nls.localize(
            'qaap/mobileProjects/teamSearchEmptyBody',
            'Try another project name, agent, or task title.',
        );
        empty.append(title, body);
        return empty;
    }

    protected createApprovalSection(items: readonly WorkHubApprovalItem[]): HTMLElement {
        const section = document.createElement('section');
        section.className = 'theia-mobile-hub-team-approvals';
        const head = document.createElement('div');
        head.className = 'theia-mobile-hub-team-section-head';
        const label = document.createElement('span');
        label.className = 'theia-mobile-hub-team-section-label';
        label.textContent = nls.localize('qaap/mobileProjects/teamSectionNeedsYou', 'They need you');
        const count = document.createElement('span');
        count.className = 'theia-mobile-hub-team-section-count theia-mod-warn';
        count.textContent = String(items.length);
        head.append(label, count);
        section.append(head);
        for (const item of items) {
            section.append(this.createApprovalRow(item));
        }
        return section;
    }

    protected createApprovalRow(item: WorkHubApprovalItem): HTMLElement {
        const member = item.member;
        const agentLabel = this.deps.resolveAgentLabel(member.agentId);
        const row = document.createElement('article');
        row.className = 'theia-mobile-hub-team-approval';
        const header = document.createElement('div');
        header.className = 'theia-mobile-hub-team-approval-head';
        header.append(createAgentRowAvatar({
            agentId: member.agentId,
            state: member.state === 'failed' ? 'failed' : 'streaming',
        }));
        const titleWrap = document.createElement('div');
        titleWrap.className = 'theia-mobile-hub-team-approval-title-wrap';
        const title = document.createElement('div');
        title.className = 'theia-mobile-hub-team-approval-title';
        title.textContent = agentLabel;
        const subtitle = document.createElement('div');
        subtitle.className = 'theia-mobile-hub-team-approval-subtitle';
        subtitle.textContent = item.summary ?? member.title;
        titleWrap.append(title, subtitle);
        header.append(titleWrap);
        row.append(header);
        if (item.detail) {
            const detail = document.createElement('div');
            detail.className = 'theia-mobile-hub-team-approval-detail';
            detail.textContent = item.detail;
            row.append(detail);
        } else if (item.summary) {
            const detail = document.createElement('div');
            detail.className = 'theia-mobile-hub-team-approval-detail';
            detail.textContent = item.summary;
            row.append(detail);
        }
        if (item.hint) {
            const hint = document.createElement('div');
            hint.className = 'theia-mobile-hub-team-approval-hint';
            hint.textContent = item.hint;
            row.append(hint);
        }
        const actions = document.createElement('div');
        actions.className = 'theia-mobile-hub-team-approval-actions';
        if (item.approvalId && this.deps.onApproveRequest && this.deps.onRejectRequest) {
            const approve = document.createElement('button');
            approve.type = 'button';
            approve.className = 'theia-mobile-hub-team-approval-approve';
            approve.textContent = nls.localize('qaap/mobileProjects/teamApprovalApprove', 'Approve');
            approve.addEventListener('click', () => this.deps.onApproveRequest?.(item.approvalId!, member));
            const reject = document.createElement('button');
            reject.type = 'button';
            reject.className = 'theia-mobile-hub-team-approval-reject';
            reject.textContent = nls.localize('qaap/mobileProjects/teamApprovalReject', 'Reject');
            reject.addEventListener('click', () => this.deps.onRejectRequest?.(item.approvalId!, member));
            actions.append(approve, reject);
        } else if (this.deps.onEnableAutoApprove) {
            const approve = document.createElement('button');
            approve.type = 'button';
            approve.className = 'theia-mobile-hub-team-approval-approve';
            approve.textContent = nls.localize('qaap/mobileProjects/teamApprovalEnableYolo', 'Enable YOLO');
            approve.addEventListener('click', () => this.deps.onEnableAutoApprove?.(member));
            actions.append(approve);
        }
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'theia-mobile-hub-team-approval-open';
        open.textContent = nls.localize('qaap/mobileProjects/teamApprovalOpen', 'Open');
        open.addEventListener('click', () => this.deps.onMemberClick(member));
        actions.append(open);
        row.append(actions);
        return row;
    }

    protected createWorkflowsLink(): HTMLElement {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'theia-mobile-hub-team-workflows-link';
        link.textContent = nls.localize('qaap/mobileProjects/teamOpenWorkflows', 'Browse agent workflows');
        link.addEventListener('click', () => this.deps.onOpenWorkflows?.());
        return link;
    }

    protected createMemberRow(member: WorkHubTeamMember, nested: boolean): HTMLElement {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `theia-mobile-hub-team-row${nested ? ' theia-mod-nested' : ''}`;
        const agentLabel = this.deps.resolveAgentLabel(member.agentId);
        row.setAttribute(
            'aria-label',
            nested
                ? nls.localize('qaap/mobileProjects/teamRowSubtaskAria', 'Subtask {0} · {1}', member.title, agentLabel)
                : nls.localize('qaap/mobileProjects/teamRowLeaderAria', '{0} · {1}', member.title, agentLabel),
        );
        const avatar = createAgentRowAvatar({
            agentId: member.agentId,
            state: this.resolveAvatarState(member.state),
            nested,
        });
        const body = document.createElement('div');
        body.className = 'theia-mobile-hub-team-body';
        const titleRow = document.createElement('div');
        titleRow.className = 'theia-mobile-hub-team-title-row';
        const title = document.createElement('span');
        title.className = 'theia-mobile-hub-team-title';
        title.textContent = member.title;
        const since = document.createElement('span');
        since.className = 'theia-mobile-hub-team-since';
        since.textContent = this.formatProgress(member);
        titleRow.append(title, since);
        const subtitle = document.createElement('div');
        subtitle.className = 'theia-mobile-hub-team-subtitle';
        appendSubtitleMetaPart(subtitle, member.projectName);
        appendSubtitleMetaPart(subtitle, createAgentMetaBadge(member.agentId, agentLabel));
        if (nested) {
            appendSubtitleMetaPart(subtitle, nls.localize('qaap/mobileProjects/teamSubtaskLabel', 'Subtask'));
        } else if (member.childCount > 0) {
            appendSubtitleMetaPart(subtitle, nls.localize('qaap/mobileProjects/teamChildCount', '{0} subtasks', String(member.childCount)));
        }
        if (member.activityLabel) {
            appendSubtitleMetaPart(subtitle, member.activityLabel);
        }
        body.append(titleRow, subtitle);
        if (member.progressTotal && member.progressCurrent !== undefined) {
            body.append(this.createProgressBar(member.progressCurrent, member.progressTotal));
        } else if (member.linesAdded !== undefined || member.linesRemoved !== undefined) {
            const diff = document.createElement('div');
            diff.className = 'theia-mobile-hub-team-diff';
            const added = member.linesAdded ?? 0;
            const removed = member.linesRemoved ?? 0;
            diff.textContent = nls.localize(
                'qaap/mobileProjects/teamDiffStats',
                '+{0} −{1}',
                String(added),
                String(removed),
            );
            body.append(diff);
        }
        row.append(avatar, body);
        row.addEventListener('click', () => this.deps.onMemberClick(member));
        return row;
    }

    protected resolveAvatarState(state: string): 'running' | 'streaming' | 'failed' | 'idle' {
        if (state === 'running' || state === 'streaming') {
            return state;
        }
        if (state === 'failed') {
            return 'failed';
        }
        return 'idle';
    }

    protected createProgressBar(current: number, total: number): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-hub-team-prog';
        wrap.setAttribute('role', 'progressbar');
        wrap.setAttribute('aria-valuemin', '0');
        wrap.setAttribute('aria-valuemax', String(total));
        wrap.setAttribute('aria-valuenow', String(current));
        const bar = document.createElement('i');
        const ratio = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0;
        bar.style.width = `${Math.round(ratio * 100)}%`;
        wrap.append(bar);
        return wrap;
    }

    protected formatProgress(member: WorkHubTeamMember): string {
        if (member.progressTotal && member.progressCurrent !== undefined) {
            return `${member.progressCurrent}/${member.progressTotal}`;
        }
        return this.stateLabel(member.state);
    }

    protected stateLabel(state: string): string {
        switch (state) {
            case 'running':
                return nls.localize('qaap/mobileProjects/teamStateRunning', 'Running');
            case 'streaming':
                return nls.localize('qaap/mobileProjects/teamStateStreaming', 'Working');
            case 'failed':
                return nls.localize('qaap/mobileProjects/teamStateFailed', 'Failed');
            default:
                return state;
        }
    }
}
