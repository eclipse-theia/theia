// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { startGithubOAuth } from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import { nls } from '@theia/core/lib/common/nls';
import { type QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import {
    buildReviewHubPullRequestItems,
    buildWorkHubInboxItems,
    githubRepoKeysForProjects,
    pullRequestMatchesQuery,
    type MobileWorkHubInboxItem,
} from './mobile-work-hub-inbox';
import type { MobileProjectsActiveTasks, MobileProjectTaskView } from './mobile-projects-active-tasks';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry, MobileProjectsHubView } from './mobile-projects-types';

/** Panel surface for Work Hub inbox grouping and Review / Chat hub list rendering. */
export interface MobileProjectsWorkHubInboxHost {
    query: string;
    scroll: HTMLElement;
    hubView: MobileProjectsHubView;
    inboxPullRequestsLoaded: boolean;
    inboxPullRequestsLoading: boolean;
    inboxGithubSignedIn: boolean | undefined;
    inboxPullRequests: QaapGithubPullRequestSummary[];
    conversations: MobileProjectsConversations | undefined;
    projectsService: MobileProjectsService;
    delegate: {
        onOpenPullRequest?(pullRequest: QaapGithubPullRequestSummary): void;
    };

    refreshInboxPullRequests(projects: MobileProjectEntry[] | undefined): Promise<void>;
    renderSubtitle(): void;
    localChatsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    vpsTasksForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    conversationMatchesQuery(summary: QaapAgentConversationSummaryDTO, query: string): boolean;
    countRunningTasks(project: MobileProjectEntry): number;
    countUnreadTasks(project: MobileProjectEntry): number;
    activeInfoForProject(project: MobileProjectEntry): ReturnType<MobileProjectsActiveTasks['getForCwd']>;
    summaryToTaskView(conversation: QaapAgentConversationSummaryDTO): MobileProjectTaskView;
    createTaskItem(
        project: MobileProjectEntry,
        task: MobileProjectTaskView,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
        summary?: QaapAgentConversationSummaryDTO,
        parentIds?: ReadonlySet<string>,
    ): HTMLElement;
    createTaskLeadingGlyph(codiconClass: string): HTMLElement;
    openProjectDetail(project: MobileProjectEntry): void | Promise<void>;
    ensureOverlayUi(): {
        parallel: {
            createVariantRunSection(
                project: MobileProjectEntry,
                runId: string,
                summaries: QaapAgentConversationSummaryDTO[],
                activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
                parentIds: ReadonlySet<string>,
            ): HTMLElement;
        };
    };
}

/** Shared inbox project groups for Tasks, Review, and Chat Work Hub tabs. */
export class MobileProjectsWorkHubInboxUi {

    constructor(protected readonly host: MobileProjectsWorkHubInboxHost) { }

    renderReviewHubView(projects: MobileProjectEntry[]): void {
        if (!this.host.inboxPullRequestsLoaded && !this.host.inboxPullRequestsLoading) {
            void this.host.refreshInboxPullRequests(projects);
        }
        const groups = this.collectReviewGroups(projects);
        const hasGithubRepos = githubRepoKeysForProjects(projects).length > 0;
        const root = document.createElement('div');
        root.className = 'theia-mobile-review-hub-root';

        if (groups.length > 0) {
            const inbox = document.createElement('div');
            inbox.className = 'theia-mobile-projects-chats-inbox theia-mod-review-inbox';
            for (const group of groups) {
                inbox.append(this.createInboxProjectGroup(group.project, group.items));
            }
            if (hasGithubRepos && this.host.inboxPullRequestsLoaded && this.host.inboxGithubSignedIn === false) {
                inbox.append(this.createInboxGithubSignInHint());
            }
            root.append(inbox);
            this.host.scroll.append(root);
        } else if (!this.host.inboxPullRequestsLoaded && this.host.inboxPullRequestsLoading) {
            this.host.scroll.append(this.createReviewLoadingState());
        } else if (hasGithubRepos && this.host.inboxGithubSignedIn === false) {
            const host = document.createElement('div');
            host.className = 'theia-mobile-review-hub-root';
            host.append(this.createInboxGithubSignInHint(), this.createReviewEmptyState());
            this.host.scroll.append(host);
        } else {
            this.host.scroll.append(this.createReviewEmptyState());
        }
        this.host.renderSubtitle();
    }

    renderChatHubView(projects: MobileProjectEntry[]): void {
        const groups = this.collectChatHubGroups(projects);
        if (groups.length === 0) {
            this.host.scroll.append(this.createChatEmptyState());
            this.host.renderSubtitle();
            return;
        }
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
            host.append(this.createInboxProjectGroup(group.project, items));
        }
        this.host.scroll.append(host);
        this.host.renderSubtitle();
    }

    collectChatHubGroups(
        projects: MobileProjectEntry[],
    ): Array<{ project: MobileProjectEntry; summaries: QaapAgentConversationSummaryDTO[] }> {
        const groups: Array<{ project: MobileProjectEntry; summaries: QaapAgentConversationSummaryDTO[] }> = [];
        const query = this.host.query.trim().toLowerCase();
        for (const project of projects) {
            let summaries = this.host.localChatsForProject(project);
            if (query) {
                summaries = summaries.filter(c => this.host.conversationMatchesQuery(c, query));
            }
            if (summaries.length === 0) {
                continue;
            }
            groups.push({ project, summaries });
        }
        groups.sort((a, b) => this.compareChatInboxProjectOrder(a.project, b.project));
        return groups;
    }

    collectTasksInboxGroups(
        projects: MobileProjectEntry[],
    ): Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }> {
        const groups: Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }> = [];
        const query = this.host.query.trim().toLowerCase();
        for (const project of projects) {
            let conversations = this.host.conversations
                ? this.host.vpsTasksForProject(project)
                : [];
            if (query) {
                conversations = conversations.filter(c => this.host.conversationMatchesQuery(c, query));
            }
            const items = buildWorkHubInboxItems(project, conversations);
            if (items.length === 0) {
                continue;
            }
            groups.push({ project, items });
        }
        groups.sort((a, b) => this.compareChatInboxProjectOrder(a.project, b.project));
        return groups;
    }

    collectReviewGroups(
        projects: MobileProjectEntry[],
    ): Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }> {
        const groups: Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }> = [];
        const query = this.host.query.trim().toLowerCase();
        for (const project of projects) {
            let pullRequests = this.host.inboxPullRequests.filter(pr => {
                if (query) {
                    return pullRequestMatchesQuery(pr, query);
                }
                return true;
            });
            const conversations = this.host.conversations
                ? this.host.vpsTasksForProject(project)
                : [];
            const items = buildReviewHubPullRequestItems(
                project,
                pullRequests,
                conversations,
                this.activeAgentBranchForProject(project),
            );
            if (items.length === 0) {
                continue;
            }
            groups.push({ project, items });
        }
        groups.sort((a, b) => this.compareChatInboxProjectOrder(a.project, b.project));
        return groups;
    }

    compareChatInboxProjectOrder(a: MobileProjectEntry, b: MobileProjectEntry): number {
        const aRunning = this.host.countRunningTasks(a) > 0 ? 1 : 0;
        const bRunning = this.host.countRunningTasks(b) > 0 ? 1 : 0;
        if (aRunning !== bRunning) {
            return bRunning - aRunning;
        }
        const aUnread = this.host.countUnreadTasks(a) > 0 ? 1 : 0;
        const bUnread = this.host.countUnreadTasks(b) > 0 ? 1 : 0;
        if (aUnread !== bUnread) {
            return bUnread - aUnread;
        }
        if (a.isCurrent !== b.isCurrent) {
            return a.isCurrent ? -1 : 1;
        }
        if (a.pinned !== b.pinned) {
            return a.pinned ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    }

    createInboxGithubSignInHint(): HTMLElement {
        const hint = document.createElement('div');
        hint.className = 'theia-mobile-projects-inbox-hint';
        const text = document.createElement('p');
        text.textContent = nls.localize(
            'qaap/mobileProjects/inboxSignInHint',
            'Sign in with GitHub to see open pull requests in this inbox.',
        );
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-projects-inbox-hint-btn';
        btn.textContent = nls.localize('qaap/mobileProjects/inboxSignIn', 'Sign in with GitHub');
        btn.addEventListener('click', () => startGithubOAuth());
        hint.append(text, btn);
        return hint;
    }

    createInboxProjectGroup(
        project: MobileProjectEntry,
        items: MobileWorkHubInboxItem[],
    ): HTMLElement {
        const section = document.createElement('section');
        section.className = 'theia-mobile-projects-chats-project-group';
        section.style.setProperty('--qaap-mobile-project-accent', project.color);

        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'theia-mobile-projects-chats-project-head';
        const glyph = document.createElement('span');
        glyph.className = 'theia-mobile-projects-chats-project-glyph';
        glyph.textContent = project.name.slice(0, 1).toUpperCase();
        const label = document.createElement('span');
        label.className = 'theia-mobile-projects-chats-project-label';
        label.textContent = project.name;
        const count = document.createElement('span');
        count.className = 'theia-mobile-projects-chats-project-count';
        count.textContent = String(items.length);
        head.append(glyph, label, count);
        head.addEventListener('click', () => {
            this.host.hubView = 'repos';
            this.host.projectsService.setHubView('repos');
            void this.host.openProjectDetail(project);
        });

        const parentIds = new Set<string>();
        for (const item of items) {
            if (item.kind === 'conversation' && item.summary.forkedFromId) {
                parentIds.add(item.summary.forkedFromId);
            }
        }

        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-chats-list';
        const activeInfo = this.host.activeInfoForProject(project);

        const variantRuns = new Map<string, QaapAgentConversationSummaryDTO[]>();
        for (const item of items) {
            if (item.kind === 'conversation' && item.summary.parallelRunId) {
                const runId = item.summary.parallelRunId;
                const bucket = variantRuns.get(runId) ?? [];
                bucket.push(item.summary);
                variantRuns.set(runId, bucket);
                continue;
            }
            if (item.kind === 'conversation') {
                const task = this.host.summaryToTaskView(item.summary);
                list.append(this.host.createTaskItem(project, task, activeInfo, item.summary, parentIds));
            } else {
                list.append(this.createInboxPullRequestItem(project, item.pullRequest, item.agentActivityLabel));
            }
        }

        section.append(head, list);
        for (const [runId, summaries] of variantRuns) {
            section.append(this.host.ensureOverlayUi().parallel.createVariantRunSection(project, runId, summaries, activeInfo, parentIds));
        }
        return section;
    }

    createReviewEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-git-pull-request';
        const title = document.createElement('strong');
        title.textContent = this.host.query
            ? nls.localize('qaap/mobileProjects/noReviewSearchResults', 'No matching pull requests')
            : nls.localize('qaap/mobileProjects/noReview', 'No open pull requests');
        const body = document.createElement('span');
        body.textContent = this.host.query
            ? nls.localize(
                'qaap/mobileProjects/noReviewSearchResultsBody',
                'Try a title, author, branch, or PR number.',
            )
            : nls.localize(
                'qaap/mobileProjects/noReviewBody',
                'When agents open PRs on your linked repos, they show up here for swipe review.',
            );
        empty.append(icon, title, body);
        return empty;
    }

    createReviewLoadingState(): HTMLElement {
        const loading = document.createElement('div');
        loading.className = 'theia-mobile-projects-empty theia-mod-inbox-loading';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-loading codicon-mod-spin';
        const title = document.createElement('strong');
        title.textContent = nls.localize('qaap/mobileProjects/reviewLoading', 'Loading pull requests…');
        const body = document.createElement('span');
        body.textContent = nls.localize(
            'qaap/mobileProjects/reviewLoadingBody',
            'Fetching open pull requests from GitHub.',
        );
        loading.append(icon, title, body);
        return loading;
    }

    createChatEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-comment-discussion';
        const title = document.createElement('strong');
        title.textContent = this.host.query
            ? nls.localize('qaap/mobileProjects/noChatSearchResults', 'No matching chats')
            : nls.localize('qaap/mobileProjects/noChat', 'No local chats yet');
        const body = document.createElement('span');
        body.textContent = this.host.query
            ? nls.localize(
                'qaap/mobileProjects/noChatSearchResultsBody',
                'Try another title or message preview.',
            )
            : nls.localize(
                'qaap/mobileProjects/noChatBody',
                'Open a project and use Agent for interactive chat — sessions persist on this device.',
            );
        empty.append(icon, title, body);
        return empty;
    }

    protected activeAgentBranchForProject(project: MobileProjectEntry): string | undefined {
        const streaming = this.host.conversations
            ? this.host.vpsTasksForProject(project).some(c => c.status === 'streaming')
            : false;
        return streaming && project.branch ? project.branch : undefined;
    }

    protected createInboxPullRequestItem(
        _project: MobileProjectEntry,
        pullRequest: QaapGithubPullRequestSummary,
        agentActivity?: string,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-task-row theia-mobile-projects-inbox-pr-row';

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theia-mobile-projects-task-item theia-mobile-projects-inbox-pr-item';

        const icon = document.createElement('span');
        icon.className = 'theia-mobile-projects-task-dot theia-mod-pr';
        icon.append(this.host.createTaskLeadingGlyph('codicon-git-pull-request'));
        icon.setAttribute('aria-hidden', 'true');

        const body = document.createElement('div');
        body.className = 'theia-mobile-projects-task-body';

        const titleRow = document.createElement('div');
        titleRow.className = 'theia-mobile-projects-task-title-row';
        const title = document.createElement('span');
        title.className = 'theia-mobile-projects-task-title';
        title.textContent = pullRequest.title;
        const since = document.createElement('span');
        since.className = 'theia-mobile-projects-task-since';
        since.textContent = this.formatInboxPullRequestSince(pullRequest);
        titleRow.append(title, since);
        body.append(titleRow);

        const foot = document.createElement('div');
        foot.className = 'theia-mobile-projects-task-foot';
        const prChip = document.createElement('span');
        prChip.className = 'theia-mobile-projects-task-agent theia-mod-pr';
        prChip.textContent = nls.localize(
            'qaap/mobileProjects/inboxPrChip',
            '#{0} · @{1}',
            String(pullRequest.number),
            pullRequest.author,
        );
        foot.append(prChip);

        const branchChip = document.createElement('span');
        branchChip.className = 'theia-mobile-projects-inbox-pr-branch';
        branchChip.textContent = `${pullRequest.branch} → ${pullRequest.base}`;
        foot.append(branchChip);

        const stats = document.createElement('span');
        stats.className = 'theia-mobile-projects-inbox-pr-stats';
        stats.textContent = `+${pullRequest.adds} -${pullRequest.dels}`;
        foot.append(stats);

        if (agentActivity === 'agent-active') {
            const agentBadge = document.createElement('span');
            agentBadge.className = 'theia-mobile-projects-inbox-pr-agent';
            agentBadge.textContent = nls.localize('qaap/mobileProjects/inboxAgentOnPr', 'Agent working');
            foot.append(agentBadge);
        }

        body.append(foot);
        item.append(icon, body);
        item.addEventListener('click', ev => {
            ev.stopPropagation();
            this.host.delegate.onOpenPullRequest?.(pullRequest);
        });
        row.append(item);
        return row;
    }

    protected formatInboxPullRequestSince(pullRequest: QaapGithubPullRequestSummary): string {
        const updated = Date.parse(pullRequest.updatedAt);
        if (!Number.isFinite(updated)) {
            return '';
        }
        const deltaMs = Date.now() - updated;
        const minutes = Math.floor(deltaMs / 60_000);
        if (minutes < 1) {
            return nls.localize('qaap/mobileProjects/inboxJustNow', 'just now');
        }
        if (minutes < 60) {
            return nls.localize('qaap/mobileProjects/inboxMinutesAgo', '{0}m ago', String(minutes));
        }
        const hours = Math.floor(minutes / 60);
        if (hours < 48) {
            return nls.localize('qaap/mobileProjects/inboxHoursAgo', '{0}h ago', String(hours));
        }
        const days = Math.floor(hours / 24);
        return nls.localize('qaap/mobileProjects/inboxDaysAgo', '{0}d ago', String(days));
    }
}
