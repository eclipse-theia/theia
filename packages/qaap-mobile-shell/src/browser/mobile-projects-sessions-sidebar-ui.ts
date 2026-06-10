// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { QuickPickItem } from '@theia/core/lib/browser';
import {
    readStoredAgent,
    SHELL_AGENT_ID,
} from '../common/qaap-agent-task-client';
import type { QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import { QAAP_WORK_HUB_GETTING_STARTED } from '../common/mobile-work-hub-catalog';
import { readQaapSignedIn } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import { buildQaapAccountMenuEntries, toggleQaapAccountMenu } from './qaap-workbench-account-menu';
import type { MobileProjectEntry } from './mobile-projects-types';
import { MobileWorkHubSessionsSidebar } from './mobile-work-hub-sessions-sidebar';

export const MOBILE_PROJECTS_SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT = 5;
export const MOBILE_PROJECTS_SESSIONS_SIDEBAR_CONVERSATIONS_PAGE_SIZE = 15;

export interface MobileProjectsSessionsSidebarHost {
sessionsSidebar: MobileWorkHubSessionsSidebar | undefined;
sessionsSidebarExpandedProjectIds: Set<string>;
sessionsSidebarVisibleConversationCountByProjectId: Map<string, number>;
sessionsSidebarAccordionDefaultsApplied: boolean;
projects: MobileProjectEntry[];
query: string;
transcriptOpenSummaryId: string | undefined;
activeTasks?: import('./mobile-projects-active-tasks').MobileProjectsActiveTasks;
conversations?: import('./mobile-projects-conversations').MobileProjectsConversations;
projectsService: import('./mobile-projects-service').MobileProjectsService;
commands: import('@theia/core/lib/common/command').CommandRegistry;
quickInputService?: import('@theia/core/lib/browser').QuickInputService;
delegate: {
    onProjectOpenInIde?(project: MobileProjectEntry): void | Promise<void>;
    onShowRoutinesHub?(): void | Promise<void>;
    cardMenuUi: import('./mobile-projects-card-menu-ui').MobileProjectsCardMenuUi;
    projectRowsUi: import('./mobile-projects-project-rows-ui').MobileProjectsProjectRowsUi;
};

conversationIndexUi: import('./mobile-projects-conversation-index-ui').MobileProjectsConversationIndexUi;
hubQueryUi: import('./mobile-projects-hub-query-ui').MobileProjectsHubQueryUi;
chatServiceSummariesUi: import('./mobile-projects-chat-service-summaries-ui').MobileProjectsChatServiceSummariesUi;
cardMenuUi: import('./mobile-projects-card-menu-ui').MobileProjectsCardMenuUi;
projectRowsUi: import('./mobile-projects-project-rows-ui').MobileProjectsProjectRowsUi;
compareChatInboxProjectOrder(a: MobileProjectEntry, b: MobileProjectEntry): number;
createTaskItem(
    project: MobileProjectEntry,
    task: import('./mobile-projects-active-tasks').MobileProjectTaskView,
    activeInfo: ReturnType<import('./mobile-projects-active-tasks').MobileProjectsActiveTasks['getForCwd']>,
    summary: import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO | undefined,
    parentIds: ReadonlySet<string>,
    options?: { onActivate?: () => void; compact?: boolean },
): HTMLElement;
buildProjectOptionsMenu(project: MobileProjectEntry): HTMLElement;
toggleCardMenu(row: HTMLElement, menu: HTMLElement, menuBtn: HTMLButtonElement): void;
buildProjectOptionsMenu(project: MobileProjectEntry): HTMLElement;
toggleCardMenu(row: HTMLElement, menu: HTMLElement, menuBtn: HTMLButtonElement): void;
resolveHomePinnedProject(): MobileProjectEntry | undefined;
shouldUseAgentsHubLanding(): boolean;
isProjectDetailView(): boolean;
transcriptSheet: HTMLElement | undefined;
agentsHubInlineActive: boolean;
visible: boolean;
transcriptSheetUi: import('./mobile-projects-transcript-sheet-ui').MobileProjectsTranscriptSheetUi;
executionSurfaceTabsUi: import('./mobile-projects-execution-surface-tabs-ui').MobileProjectsExecutionSurfaceTabsUi;
closeAgentsHubSession(): void;
renderHeader(): void;
renderSubtitle(): void;
stickyComposerRenderUi: import('./mobile-projects-sticky-composer-render-ui').MobileProjectsStickyComposerRenderUi;
closeCurrentWorkspace(): Promise<void>;
openConversationSummary(project: MobileProjectEntry, summary: import('../common/qaap-agent-conversation-client').QaapAgentConversationSummaryDTO): Promise<void>;
runCatalogAction(action: import('../common/mobile-work-hub-catalog').WorkHubCatalogAction): Promise<void>;
}

export class MobileProjectsSessionsSidebarUi {
    constructor(protected readonly host: MobileProjectsSessionsSidebarHost) { }

    openWorkHubSessionsSidebar(): void {
        const sidebar = this.ensureWorkHubSessionsSidebar();
        if (!sidebar.isVisible()) {
            sidebar.show();
        }
        void this.prepareSessionsSidebarData().then(() => {
            sidebar.refreshList();
        });
    }
    toggleWorkHubSessionsSidebar(): void {
        const sidebar = this.ensureWorkHubSessionsSidebar();
        if (sidebar.isVisible()) {
            sidebar.hide();
            return;
        }
        sidebar.show();
        void this.prepareSessionsSidebarData().then(() => {
            sidebar.refreshList();
        });
    }
    async prepareSessionsSidebarData(): Promise<void> {
        this.host.activeTasks?.start();
        this.host.conversations?.start();
        try {
            this.host.projects = await this.host.projectsService.loadProjects();
        } catch {
            /* keep in-memory list */
        }
        await this.host.conversations?.refreshTheiaChatSessionsForProjects(this.host.projects);
        await this.host.chatServiceSummariesUi.refreshChatServiceSessionSummaries();
    }
    isWorkHubSessionsSidebarVisible(): boolean {
        return this.host.sessionsSidebar?.isVisible() === true;
    }
    ensureWorkHubSessionsSidebar(): MobileWorkHubSessionsSidebar {
        if (!this.host.sessionsSidebar) {
            this.host.sessionsSidebar = new MobileWorkHubSessionsSidebar({
                renderSessionList: host => this.renderWorkHubSessionsSidebarList(host),
                onNewChat: () => { void this.onWorkHubSessionsSidebarNewChat(); },
                onClose: () => {
                    this.host.cardMenuUi.closeCardMenu();
                },
                storageScope: () => this.host.projectsService.getCurrentWorkspaceCwd(),
                onAccountMenu: anchor => { this.onSessionsSidebarAccountClick(anchor); },
                onSearch: () => { void this.openSessionsSidebarSearch(); },
                onExtensions: () => { void this.host.commands.executeCommand('workbench.view.extensions'); },
                onAutomations: () => { void this.onWorkHubSessionsSidebarAutomations(); },
            });
            document.body.append(this.host.sessionsSidebar.node);
        }
        return this.host.sessionsSidebar;
    }
    resolveWorkHubSessionsSidebarProject(): MobileProjectEntry | undefined {
        return this.host.projects.find(p => p.isCurrent)
            ?? this.host.resolveHomePinnedProject();
    }
    renderWorkHubSessionsSidebarList(host: HTMLElement): void {
        const projects = [...this.host.projects].sort((a, b) => this.host.compareChatInboxProjectOrder(a, b));
        const query = this.host.query.trim().toLowerCase();
        if (projects.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'theia-mobile-work-hub-sessions-sidebar-empty';
            empty.textContent = query
                ? nls.localize('qaap/sessionsSidebar/noSearchResults', 'No sessions match your search.')
                : nls.localize('qaap/sessionsSidebar/noSessions', 'No agent sessions yet. Start one from Agents.');
            host.append(empty);
            return;
        }
        const onActivate = (): void => {
            this.host.sessionsSidebar?.hideForMobileOverlay();
        };
        this.seedSessionsSidebarAccordionDefaults(projects);
        const pinnedGroups = this.collectSessionsSidebarPinnedGroups(projects, query);
        const bypassConversationLimit = query.length > 0;
        if (pinnedGroups.length > 0) {
            host.append(this.createSessionsSidebarPinnedSection(pinnedGroups, onActivate, bypassConversationLimit));
        }
        const sectionHead = document.createElement('div');
        sectionHead.className = 'theia-mobile-tasks-inbox-section-head theia-mod-sessions-sidebar-projects-head';
        const sectionLabel = document.createElement('span');
        sectionLabel.className = 'theia-mobile-tasks-inbox-section-label';
        sectionLabel.textContent = nls.localize('qaap/sessionsSidebar/projectsSection', 'Projects');
        sectionHead.append(sectionLabel);
        const list = document.createElement('div');
        list.className = 'theia-mobile-work-hub-sessions-sidebar-projects-list';
        let visibleCount = 0;
        for (const project of projects) {
            let conversations = [...this.host.conversationIndexUi.conversationsForProject(project)]
                .filter(summary => !this.isSessionsSidebarPinnedConversation(summary))
                .sort((a, b) => this.host.conversationIndexUi.compareConversationOrder(a, b));
            if (query) {
                conversations = conversations.filter(c => this.host.hubQueryUi.conversationMatchesQuery(c, query));
                if (conversations.length === 0) {
                    continue;
                }
            } else if (conversations.length === 0) {
                continue;
            }
            list.append(this.createSessionsSidebarProjectGroup(project, conversations, onActivate, bypassConversationLimit));
            visibleCount++;
        }
        if (visibleCount === 0 && pinnedGroups.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'theia-mobile-work-hub-sessions-sidebar-empty';
            empty.textContent = nls.localize(
                'qaap/sessionsSidebar/noSearchResults',
                'No sessions match your search.',
            );
            host.append(empty);
            return;
        }
        if (visibleCount > 0) {
            host.append(sectionHead, list);
        }
        this.syncSessionsSidebarAnimatedListHeights(host);
    }
    syncSessionsSidebarAnimatedListHeights(host: HTMLElement): void {
        window.requestAnimationFrame(() => {
            const lists = host.querySelectorAll<HTMLElement>(
                '.theia-mobile-work-hub-sessions-sidebar-project-group .theia-mobile-projects-chats-list, '
                + '.theia-mobile-work-hub-sessions-sidebar-project-group .theia-mobile-work-hub-sessions-sidebar-projects-list',
            );
            for (const list of lists) {
                list.style.setProperty('--qaap-sessions-sidebar-list-height', `${list.scrollHeight}px`);
            }
        });
    }
    isSessionsSidebarPinnedConversation(summary: QaapAgentConversationSummaryDTO): boolean {
        const flags = this.host.conversationIndexUi.resolveConversationFlags(summary);
        return flags.priority && !flags.paused;
    }
    collectSessionsSidebarPinnedGroups(
        projects: MobileProjectEntry[],
        query: string,
    ): Array<{ project: MobileProjectEntry; conversations: QaapAgentConversationSummaryDTO[] }> {
        const groups: Array<{ project: MobileProjectEntry; conversations: QaapAgentConversationSummaryDTO[] }> = [];
        for (const project of projects) {
            let conversations = this.host.conversationIndexUi.conversationsForProject(project)
                .filter(summary => this.isSessionsSidebarPinnedConversation(summary))
                .sort((a, b) => this.host.conversationIndexUi.compareConversationOrder(a, b));
            if (query) {
                conversations = conversations.filter(c => this.host.hubQueryUi.conversationMatchesQuery(c, query));
            }
            if (conversations.length > 0) {
                groups.push({ project, conversations });
            }
        }
        return groups;
    }
    createSessionsSidebarPinnedSection(
        groups: Array<{ project: MobileProjectEntry; conversations: QaapAgentConversationSummaryDTO[] }>,
        onActivate: () => void,
        bypassConversationLimit = false,
    ): HTMLElement {
        const section = document.createElement('section');
        section.className = 'theia-mobile-work-hub-sessions-sidebar-pinned-section';
        const head = document.createElement('div');
        head.className = 'theia-mobile-tasks-inbox-section-head theia-mod-sessions-sidebar-pinned-head';
        const label = document.createElement('span');
        label.className = 'theia-mobile-tasks-inbox-section-label';
        label.textContent = nls.localize('qaap/sessionsSidebar/pinnedSection', 'Anclados');
        head.append(label);
        const list = document.createElement('div');
        list.className = 'theia-mobile-work-hub-sessions-sidebar-pinned-list';
        for (const { project, conversations } of groups) {
            list.append(this.createSessionsSidebarPinnedProjectGroup(project, conversations, onActivate, bypassConversationLimit));
        }
        section.append(head, list);
        return section;
    }
    getSessionsSidebarConversationDisplayLimit(
        project: MobileProjectEntry,
        totalCount: number,
        bypassLimit: boolean,
    ): number {
        if (bypassLimit || totalCount === 0) {
            return totalCount;
        }
        const stored = this.host.sessionsSidebarVisibleConversationCountByProjectId.get(project.id);
        const limit = stored ?? MOBILE_PROJECTS_SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT;
        return Math.min(limit, totalCount);
    }
    resolveSessionsSidebarVisibleConversations(
        project: MobileProjectEntry,
        conversations: readonly QaapAgentConversationSummaryDTO[],
        bypassLimit: boolean,
    ): { visible: QaapAgentConversationSummaryDTO[]; hiddenCount: number; showLess: boolean } {
        const all = [...conversations];
        if (bypassLimit) {
            return { visible: all, hiddenCount: 0, showLess: false };
        }
        const defaultLimit = MOBILE_PROJECTS_SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT;
        const displayLimit = this.getSessionsSidebarConversationDisplayLimit(project, all.length, bypassLimit);
        if (all.length <= defaultLimit && !this.host.sessionsSidebarVisibleConversationCountByProjectId.has(project.id)) {
            return { visible: all, hiddenCount: 0, showLess: false };
        }
        const visible = all.slice(0, displayLimit);
        const openId = this.host.transcriptOpenSummaryId;
        if (openId && displayLimit > 0) {
            const openIndex = all.findIndex(c => c.id === openId);
            if (openIndex >= displayLimit) {
                visible[displayLimit - 1] = all[openIndex]!;
            }
        }
        const hiddenCount = Math.max(0, all.length - displayLimit);
        const showLess = displayLimit > defaultLimit && hiddenCount === 0;
        return { visible, hiddenCount, showLess };
    }
    appendSessionsSidebarConversationItems(
        listHost: HTMLElement,
        project: MobileProjectEntry,
        conversations: readonly QaapAgentConversationSummaryDTO[],
        onActivate: () => void,
        bypassLimit: boolean,
    ): void {
        const { visible, hiddenCount, showLess } = this.resolveSessionsSidebarVisibleConversations(project, conversations, bypassLimit);
        if (visible.length === 0) {
            return;
        }
        const activeInfo = this.host.conversationIndexUi.activeInfoForProject(project);
        const parentIds = new Set<string>();
        for (const summary of conversations) {
            if (summary.forkedFromId) {
                parentIds.add(summary.forkedFromId);
            }
        }
        for (const summary of visible) {
            const task = this.host.conversationIndexUi.summaryToTaskView(summary);
            listHost.append(this.host.projectRowsUi.createTaskItem(project, task, activeInfo, summary, parentIds, { onActivate, compact: true }));
        }
        if (bypassLimit) {
            return;
        }
        const totalCount = conversations.length;
        if (hiddenCount > 0) {
            listHost.append(this.createSessionsSidebarShowMoreControl(project, hiddenCount, totalCount));
        } else if (showLess) {
            listHost.append(this.createSessionsSidebarShowLessControl(project));
        }
    }
    createSessionsSidebarShowMoreControl(
        project: MobileProjectEntry,
        hiddenCount: number,
        totalCount: number,
    ): HTMLButtonElement {
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'theia-mobile-work-hub-sessions-sidebar-show-more';
        moreBtn.textContent = nls.localize('qaap/sessionsSidebar/showMore', 'Mostrar más');
        const pageSize = MOBILE_PROJECTS_SESSIONS_SIDEBAR_CONVERSATIONS_PAGE_SIZE;
        moreBtn.title = nls.localize(
            'qaap/sessionsSidebar/showMoreHint',
            'Show {0} more sessions',
            String(Math.min(pageSize, hiddenCount)),
        );
        moreBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            const current = this.host.sessionsSidebarVisibleConversationCountByProjectId.get(project.id)
                ?? MOBILE_PROJECTS_SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT;
            this.host.sessionsSidebarVisibleConversationCountByProjectId.set(
                project.id,
                Math.min(current + pageSize, totalCount),
            );
            this.host.sessionsSidebar?.refreshList();
        });
        return moreBtn;
    }
    createSessionsSidebarShowLessControl(project: MobileProjectEntry): HTMLButtonElement {
        const lessBtn = document.createElement('button');
        lessBtn.type = 'button';
        lessBtn.className = 'theia-mobile-work-hub-sessions-sidebar-show-more theia-mod-show-less';
        lessBtn.textContent = nls.localize('qaap/sessionsSidebar/showLess', 'Mostrar menos');
        lessBtn.title = nls.localize(
            'qaap/sessionsSidebar/showLessHint',
            'Show only the first {0} sessions',
            String(MOBILE_PROJECTS_SESSIONS_SIDEBAR_CONVERSATIONS_COLLAPSED_LIMIT),
        );
        lessBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.host.sessionsSidebarVisibleConversationCountByProjectId.delete(project.id);
            this.host.sessionsSidebar?.refreshList();
        });
        return lessBtn;
    }
    createSessionsSidebarPinnedProjectGroup(
        project: MobileProjectEntry,
        conversations: readonly QaapAgentConversationSummaryDTO[],
        onActivate: () => void,
        bypassConversationLimit = false,
    ): HTMLElement {
        const group = document.createElement('div');
        group.className = 'theia-mobile-work-hub-sessions-sidebar-pinned-project';
        const projectHead = document.createElement('div');
        projectHead.className = 'theia-mobile-work-hub-sessions-sidebar-pinned-project-head';
        const folder = document.createElement('span');
        folder.className = 'codicon codicon-folder theia-mobile-work-hub-sessions-sidebar-pinned-project-icon';
        folder.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = 'theia-mobile-work-hub-sessions-sidebar-pinned-project-name';
        name.textContent = project.name;
        projectHead.append(folder, name);
        const taskList = document.createElement('div');
        taskList.className = 'theia-mobile-projects-chats-list theia-mod-sessions-sidebar-pinned-tasks';
        this.appendSessionsSidebarConversationItems(taskList, project, conversations, onActivate, bypassConversationLimit);
        group.append(projectHead, taskList);
        return group;
    }
    seedSessionsSidebarAccordionDefaults(projects: MobileProjectEntry[]): void {
        if (this.host.sessionsSidebarAccordionDefaultsApplied) {
            return;
        }
        this.host.sessionsSidebarAccordionDefaultsApplied = true;
        for (const project of projects) {
            if (project.isCurrent || this.host.conversationIndexUi.countRunningTasks(project) > 0) {
                this.host.sessionsSidebarExpandedProjectIds.add(project.id);
            }
        }
        if (projects.length > 0 && this.host.sessionsSidebarExpandedProjectIds.size === 0) {
            this.host.sessionsSidebarExpandedProjectIds.add(projects[0].id);
        }
    }
    createSessionsSidebarProjectGroup(
        project: MobileProjectEntry,
        conversations: readonly QaapAgentConversationSummaryDTO[],
        onActivate: () => void,
        bypassConversationLimit = false,
    ): HTMLElement {
        const expanded = this.host.sessionsSidebarExpandedProjectIds.has(project.id);
        const section = document.createElement('section');
        section.className = 'theia-mobile-work-hub-sessions-sidebar-project-group';
        if (!expanded) {
            section.classList.add('theia-mod-collapsed');
        }
        const toggleExpand = (): void => {
            const willExpand = section.classList.contains('theia-mod-collapsed');
            section.classList.toggle('theia-mod-collapsed');
            head.setAttribute('aria-expanded', String(willExpand));
            if (willExpand) {
                this.host.sessionsSidebarExpandedProjectIds.add(project.id);
            } else {
                this.host.sessionsSidebarExpandedProjectIds.delete(project.id);
            }
        };
        const head = this.createSessionsSidebarProjectRowHead(project, expanded, toggleExpand);
        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-chats-list';
        this.appendSessionsSidebarConversationItems(list, project, conversations, onActivate, bypassConversationLimit);
        section.append(head, list);
        return section;
    }
    createSessionsSidebarProjectRowHead(
        project: MobileProjectEntry,
        expanded: boolean,
        onToggleExpand: () => void,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-work-hub-sessions-sidebar-project-row-wrap';
        if (project.isCurrent) {
            row.classList.add('theia-mod-current');
        }
        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'theia-mobile-work-hub-sessions-sidebar-project-row';
        head.setAttribute('aria-expanded', String(expanded));
        const chevron = document.createElement('span');
        chevron.className = 'codicon codicon-chevron-right theia-mobile-work-hub-sessions-sidebar-project-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        const dot = document.createElement('span');
        dot.className = 'theia-mobile-work-hub-sessions-sidebar-project-dot';
        dot.style.background = project.color;
        dot.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = 'theia-mobile-work-hub-sessions-sidebar-project-name';
        name.textContent = project.name;
        head.append(chevron, dot, name);
        head.addEventListener('click', ev => {
            ev.stopPropagation();
            onToggleExpand();
        });
        const actions = document.createElement('div');
        actions.className = 'theia-mobile-work-hub-sessions-sidebar-project-actions';
        if (project.isCurrent) {
            actions.append(this.createSessionsSidebarIdeOpenBadge());
        }
        actions.append(this.createSessionsSidebarIdeOpenControl(project));
        const menu = this.host.cardMenuUi.buildProjectOptionsMenu(project);
        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'theia-mobile-projects-card-menu-btn theia-mobile-projects-row-menu';
        menuBtn.setAttribute('aria-label', nls.localize('qaap/mobileProjects/cardMenu', 'Project options'));
        menuBtn.setAttribute('aria-haspopup', 'menu');
        menuBtn.setAttribute('aria-expanded', 'false');
        const menuIcon = document.createElement('span');
        menuIcon.className = 'codicon codicon-kebab-vertical';
        menuIcon.setAttribute('aria-hidden', 'true');
        menuBtn.append(menuIcon);
        menuBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.host.cardMenuUi.toggleCardMenu(row, menu, menuBtn);
        });
        row.append(head, actions, menuBtn, menu);
        return row;
    }
    createSessionsSidebarIdeOpenControl(project: MobileProjectEntry): HTMLButtonElement {
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'theia-mobile-projects-row-meta-open theia-mobile-work-hub-sessions-sidebar-project-open';
        const openLabel = nls.localize('qaap/mobileProjects/openInIde', 'Open in IDE');
        openBtn.setAttribute('aria-label', openLabel);
        openBtn.title = openLabel;
        const openIcon = document.createElement('span');
        openIcon.className = 'codicon codicon-link-external';
        openIcon.setAttribute('aria-hidden', 'true');
        openBtn.append(openIcon);
        openBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.host.sessionsSidebar?.hide();
            void this.host.delegate.onProjectOpenInIde?.(project);
        });
        openBtn.addEventListener('keydown', ev => ev.stopPropagation());
        return openBtn;
    }
    createSessionsSidebarIdeOpenBadge(): HTMLSpanElement {
        const badge = document.createElement('span');
        badge.className = 'theia-mobile-work-hub-sessions-sidebar-ide-badge';
        const label = document.createElement('span');
        label.className = 'theia-mobile-work-hub-sessions-sidebar-ide-badge-label';
        label.textContent = nls.localize('qaap/mobileProjects/ideOpen', 'IDE open');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-work-hub-sessions-sidebar-ide-badge-close';
        close.setAttribute('aria-label', nls.localize('qaap/mobileProjects/closeWorkspace', 'Close workspace'));
        close.title = close.getAttribute('aria-label') ?? '';
        close.textContent = '×';
        close.addEventListener('click', ev => {
            ev.stopPropagation();
            void this.host.closeCurrentWorkspace();
        });
        close.addEventListener('keydown', ev => ev.stopPropagation());
        badge.append(label, close);
        return badge;
    }
    async onWorkHubSessionsSidebarNewChat(): Promise<void> {
        const project = this.resolveWorkHubSessionsSidebarProject();
        if (!project) {
            return;
        }
        await this.openEmptyMobileChatSheet(project);
    }
    async openEmptyMobileChatSheet(project: MobileProjectEntry): Promise<void> {
        this.host.sessionsSidebar?.hide();
        if (this.host.shouldUseAgentsHubLanding() && !this.host.isProjectDetailView()) {
            if (this.host.transcriptSheet) {
                this.host.transcriptSheetUi.closeTranscriptSheet();
            }
            if (this.host.agentsHubInlineActive) {
                this.host.closeAgentsHubSession();
            }
            this.host.executionSurfaceTabsUi.setExecutionSurfaceTab(project, 'messages');
            if (this.host.visible) {
                this.host.renderHeader();
                this.host.renderSubtitle();
            }
            this.host.stickyComposerRenderUi.renderStickyComposer();
            return;
        }
        const cwd = this.host.projectsService.getProjectCwd(project);
        const agentId = (cwd ? readStoredAgent(cwd) : undefined)
            ?? this.host.activeTasks?.getDefaultAgent()
            ?? SHELL_AGENT_ID;
        const summary: QaapAgentConversationSummaryDTO = {
            id: `pending-new-chat-${project.id}-${Date.now()}`,
            cwd: cwd ?? '',
            workspacePath: cwd,
            agentId,
            title: nls.localize('qaap/mobileProjects/newChatTitle', 'New agent'),
            status: 'idle',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messageCount: 0,
        };
        await this.host.transcriptSheetUi.openTranscriptSheet(project, summary);
    }
    async onWorkHubSessionsSidebarAutomations(): Promise<void> {
        this.host.sessionsSidebar?.hide();
        await this.host.delegate.onShowRoutinesHub?.();
    }
    onSessionsSidebarAccountClick(anchor: HTMLButtonElement): void {
        toggleQaapAccountMenu(
            anchor,
            this.host.commands,
            buildQaapAccountMenuEntries(readQaapSignedIn()),
            {
                section: QAAP_WORK_HUB_GETTING_STARTED,
                onCatalogAction: action => { void this.host.runCatalogAction(action); },
            },
            {
                placement: 'above',
                anchorGap: 2,
                onMenuAction: () => { this.host.sessionsSidebar?.hide(); },
            },
        );
    }
    async openSessionsSidebarSearch(): Promise<void> {
        if (!this.host.quickInputService) {
            return;
        }
        const project = this.resolveWorkHubSessionsSidebarProject();
        if (!project) {
            return;
        }
        const conversations = [...this.host.conversationIndexUi.conversationsForProject(project)]
            .sort((a, b) => b.updatedAt - a.updatedAt);
        type SessionPickItem = QuickPickItem & { summary: QaapAgentConversationSummaryDTO };
        const quickPick = this.host.quickInputService.createQuickPick<SessionPickItem>();
        quickPick.placeholder = nls.localize('qaap/sessionsSidebar/searchPlaceholder', 'Search sessions');
        quickPick.items = conversations.map(summary => ({
            label: summary.title?.trim() || nls.localize('qaap/mobileProjects/untitledChat', 'Untitled chat'),
            description: summary.agentId,
            summary,
        }));
        quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0];
            if (selected?.summary) {
                this.host.sessionsSidebar?.hide();
                void this.host.openConversationSummary(project, selected.summary);
            }
            quickPick.hide();
        });
        quickPick.show();
    }
}
