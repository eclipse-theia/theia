// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { type QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import {
    QAAP_AGENTS_HUB_LANDING_ENABLED,
    QAAP_AGENTS_HUB_QUICK_ACTIONS,
    QAAP_AGENTS_HUB_RECENT_LIMIT,
} from '../common/qaap-agents-hub-landing';
import { type QaapComposerSurface } from '../common/qaap-composer-surface';
import { type WorkHubTeamMember } from '../common/qaap-work-hub-team';
import { type WorkHubApprovalItem } from './mobile-projects-team-hub-ui';
import { type MobileWorkHubInboxItem } from './mobile-work-hub-inbox';
import type { MobileProjectsActiveTasks, MobileProjectTaskView } from './mobile-projects-active-tasks';
import type { MobileProjectEntry } from './mobile-projects-types';

/** Panel surface for Tasks hub list rendering and Agents Hub landing recents/quick actions. */
export interface MobileProjectsTasksHubHost {
    homeMode: boolean;
    query: string;
    scroll: HTMLElement;
    tasksHubSurface: QaapComposerSurface;
    tasksFirstLoadPending: boolean;
    tasksFirstLoadFallback: number | undefined;
    visible: boolean;
    agentsHubShellActive: boolean;
    projects: MobileProjectEntry[];
    transcriptSheet: HTMLElement | undefined;
    transcriptComposerHost: HTMLElement | undefined;
    transcriptComposerDraft: string;
    stickyComposerDraft: string;
    stickyComposerHost: HTMLElement | undefined;
    titleAttentionEl: HTMLElement;

    shouldUseAgentsHubLanding(): boolean;
    isTasksHubView(): boolean;
    renderAgentsHubExecutionShell(): void;
    teardownAgentsHubExecutionShell(): void;
    localChatsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    vpsTasksForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    conversationMatchesQuery(summary: QaapAgentConversationSummaryDTO, query: string): boolean;
    transcriptMessagesUi: import('./mobile-projects-transcript-messages-ui').MobileProjectsTranscriptMessagesUi;
    transcriptStickyComposerUi: import('./mobile-projects-transcript-sticky-composer-ui').MobileProjectsTranscriptStickyComposerUi;
    stickyComposerRenderUi: import('./mobile-projects-sticky-composer-render-ui').MobileProjectsStickyComposerRenderUi;
    activeInfoForProject(project: MobileProjectEntry): ReturnType<MobileProjectsActiveTasks['getForCwd']>;
    summaryToTaskView(conversation: QaapAgentConversationSummaryDTO): MobileProjectTaskView;
    createTaskItem(
        project: MobileProjectEntry,
        task: MobileProjectTaskView,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
        summary?: QaapAgentConversationSummaryDTO,
        parentIds?: ReadonlySet<string>,
    ): HTMLElement;
    openWorkHubSessionsSidebar(): void;
    collectChatHubGroups(
        projects: MobileProjectEntry[],
    ): Array<{ project: MobileProjectEntry; summaries: QaapAgentConversationSummaryDTO[] }>;
    collectTasksInboxGroups(
        projects: MobileProjectEntry[],
    ): Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }>;
    createChatEmptyState(): HTMLElement;
    createInboxProjectGroup(project: MobileProjectEntry, items: MobileWorkHubInboxItem[]): HTMLElement;
    renderList(): void;
    getFilteredTeamHubState(): {
        members: WorkHubTeamMember[];
        filteredApprovals: WorkHubApprovalItem[];
    };
    countTasksAttention(): { needsYou: number; running: number };
    renderSubtitle(): void;
    ensureOverlayUi(): {
        teamHub: {
            renderSections(
                host: HTMLElement,
                members: WorkHubTeamMember[],
                options: {
                    searchQuery: string;
                    approvals: WorkHubApprovalItem[];
                    embedded: boolean;
                },
            ): boolean;
        };
    };
    conversationIndexUi: import('./mobile-projects-conversation-index-ui').MobileProjectsConversationIndexUi;
    hubQueryUi: import('./mobile-projects-hub-query-ui').MobileProjectsHubQueryUi;
    projectRowsUi: import('./mobile-projects-project-rows-ui').MobileProjectsProjectRowsUi;
}

/** Tasks hub inbox rendering and Agents Hub landing recents / quick-action prompts. */
export class MobileProjectsTasksHubUi {

    constructor(protected readonly host: MobileProjectsTasksHubHost) { }

    collectAgentsHubRecentItems(
        projects: MobileProjectEntry[],
        limit = QAAP_AGENTS_HUB_RECENT_LIMIT,
        scopeProject?: MobileProjectEntry,
    ): Array<{ project: MobileProjectEntry; summary: QaapAgentConversationSummaryDTO }> {
        const query = this.host.query.trim().toLowerCase();
        const entries: Array<{
            project: MobileProjectEntry;
            summary: QaapAgentConversationSummaryDTO;
            updatedAt: number;
        }> = [];
        const scope = scopeProject ? [scopeProject] : projects;
        for (const project of scope) {
            const conversations = [
                ...this.host.conversationIndexUi.localChatsForProject(project),
                ...this.host.conversationIndexUi.vpsTasksForProject(project),
            ];
            for (const summary of conversations) {
                if (query && !this.host.hubQueryUi.conversationMatchesQuery(summary, query)) {
                    continue;
                }
                entries.push({ project, summary, updatedAt: summary.updatedAt });
            }
        }
        entries.sort((a, b) => b.updatedAt - a.updatedAt);
        return entries.slice(0, Math.max(0, limit)).map(({ project, summary }) => ({ project, summary }));
    }

    shouldEmbedAgentsHubRecentsInWorkspaceTranscript(): boolean {
        return QAAP_AGENTS_HUB_LANDING_ENABLED
            && this.host.transcriptSheet?.parentElement === document.body
            && !document.body.classList.contains('theia-mobile-mod-landing');
    }

    createAgentsHubQuickActionsBlock(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'theia-mobile-agent-transcript-empty-actions';
        container.setAttribute('role', 'group');
        container.setAttribute(
            'aria-label',
            nls.localize('qaap/agentsHub/quickActions', 'Quick actions'),
        );
        for (const action of QAAP_AGENTS_HUB_QUICK_ACTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-agent-transcript-empty-action';
            const iconWrap = document.createElement('span');
            iconWrap.className = 'theia-mobile-agent-transcript-empty-action-icon';
            const icon = document.createElement('i');
            icon.className = `codicon codicon-${action.icon}`;
            icon.setAttribute('aria-hidden', 'true');
            iconWrap.append(icon);
            const label = document.createElement('span');
            label.className = 'theia-mobile-agent-transcript-empty-action-label';
            label.textContent = nls.localize(action.labelKey, action.labelDefault);
            btn.append(iconWrap, label);
            btn.addEventListener('click', () => {
                this.applyComposerQuickActionPrompt(nls.localize(action.promptKey, action.promptDefault));
            });
            container.append(btn);
        }
        return container;
    }

    applyComposerQuickActionPrompt(prompt: string): void {
        const trimmed = prompt.trim();
        if (!trimmed) {
            return;
        }
        if (this.host.transcriptComposerHost?.isConnected) {
            this.host.transcriptComposerDraft = trimmed;
            this.host.transcriptStickyComposerUi.remountTranscriptStickyComposer();
            this.host.transcriptMessagesUi.focusTranscriptComposerInput();
            return;
        }
        this.host.stickyComposerDraft = trimmed;
        this.host.stickyComposerRenderUi.renderStickyComposer();
        window.requestAnimationFrame(() => {
            const input = this.host.stickyComposerHost?.querySelector<HTMLTextAreaElement>(
                '.theia-mobile-projects-sticky-composer-input',
            );
            if (!input) {
                return;
            }
            input.focus();
            const end = input.value.length;
            input.setSelectionRange(end, end);
        });
    }

    createAgentsHubRecentsBlock(project: MobileProjectEntry): HTMLElement {
        const recents = this.collectAgentsHubRecentItems(this.host.projects, QAAP_AGENTS_HUB_RECENT_LIMIT, project);
        const block = document.createElement('section');
        block.className = 'theia-mobile-agents-hub-landing theia-mod-transcript-recents';
        if (recents.length === 0) {
            return block;
        }
        const head = document.createElement('div');
        head.className = 'theia-mobile-agents-hub-landing-section-head';
        const label = document.createElement('span');
        label.className = 'theia-mobile-agents-hub-landing-section-label q-overline';
        label.textContent = nls.localize('qaap/agentsHub/sessionsSection', 'Sessions');
        const count = document.createElement('span');
        count.className = 'theia-mobile-agents-hub-landing-section-count';
        count.textContent = String(recents.length);
        head.append(label, count);
        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-chats-list theia-mobile-agents-hub-landing-list';
        const parentIds = new Set<string>();
        for (const entry of recents) {
            if (entry.summary.forkedFromId) {
                parentIds.add(entry.summary.forkedFromId);
            }
        }
        const activeInfo = this.host.conversationIndexUi.activeInfoForProject(project);
        for (const { summary } of recents) {
            const task = this.host.conversationIndexUi.summaryToTaskView(summary);
            list.append(this.host.projectRowsUi.createTaskItem(project, task, activeInfo, summary, parentIds));
        }
        block.append(head, list);
        const viewAll = document.createElement('button');
        viewAll.type = 'button';
        viewAll.className = 'theia-mobile-agents-hub-landing-view-all';
        viewAll.textContent = nls.localize('qaap/agentsHub/viewAllSessions', 'View all sessions');
        viewAll.addEventListener('click', () => {
            this.host.openWorkHubSessionsSidebar();
        });
        block.append(viewAll);
        return block;
    }

    updateTasksAttentionChrome(): void {
        if (!this.host.homeMode || !this.host.hubQueryUi.isTasksHubView() || this.host.tasksHubSurface === 'chat' || this.host.shouldUseAgentsHubLanding()) {
            this.host.titleAttentionEl.hidden = true;
            this.host.titleAttentionEl.setAttribute('aria-hidden', 'true');
            return;
        }
        const { needsYou } = this.host.countTasksAttention();
        if (needsYou <= 0) {
            this.host.titleAttentionEl.hidden = true;
            this.host.titleAttentionEl.setAttribute('aria-hidden', 'true');
            return;
        }
        this.host.titleAttentionEl.hidden = false;
        this.host.titleAttentionEl.setAttribute('aria-hidden', 'false');
        this.host.titleAttentionEl.textContent = String(needsYou);
        this.host.titleAttentionEl.title = nls.localize(
            'qaap/mobileProjects/tasksAttentionTitle',
            '{0} tasks need your attention',
            String(needsYou),
        );
    }

    /** Flips the one-shot first-load flag once conversations arrive or the safety timeout fires. */
    markTasksFirstLoadComplete(render: boolean): void {
        if (this.host.tasksFirstLoadFallback !== undefined) {
            window.clearTimeout(this.host.tasksFirstLoadFallback);
            this.host.tasksFirstLoadFallback = undefined;
        }
        if (!this.host.tasksFirstLoadPending) {
            return;
        }
        this.host.tasksFirstLoadPending = false;
        if (render && this.host.visible && this.host.hubQueryUi.isTasksHubView()) {
            this.host.renderList();
        }
    }

    createTasksLoadingState(): HTMLElement {
        const list = document.createElement('div');
        list.className = 'theia-mobile-tasks-skeleton-list';
        list.setAttribute('aria-busy', 'true');
        list.setAttribute('aria-label', nls.localize('qaap/mobileProjects/tasksLoading', 'Loading tasks…'));
        for (let i = 0; i < 4; i++) {
            list.append(this.createTaskSkeletonRow());
        }
        return list;
    }

    createTaskSkeletonRow(): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-tasks-skeleton-row q-card';
        const avatar = document.createElement('div');
        avatar.className = 'q-skeleton theia-mobile-tasks-skeleton-avatar';
        const body = document.createElement('div');
        body.className = 'theia-mobile-tasks-skeleton-body';
        const title = document.createElement('div');
        title.className = 'q-skeleton q-skeleton-text theia-mobile-tasks-skeleton-title';
        const meta = document.createElement('div');
        meta.className = 'q-skeleton q-skeleton-text theia-mobile-tasks-skeleton-meta';
        body.append(title, meta);
        row.append(avatar, body);
        return row;
    }

    createTasksEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-server-process';
        const title = document.createElement('strong');
        title.textContent = this.host.query
            ? nls.localize('qaap/mobileProjects/noTasksSearchResults', 'No matching tasks')
            : nls.localize('qaap/mobileProjects/noTasks', 'No VPS tasks yet');
        const body = document.createElement('span');
        body.textContent = this.host.query
            ? nls.localize(
                'qaap/mobileProjects/noTasksSearchResultsBody',
                'Try a task title, agent name, or branch.',
            )
            : nls.localize(
                'qaap/mobileProjects/noTasksBody',
                'Delegate work from a project — it keeps running on the server when you close the app.',
            );
        empty.append(icon, title, body);
        return empty;
    }

    appendTasksHubTeamSection(container: HTMLElement): boolean {
        const { members, filteredApprovals } = this.host.getFilteredTeamHubState();
        const teamHost = document.createElement('div');
        teamHost.className = 'theia-mobile-hub-team-root theia-mod-embedded-in-tasks';
        const rendered = this.host.ensureOverlayUi().teamHub.renderSections(teamHost, members, {
            searchQuery: this.host.query,
            approvals: filteredApprovals,
            embedded: true,
        });
        if (rendered) {
            container.append(teamHost);
        }
        return rendered;
    }

    renderTasksHubView(projects: MobileProjectEntry[]): void {
        if (this.host.shouldUseAgentsHubLanding()) {
            void projects;
            this.host.renderAgentsHubExecutionShell();
            return;
        }
        if (this.host.agentsHubShellActive) {
            this.host.teardownAgentsHubExecutionShell();
        }
        const root = document.createElement('div');
        root.className = 'theia-mobile-tasks-hub-root';
        if (this.host.tasksHubSurface === 'chat') {
            const groups = this.host.collectChatHubGroups(projects);
            if (groups.length === 0) {
                root.append(this.host.createChatEmptyState());
            } else {
                const host = document.createElement('div');
                host.className = 'theia-mobile-projects-chats-inbox theia-mod-local-chat';
                for (const group of groups) {
                    const items: MobileWorkHubInboxItem[] = group.summaries.map(summary => ({
                        kind: 'conversation',
                        project: group.project,
                        summary,
                        sortAt: summary.updatedAt,
                        priority: 0,
                    }));
                    host.append(this.host.createInboxProjectGroup(group.project, items));
                }
                root.append(host);
            }
            this.host.scroll.append(root);
            this.updateTasksAttentionChrome();
            this.host.renderSubtitle();
            return;
        }

        const groups = this.host.collectTasksInboxGroups(projects);
        const teamRendered = this.appendTasksHubTeamSection(root);

        if (groups.length > 0) {
            const inbox = document.createElement('div');
            inbox.className = 'theia-mobile-projects-chats-inbox theia-mod-tasks-inbox';
            if (teamRendered) {
                const inboxHead = document.createElement('div');
                inboxHead.className = 'theia-mobile-tasks-inbox-section-head';
                const inboxLabel = document.createElement('span');
                inboxLabel.className = 'theia-mobile-tasks-inbox-section-label';
                inboxLabel.textContent = nls.localize('qaap/mobileProjects/tasksInboxSection', 'By project');
                inboxHead.append(inboxLabel);
                inbox.append(inboxHead);
            }
            for (const group of groups) {
                inbox.append(this.host.createInboxProjectGroup(group.project, group.items));
            }
            root.append(inbox);
        }

        if (!teamRendered && groups.length === 0) {
            if (this.host.tasksFirstLoadPending && !this.host.query.trim()) {
                root.append(this.createTasksLoadingState());
            } else {
                root.append(this.createTasksEmptyState());
            }
        }
        this.host.scroll.append(root);
        this.updateTasksAttentionChrome();
        this.host.renderSubtitle();
    }
}
