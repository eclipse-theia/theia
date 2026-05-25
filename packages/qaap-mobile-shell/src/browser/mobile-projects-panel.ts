// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { Disposable } from '@theia/core/lib/common/disposable';
import { MessageService } from '@theia/core/lib/common/message-service';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { Widget as LuminoWidget } from '@lumino/widgets';
import { GenericCapabilitySelections } from '@theia/ai-core';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatAgentLocation, ChatRequestModel, ChatService, ChatSession, ChatSessionMetadata, MutableChatModel } from '@theia/ai-chat';
import { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import {
    MobileProjectEntry,
    MobileProjectFilter,
} from './mobile-projects-types';
import { MobileProjectsActiveTasks, MobileProjectTaskView } from './mobile-projects-active-tasks';
import { MobileProjectsConversations } from './mobile-projects-conversations';
import { MobileProjectsService } from './mobile-projects-service';
import {
    QaapAgentConversationDTO,
    QaapAgentConversationSummaryDTO,
    conversationToSummary,
    createConversation,
    getConversation,
    postConversationMessage,
} from '../common/qaap-agent-conversation-client';
import { markMobileProjectReadmeForOpen, markMobileProjectsPanelDismiss } from './mobile-projects-open';
import { MobileOpenRepositoryDialog } from './mobile-open-repository-dialog';
import {
    readStoredAgent,
    reconcileSelectedAgent,
    SHELL_AGENT_ID,
} from '../common/qaap-agent-task-client';
import {
    createMobileSheetGrabber,
    installMobilePullToRefresh,
    installMobileSheetDragDismiss,
} from './mobile-sheet-gestures';
import { MobileSnackbar } from './mobile-snackbar';

export interface MobileProjectsPanelDelegate {
    onProjectOpen(project: MobileProjectEntry): void;
    onDismiss(): void;
    /** Clone/create/open from the projects UI finished and switched the IDE workspace. */
    onWorkspaceOpened?(): void;
    onProjectsChanged?(): void;
    /**
     * Invoked when the user taps the project that already matches the active workspace.
     * The shell uses it to surface the README in the editor instead of triggering a no-op reload.
     */
    onCurrentProjectActivated?(project: MobileProjectEntry): void | Promise<void>;
    onResumePreview?(project: MobileProjectEntry): void | Promise<void>;
    onOpenAgentOnTask?(project: MobileProjectEntry): void | Promise<void>;
}

export interface MobileProjectsPanelOptions {
    /**
     * Render as the workbench home view instead of a transient sheet: no drag-to-dismiss, no
     * outside-tap dismiss, no `dialog` ARIA role. The user lives here when there is no workspace
     * open, so the panel must not be dismissable.
     */
    homeMode?: boolean;
    /** Live cross-project task tracker. When provided the panel updates cards from SSE events. */
    activeTasks?: MobileProjectsActiveTasks;
    /**
     * Cross-project tracker of persistent agent conversations. When provided, each project card
     * lists its VPS-backed conversations and the inline composer creates / continues them instead
     * of firing fire-and-forget background tasks.
     */
    conversations?: MobileProjectsConversations;
    /** Creates the same chat input widget used by the Agent view. */
    createChatInputWidget?: (id: string) => Promise<AIChatInputWidget>;
    /** Creates a full Agent chat view for opening real workspace chat sessions from Projects. */
    createChatViewWidget?: (id: string) => Promise<ChatViewWidget>;
    chatService?: ChatService;
    chatAgentService?: ChatAgentService;
    messageService?: MessageService;
}

interface RestorableTheiaChatData {
    readonly title?: string;
    readonly pinnedAgentId?: string;
    readonly saveDate?: number;
    readonly model: ConstructorParameters<typeof MutableChatModel>[0] & {
        readonly sessionId: string;
        readonly requests: unknown[];
        readonly responses: unknown[];
    };
}

function isRestorableTheiaChatData(candidate: unknown): candidate is RestorableTheiaChatData {
    const data = candidate as Partial<RestorableTheiaChatData> | undefined;
    const model = data?.model as Partial<RestorableTheiaChatData['model']> | undefined;
    return !!model
        && typeof model.sessionId === 'string'
        && Array.isArray(model.requests)
        && Array.isArray(model.responses);
}

export class MobileProjectsPanel {

    protected readonly root: HTMLElement;
    protected readonly scroll: HTMLElement;
    protected readonly subtitleEl: HTMLElement;
    protected readonly filterRow: HTMLElement;
    protected readonly searchInput: HTMLInputElement;
    protected filter: MobileProjectFilter = 'all';
    protected query = '';
    protected projects: MobileProjectEntry[] = [];
    protected visible = false;
    /** Id of the single project row currently expanded; undefined when all are collapsed. */
    protected expandedId: string | undefined;
    /** Whether the inline composer for the expanded row is in its full chrome (morphed) view. */
    protected composerExpanded = false;
    protected composerDraft = '';
    protected agentChatInputWidget: AIChatInputWidget | undefined;
    protected agentChatInputSession: ChatSession | undefined;
    protected transcriptChatInputWidget: AIChatInputWidget | undefined;
    protected transcriptChatViewWidget: ChatViewWidget | undefined;
    /** Monotonic counter that disambiguates each AIChatInputWidget instance from the WidgetManager cache. */
    protected agentChatInputMountSeq = 0;
    /** Last-flashed task id — drives the highlight animation when a fresh task appears. */
    protected justAddedTaskId: string | undefined;
    /** cwd resolved after clone/prepare — keyed by project id when uri is not yet on the card. */
    protected readonly preparedCwdByProjectId = new Map<string, string>();
    protected readonly chatServiceSessionSummariesByProjectId = new Map<string, QaapAgentConversationSummaryDTO[]>();
    protected openMenu: HTMLElement | undefined;
    protected openMenuAnchor: HTMLElement | undefined;
    protected openMenuCard: HTMLElement | undefined;
    protected openMenuRepositionDispose: Disposable = Disposable.NULL;
    protected openRepoDialog: MobileOpenRepositoryDialog | undefined;
    protected dragDismissDispose: Disposable = Disposable.NULL;
    protected pullToRefreshDispose: Disposable = Disposable.NULL;
    protected lastTitleTap = 0;
    protected readonly homeMode: boolean;
    protected readonly activeTasks: MobileProjectsActiveTasks | undefined;
    protected readonly conversations: MobileProjectsConversations | undefined;
    protected readonly createChatInputWidget: MobileProjectsPanelOptions['createChatInputWidget'];
    protected readonly createChatViewWidget: MobileProjectsPanelOptions['createChatViewWidget'];
    protected readonly chatService: ChatService | undefined;
    protected readonly chatAgentService: ChatAgentService | undefined;
    protected readonly messageService: MessageService | undefined;
    protected activeTasksDispose: Disposable = Disposable.NULL;
    protected conversationsDispose: Disposable = Disposable.NULL;
    /** Open transcript sheet — only one at a time, dismissed on tap-outside or close button. */
    protected transcriptSheet: HTMLElement | undefined;
    protected transcriptSheetDispose: Disposable = Disposable.NULL;
    protected readonly onDocumentPointerDown = (ev: PointerEvent): void => {
        if (!this.openMenu) {
            return;
        }
        const target = ev.target;
        if (target instanceof Node && this.openMenu.contains(target)) {
            return;
        }
        this.closeCardMenu();
    };

    protected readonly onScrollWhileMenuOpen = (): void => {
        if (this.openMenu && this.openMenuAnchor) {
            this.positionCardMenu(this.openMenu, this.openMenuAnchor);
        }
    };

    protected readonly onWindowResizeWhileMenuOpen = (): void => {
        this.onScrollWhileMenuOpen();
    };

    constructor(
        protected readonly projectsService: MobileProjectsService,
        protected readonly commands: CommandRegistry,
        protected readonly delegate: MobileProjectsPanelDelegate,
        options: MobileProjectsPanelOptions = {},
    ) {
        this.homeMode = !!options.homeMode;
        this.activeTasks = options.activeTasks;
        this.conversations = options.conversations;
        this.createChatInputWidget = options.createChatInputWidget;
        this.createChatViewWidget = options.createChatViewWidget;
        this.chatService = options.chatService;
        this.chatAgentService = options.chatAgentService;
        this.messageService = options.messageService;
        this.root = document.createElement('div');
        this.root.className = this.homeMode ? 'theia-mobile-projects theia-mod-home' : 'theia-mobile-projects';
        if (!this.homeMode) {
            this.root.setAttribute('role', 'dialog');
            this.root.setAttribute('aria-modal', 'true');
        }
        this.root.setAttribute('aria-hidden', 'true');
        this.root.hidden = true;

        const grabber = createMobileSheetGrabber();

        const header = document.createElement('header');
        header.className = 'theia-mobile-projects-header';

        const titleBlock = document.createElement('div');
        titleBlock.className = 'theia-mobile-projects-title-block';
        const title = document.createElement('h1');
        title.className = 'theia-mobile-projects-title';
        title.textContent = nls.localize('qaap/mobileProjects/title', 'Projects');
        this.subtitleEl = document.createElement('div');
        this.subtitleEl.className = 'theia-mobile-projects-meta';
        titleBlock.append(title, this.subtitleEl);

        const actions = document.createElement('div');
        actions.className = 'theia-mobile-projects-header-actions';

        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.className = 'theia-mobile-projects-new-btn';
        newBtn.innerHTML = '<span class="codicon codicon-add" aria-hidden="true"></span> ' +
            nls.localize('qaap/mobileProjects/new', 'New');
        newBtn.addEventListener('click', () => { void this.onNewClick(); });
        actions.append(newBtn);
        header.append(titleBlock, actions);

        const searchWrap = document.createElement('div');
        searchWrap.className = 'theia-mobile-projects-search';
        const searchIcon = document.createElement('span');
        searchIcon.className = 'codicon codicon-search';
        searchIcon.setAttribute('aria-hidden', 'true');
        this.searchInput = document.createElement('input');
        this.searchInput.type = 'search';
        this.searchInput.className = 'theia-mobile-projects-search-input';
        this.searchInput.placeholder = nls.localize('qaap/mobileProjects/searchPlaceholder', 'Search repositories');
        this.searchInput.addEventListener('input', () => {
            this.query = this.searchInput.value.trim().toLowerCase();
            this.renderList();
        });
        searchWrap.append(searchIcon, this.searchInput);

        this.filterRow = document.createElement('div');
        this.filterRow.className = 'theia-mobile-projects-filters';
        this.filterRow.setAttribute('role', 'tablist');

        this.scroll = document.createElement('div');
        this.scroll.className = 'theia-mobile-projects-scroll';

        this.root.append(grabber, header, searchWrap, this.filterRow, this.scroll);

        titleBlock.addEventListener('click', () => this.onTitleTap());

        if (!this.homeMode) {
            this.dragDismissDispose = installMobileSheetDragDismiss({
                target: this.root,
                grip: grabber,
                onDismiss: () => {
                    this.hide();
                    this.delegate.onDismiss();
                },
            });
        }

        this.pullToRefreshDispose = installMobilePullToRefresh({
            scroller: this.scroll,
            host: this.root,
            onRefresh: async () => {
                await this.refreshProjects();
                MobileSnackbar.show(
                    nls.localize('qaap/mobileProjects/refreshed', 'Projects refreshed'),
                    { kind: 'success', duration: 1400 }
                );
            },
        });
    }

    protected onTitleTap(): void {
        const now = Date.now();
        if (now - this.lastTitleTap < 320) {
            this.scroll.scrollTo({ top: 0, behavior: 'smooth' });
            this.lastTitleTap = 0;
        } else {
            this.lastTitleTap = now;
        }
    }

    get node(): HTMLElement {
        return this.root;
    }

    isVisible(): boolean {
        return this.visible;
    }

    /** True when the panel is the workbench home (no active workspace), not a dismissable sheet. */
    isHomeMode(): boolean {
        return this.homeMode;
    }

    dispose(): void {
        this.closeCardMenu();
        this.disposeAgentChatInput();
        this.dragDismissDispose.dispose();
        this.dragDismissDispose = Disposable.NULL;
        this.pullToRefreshDispose.dispose();
        this.pullToRefreshDispose = Disposable.NULL;
        this.activeTasksDispose.dispose();
        this.activeTasksDispose = Disposable.NULL;
        this.conversationsDispose.dispose();
        this.conversationsDispose = Disposable.NULL;
        this.closeTranscriptSheet();
    }

    async show(): Promise<void> {
        this.projects = await this.projectsService.loadProjects();
        await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
        await this.refreshChatServiceSessionSummaries();
        this.filter = this.projectsService.getFilter();
        this.render();
        this.visible = true;
        this.root.hidden = false;
        this.root.setAttribute('aria-hidden', 'false');
        this.root.classList.add('theia-mod-visible');
        document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
        this.subscribeToActiveTasks();
    }

    hide(): void {
        if (!this.visible) {
            return;
        }
        this.closeCardMenu();
        this.openRepoDialog?.hide();
        document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
        this.activeTasksDispose.dispose();
        this.activeTasksDispose = Disposable.NULL;
        this.conversationsDispose.dispose();
        this.conversationsDispose = Disposable.NULL;
        this.closeTranscriptSheet();
        this.visible = false;
        this.root.hidden = true;
        this.root.setAttribute('aria-hidden', 'true');
        this.root.classList.remove('theia-mod-visible');
    }

    /**
     * Re-render the list when a VPS task starts or finishes in any project. We reload from the
     * service (cheap — it's an in-memory overlay) rather than mutating state in place, so
     * heuristics and SSE-derived status stay consistent through a single code path.
     */
    protected subscribeToActiveTasks(): void {
        this.activeTasksDispose.dispose();
        this.conversationsDispose.dispose();
        if (this.activeTasks) {
            this.activeTasksDispose = this.activeTasks.onDidChange(() => {
                if (this.visible) {
                    void this.applyActiveTasksRefresh();
                }
            });
        }
        if (this.conversations) {
            this.conversations.start();
            this.conversationsDispose = this.conversations.onDidChange(() => {
                if (this.visible) {
                    void this.applyActiveTasksRefresh();
                }
            });
        }
    }

    protected async applyActiveTasksRefresh(): Promise<void> {
        try {
            this.projects = await this.projectsService.loadProjects();
            await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            await this.refreshChatServiceSessionSummaries();
            // While the user is interacting with the expanded agent composer, do NOT rebuild the
            // list — renderList() disposes and remounts the AIChatInputWidget, which would wipe
            // their draft and break the in-place chrome. Only refresh ambient chrome (subtitle,
            // filter counts). The card visuals catch up the next time the user collapses/expands.
            if (!this.composerExpanded) {
                this.renderList();
            }
            this.renderSubtitle();
            this.renderFilters();
        } catch {
            /* a transient load failure must not break the live view */
        }
    }

    protected renderSubtitle(): void {
        const repoCount = this.projects.length;
        const openCount = this.projects.filter(p => p.isCurrent).length;
        const runningCount = this.projects.filter(p => this.isProjectRunning(p)).length;

        this.subtitleEl.replaceChildren();
        const reposChip = document.createElement('span');
        reposChip.className = 'theia-mobile-projects-meta-chip';
        reposChip.textContent = nls.localize(
            'qaap/mobileProjects/metaRepos', '{0} repos', String(repoCount)
        );
        this.subtitleEl.append(reposChip);

        if (openCount > 0) {
            const chip = document.createElement('span');
            chip.className = 'theia-mobile-projects-meta-chip theia-mod-open';
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-projects-meta-dot';
            chip.append(dot, document.createTextNode(nls.localize(
                'qaap/mobileProjects/metaOpen', '{0} open', String(openCount)
            )));
            this.subtitleEl.append(chip);
        }

        if (runningCount > 0) {
            const chip = document.createElement('span');
            chip.className = 'theia-mobile-projects-meta-chip theia-mod-running';
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-projects-meta-dot theia-mod-pulse';
            chip.append(dot, document.createTextNode(nls.localize(
                'qaap/mobileProjects/metaRunning', '{0} running', String(runningCount)
            )));
            this.subtitleEl.append(chip);
        }
    }

    protected isProjectRunning(project: MobileProjectEntry): boolean {
        return this.countRunningTasks(project) > 0;
    }

    protected countRunningTasks(project: MobileProjectEntry): number {
        return this.conversationsForProject(project).filter(c => c.status === 'streaming').length;
    }

    protected countDoneTasks(project: MobileProjectEntry): number {
        return this.conversationsForProject(project).filter(c => c.status === 'idle' && c.messageCount > 0).length;
    }

    /** All persistent agent conversations the panel knows about for this project. */
    protected conversationsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[] {
        const directChatSessions = this.chatServiceSessionSummariesByProjectId.get(project.id) ?? [];
        if (!this.conversations) {
            return directChatSessions;
        }
        const cwd = this.preparedCwdByProjectId.get(project.id)
            ?? this.projectsService.getProjectCwd(project);
        let list = cwd ? this.conversations.getConversationsForCwd(cwd) : [];
        if (list.length === 0) {
            list = this.conversations.findConversationsForProject(project);
        }
        return this.mergeConversationSummaries(directChatSessions, list);
    }

    protected async refreshChatServiceSessionSummaries(): Promise<void> {
        this.chatServiceSessionSummariesByProjectId.clear();
        if (!this.chatService) {
            return;
        }
        let persisted: ChatSessionMetadata[] = [];
        try {
            persisted = Object.values(await this.chatService.getPersistedSessions());
        } catch {
            persisted = [];
        }
        const active = this.chatService.getSessions()
            .filter(session => !session.model.isEmpty())
            .map(session => ({
                sessionId: session.id,
                title: session.title ?? nls.localize('qaap/mobileProjects/untitledChat', 'Untitled chat'),
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
        const currentName = this.projectsService.getCurrentWorkspaceName()?.toLowerCase();
        const currentCwd = this.projectsService.getCurrentWorkspaceCwd();
        const targetProject = this.projects.find(project =>
            project.isCurrent
            || this.projectsService.projectMatchesCurrentWorkspace(project)
            || (!!currentName && project.name.toLowerCase() === currentName)
            || (!!currentCwd && currentCwd.toLowerCase().endsWith(`/${project.name.toLowerCase()}`))
            || (!!project.github && !!currentCwd && currentCwd.toLowerCase().endsWith(`/${project.github.owner.toLowerCase()}/${project.github.name.toLowerCase()}`))
        ) ?? this.projects.find(project => project.id === this.expandedId);
        if (!targetProject) {
            return;
        }
        const cwd = this.projectsService.getProjectCwd(targetProject) ?? currentCwd ?? targetProject.name;
        this.chatServiceSessionSummariesByProjectId.set(targetProject.id, sessions.map(session => ({
            id: this.chatServiceConversationId(session.sessionId),
            source: 'theia-chat',
            cwd,
            workspacePath: cwd,
            sessionId: session.sessionId,
            agentId: 'chat',
            title: session.title,
            status: 'idle',
            createdAt: session.saveDate,
            updatedAt: session.saveDate,
            messageCount: 1,
            lastMessagePreview: nls.localize('qaap/mobileProjects/workspaceChatPreview', 'Workspace chat'),
            lastMessageRole: 'user',
        })));
    }

    protected mergeConversationSummaries(
        first: QaapAgentConversationSummaryDTO[],
        second: QaapAgentConversationSummaryDTO[],
    ): QaapAgentConversationSummaryDTO[] {
        const byId = new Map<string, QaapAgentConversationSummaryDTO>();
        for (const item of [...first, ...second]) {
            byId.set(item.id, item);
        }
        return [...byId.values()].sort((a, b) => {
            const aStreaming = a.status === 'streaming' ? 1 : 0;
            const bStreaming = b.status === 'streaming' ? 1 : 0;
            if (aStreaming !== bStreaming) {
                return bStreaming - aStreaming;
            }
            return b.updatedAt - a.updatedAt;
        });
    }

    protected chatServiceConversationId(sessionId: string): string {
        return `theia-chat-service:${encodeURIComponent(sessionId)}`;
    }

    /**
     * Legacy adapter — projects the conversation list as `MobileProjectTaskView[]` so existing
     * task-block markup (built before the conversation refactor) keeps working unchanged. New
     * code paths should use {@link conversationsForProject} directly.
     */
    protected tasksForProject(project: MobileProjectEntry): MobileProjectTaskView[] {
        const conversations = this.conversationsForProject(project);
        if (conversations.length === 0) {
            return this.fallbackTasksFromProject(project);
        }
        return conversations.map(c => ({
            id: c.id,
            title: c.title,
            command: c.lastMessagePreview ?? '',
            cwd: c.cwd,
            state: c.status === 'streaming' ? 'running' : c.status === 'failed' ? 'failed' : 'completed',
            createdAt: c.createdAt,
            finishedAt: c.status !== 'streaming' ? c.updatedAt : undefined,
        }));
    }

    protected fallbackTasksFromProject(project: MobileProjectEntry): MobileProjectTaskView[] {
        const activeInfo = this.activeInfoForProject(project);
        if (!activeInfo?.taskId && project.status !== 'working') {
            return [];
        }
        const title = activeInfo?.title
            ?? (project.status === 'working' && project.task && project.task !== '—' ? project.task : undefined);
        if (!title) {
            return [];
        }
        const cwd = this.preparedCwdByProjectId.get(project.id)
            ?? this.projectsService.getProjectCwd(project)
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

    protected async onNewClick(): Promise<void> {
        if (!this.openRepoDialog) {
            this.openRepoDialog = new MobileOpenRepositoryDialog(this.projectsService, {
                onProjectsChanged: nextProjects => {
                    this.projects = nextProjects;
                    this.render();
                    this.delegate.onProjectsChanged?.();
                },
                onWorkspaceOpened: () => this.delegate.onWorkspaceOpened?.(),
            });
            this.root.append(this.openRepoDialog.node);
        }
        await this.openRepoDialog.show();
    }

    protected async onCloneClick(): Promise<void> {
        this.root.classList.add('theia-mod-loading');
        try {
            const nextProjects = await this.projectsService.cloneGithubProject();
            if (!nextProjects) {
                return;
            }
            this.projects = nextProjects;
            this.render();
            this.delegate.onProjectsChanged?.();
            this.delegate.onWorkspaceOpened?.();
        } finally {
            this.root.classList.remove('theia-mod-loading');
        }
    }

    protected async refreshProjects(): Promise<void> {
        this.root.classList.add('theia-mod-loading');
        try {
            this.projects = await this.projectsService.loadProjects();
            await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            await this.refreshChatServiceSessionSummaries();
            this.render();
            this.delegate.onProjectsChanged?.();
        } finally {
            this.root.classList.remove('theia-mod-loading');
        }
    }

    protected render(): void {
        this.renderSubtitle();
        this.renderFilters();
        this.renderList();
    }

    protected renderFilters(): void {
        this.filterRow.replaceChildren();
        const active = this.projects.filter(p => p.isCurrent || this.isProjectRunning(p)).length;
        const pinned = this.projects.filter(p => p.pinned).length;
        const tabs: Array<{ id: MobileProjectFilter; label: string; count: number }> = [
            { id: 'all', label: nls.localize('qaap/mobileProjects/filterAll', 'All'), count: this.projects.length },
            { id: 'active', label: nls.localize('qaap/mobileProjects/filterActive', 'Active'), count: active },
            { id: 'pinned', label: nls.localize('qaap/mobileProjects/filterPinned', 'Pinned'), count: pinned },
        ];
        for (const tab of tabs) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-filter-tab';
            btn.setAttribute('role', 'tab');
            const isActive = this.filter === tab.id;
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            if (isActive) {
                btn.classList.add('theia-mod-active');
            }
            const label = document.createElement('span');
            label.className = 'theia-mobile-projects-filter-tab-label';
            label.textContent = tab.label;
            const count = document.createElement('span');
            count.className = 'theia-mobile-projects-filter-tab-count';
            count.textContent = String(tab.count);
            btn.append(label, count);
            btn.addEventListener('click', () => {
                this.filter = tab.id;
                this.projectsService.setFilter(tab.id);
                this.renderFilters();
                this.renderList();
            });
            this.filterRow.append(btn);
        }
    }

    protected renderList(): void {
        this.closeCardMenu();
        this.disposeAgentChatInput();
        this.scroll.replaceChildren();
        const filtered = this.applySearch(this.applyFilter(this.projects, this.filter));

        if (filtered.length === 0) {
            this.scroll.append(this.createEmptyState());
            return;
        }

        // Default: keep the active workspace expanded so the user lands on what matters.
        if (this.expandedId === undefined) {
            const current = filtered.find(p => p.isCurrent);
            if (current) {
                this.expandedId = current.id;
            }
        }

        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-rows';
        for (const p of filtered) {
            list.append(this.createRow(p));
        }
        this.scroll.append(list);
    }

    protected applyFilter(projects: MobileProjectEntry[], filter: MobileProjectFilter): MobileProjectEntry[] {
        if (filter === 'pinned') {
            return projects.filter(p => p.pinned);
        }
        if (filter === 'active') {
            return projects.filter(p => p.isCurrent || this.isProjectRunning(p));
        }
        return projects;
    }

    protected applySearch(projects: MobileProjectEntry[]): MobileProjectEntry[] {
        if (!this.query) {
            return projects;
        }
        return projects.filter(project =>
            project.name.toLowerCase().includes(this.query)
            || project.branch.toLowerCase().includes(this.query)
            || project.task.toLowerCase().includes(this.query)
            || project.github?.fullName.toLowerCase().includes(this.query)
        );
    }

    protected createEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-repo';
        const title = document.createElement('strong');
        title.textContent = this.query
            ? nls.localize('qaap/mobileProjects/noSearchResults', 'No matching repositories')
            : nls.localize('qaap/mobileProjects/noRepositories', 'No repositories yet');
        const body = document.createElement('span');
        body.textContent = this.query
            ? nls.localize('qaap/mobileProjects/noSearchResultsBody', 'Try another name, branch, or owner.')
            : nls.localize('qaap/mobileProjects/noRepositoriesBody', 'Create or clone a GitHub repository to start working.');
        empty.append(icon, title, body);
        return empty;
    }

    protected createSectionLabel(text: string, withDot: boolean): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-section';
        if (withDot) {
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-projects-section-dot';
            row.append(dot);
        }
        const label = document.createElement('span');
        label.className = 'theia-mobile-projects-section-label';
        label.textContent = text;
        row.append(label);
        return row;
    }

    protected createRow(project: MobileProjectEntry): HTMLElement {
        const card = document.createElement('div');
        card.className = 'theia-mobile-projects-card';
        card.style.setProperty('--qaap-mobile-project-accent', project.color);
        if (project.isCurrent) {
            card.classList.add('theia-mod-current');
        }
        const isExpanded = this.expandedId === project.id;
        if (isExpanded) {
            card.classList.add('theia-mod-expanded');
        }

        const running = this.countRunningTasks(project) > 0;
        const doneCount = this.countDoneTasks(project);
        const activeInfo = this.activeInfoForProject(project);

        // Collapsed header (always visible) — clicking toggles the expansion.
        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'theia-mobile-projects-row-head';
        header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');

        const glyph = document.createElement('span');
        glyph.className = 'theia-mobile-projects-row-glyph';
        if (project.isCurrent) {
            glyph.classList.add('theia-mod-workspace');
        }
        if (running) {
            glyph.classList.add('theia-mod-running');
        } else if (doneCount > 0) {
            glyph.classList.add('theia-mod-done');
        }
        header.append(glyph);

        const main = document.createElement('div');
        main.className = 'theia-mobile-projects-row-main';

        const nameRow = document.createElement('div');
        nameRow.className = 'theia-mobile-projects-row-name-row';
        const name = document.createElement('span');
        name.className = 'theia-mobile-projects-row-name';
        name.textContent = project.name;
        nameRow.append(name);
        if (project.pinned) {
            const pin = document.createElement('span');
            pin.className = 'codicon codicon-pin theia-mobile-projects-row-pin';
            pin.setAttribute('aria-hidden', 'true');
            nameRow.append(pin);
        }
        main.append(nameRow);

        const metaRow = document.createElement('div');
        metaRow.className = 'theia-mobile-projects-row-meta';
        const branchSpan = document.createElement('span');
        branchSpan.textContent = project.branch;
        metaRow.append(branchSpan);
        if (project.lastActive && project.lastActive !== '—') {
            const sep = document.createElement('span');
            sep.className = 'theia-mobile-projects-row-meta-sep';
            sep.textContent = '·';
            const time = document.createElement('span');
            time.textContent = project.lastActive;
            metaRow.append(sep, time);
        }
        if (running) {
            const sep = document.createElement('span');
            sep.className = 'theia-mobile-projects-row-meta-sep';
            sep.textContent = '·';
            const run = document.createElement('span');
            run.className = 'theia-mobile-projects-row-meta-running';
            const runningCount = this.countRunningTasks(project);
            run.textContent = runningCount === 1
                ? nls.localize('qaap/mobileProjects/rowRunning', '1 running')
                : nls.localize('qaap/mobileProjects/rowRunningMany', '{0} running', String(runningCount));
            metaRow.append(sep, run);
        } else if (doneCount > 0) {
            const sep = document.createElement('span');
            sep.className = 'theia-mobile-projects-row-meta-sep';
            sep.textContent = '·';
            const done = document.createElement('span');
            done.className = 'theia-mobile-projects-row-meta-done';
            done.textContent = doneCount === 1
                ? nls.localize('qaap/mobileProjects/rowChat', '1 chat')
                : nls.localize('qaap/mobileProjects/rowChatsMany', '{0} chats', String(doneCount));
            metaRow.append(sep, done);
        }
        main.append(metaRow);
        header.append(main);

        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-projects-row-chevron';
        chevron.textContent = '›';
        chevron.setAttribute('aria-hidden', 'true');
        header.append(chevron);

        header.addEventListener('click', ev => {
            ev.stopPropagation();
            void this.toggleRowExpanded(project);
        });
        header.addEventListener('contextmenu', ev => {
            ev.preventDefault();
            void this.toggleRowExpanded(project);
        });
        card.append(header);

        if (!isExpanded) {
            return card;
        }

        const body = document.createElement('div');
        body.className = 'theia-mobile-projects-row-body';

        body.append(this.createWorkspaceBlock(project));
        body.append(this.createInlineComposer(project));
        body.append(this.createTaskBlock(project, activeInfo));

        // Kebab menu lives in the expanded body's footer so the row stays uncluttered.
        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'theia-mobile-projects-card-menu-btn theia-mobile-projects-row-more';
        menuBtn.setAttribute('aria-label', nls.localize('qaap/mobileProjects/cardMenu', 'Project options'));
        menuBtn.setAttribute('aria-haspopup', 'menu');
        menuBtn.setAttribute('aria-expanded', 'false');
        const menuIcon = document.createElement('span');
        menuIcon.className = 'codicon codicon-kebab-vertical';
        menuIcon.setAttribute('aria-hidden', 'true');
        menuBtn.append(menuIcon);
        const menu = this.buildCardMenu(project, activeInfo);
        menuBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.toggleCardMenu(card, menu, menuBtn);
        });
        const moreRow = document.createElement('div');
        moreRow.className = 'theia-mobile-projects-row-more-row';
        moreRow.append(menuBtn);
        body.append(moreRow);

        card.append(body, menu);
        return card;
    }

    protected async toggleRowExpanded(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        this.expandedId = this.expandedId === project.id ? undefined : project.id;
        // Collapse the composer chrome whenever the expanded row changes so each row reopens clean.
        this.composerExpanded = false;
        await this.refreshChatServiceSessionSummaries();
        this.renderList();
    }

    protected createWorkspaceBlock(project: MobileProjectEntry): HTMLElement {
        if (project.isCurrent) {
            const card = document.createElement('div');
            card.className = 'theia-mobile-projects-workspace-card';
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-projects-workspace-dot';
            const text = document.createElement('div');
            text.className = 'theia-mobile-projects-workspace-text';
            const title = document.createElement('div');
            title.className = 'theia-mobile-projects-workspace-title';
            title.textContent = nls.localize('qaap/mobileProjects/workspaceOpen', 'Workspace open');
            const sub = document.createElement('div');
            sub.className = 'theia-mobile-projects-workspace-sub';
            sub.textContent = nls.localize('qaap/mobileProjects/workspaceSince', 'since {0}', project.lastActive || '—');
            text.append(title, sub);
            const focus = document.createElement('button');
            focus.type = 'button';
            focus.className = 'theia-mobile-projects-workspace-focus';
            focus.textContent = nls.localize('qaap/mobileProjects/workspaceFocus', 'Focus') + ' →';
            focus.addEventListener('click', ev => {
                ev.stopPropagation();
                this.delegate.onProjectOpen(project);
            });
            card.append(dot, text, focus);
            return card;
        }
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'theia-mobile-projects-workspace-idle';
        row.innerHTML =
            '<span class="codicon codicon-folder" aria-hidden="true"></span>' +
            `<span class="theia-mobile-projects-workspace-idle-label">${nls.localize('qaap/mobileProjects/workspaceOpenIn', 'Open in workspace')}</span>` +
            '<span class="theia-mobile-projects-workspace-idle-arrow" aria-hidden="true">→</span>';
        row.addEventListener('click', ev => {
            ev.stopPropagation();
            this.delegate.onProjectOpen(project);
        });
        return row;
    }

    protected createInlineComposer(project: MobileProjectEntry): HTMLElement {
        const canRunTask = !!this.projectsService.getProjectCwd(project) || !!project.github;
        return this.composerExpanded
            ? this.createInlineComposerExpanded(project, canRunTask)
            : this.createInlineComposerCollapsed(project, canRunTask);
    }

    protected createInlineComposerCollapsed(project: MobileProjectEntry, canRunTask: boolean): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-projects-inline-composer theia-mod-collapsed';
        if (!canRunTask) {
            wrap.classList.add('theia-mod-disabled');
        }
        const caret = document.createElement('span');
        caret.className = 'theia-mobile-projects-inline-caret';
        caret.textContent = '›';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'theia-mobile-projects-inline-input';
        input.placeholder = nls.localize('qaap/mobileProjects/inlineComposerPlaceholder', 'Ask the agent to…');
        input.disabled = !canRunTask;
        input.addEventListener('click', ev => ev.stopPropagation());
        input.addEventListener('focus', () => {
            this.composerDraft = input.value;
        });

        const tuneBtn = document.createElement('button');
        tuneBtn.type = 'button';
        tuneBtn.className = 'theia-mobile-projects-inline-tune';
        tuneBtn.title = nls.localize('qaap/mobileProjects/inlineMoreOptions', 'More options');
        tuneBtn.setAttribute('aria-label', tuneBtn.title);
        tuneBtn.innerHTML = this.tuneIconSvg();
        tuneBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.composerDraft = input.value;
            this.composerExpanded = true;
            this.renderList();
        });

        const startBtn = document.createElement('button');
        startBtn.type = 'button';
        startBtn.className = 'theia-mobile-projects-inline-start';
        startBtn.disabled = true;
        startBtn.innerHTML =
            `<span>${nls.localize('qaap/mobileProjects/inlineStart', 'Start')}</span>` +
            '<span class="theia-mobile-projects-inline-start-key">↵</span>';

        const updateBtn = (): void => {
            const has = input.value.trim().length > 0;
            startBtn.disabled = !has || !canRunTask;
            startBtn.classList.toggle('theia-mod-ready', has && canRunTask);
        };
        input.addEventListener('input', updateBtn);

        const submit = (): void => {
            const draft = input.value.trim();
            if (!draft || !canRunTask) {
                return;
            }
            input.value = '';
            updateBtn();
            this.composerDraft = '';
            void this.submitBackgroundAgentTask(project, draft);
        };
        input.addEventListener('keydown', ev => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                submit();
            }
        });
        startBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            submit();
        });

        wrap.append(caret, input, tuneBtn, startBtn);
        return wrap;
    }

    protected createInlineComposerExpanded(project: MobileProjectEntry, canRunTask: boolean): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-projects-agent-chat-input';
        if (!canRunTask) {
            wrap.classList.add('theia-mod-disabled');
        }
        if (!this.createChatInputWidget || !this.chatService) {
            wrap.textContent = nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.');
            return wrap;
        }
        void this.mountAgentChatInput(project, wrap);
        return wrap;
    }

    protected tuneIconSvg(): string {
        return (
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="1.6" stroke-linecap="round">' +
            '<line x1="4" y1="7" x2="14" y2="7"/><circle cx="17" cy="7" r="2.2"/>' +
            '<line x1="20" y1="13" x2="10" y2="13"/><circle cx="7" cy="13" r="2.2"/>' +
            '<line x1="4" y1="19" x2="14" y2="19"/><circle cx="17" cy="19" r="2.2"/>' +
            '</svg>'
        );
    }

    protected createTaskBlock(
        project: MobileProjectEntry,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
    ): HTMLElement {
        const block = document.createElement('div');
        block.className = 'theia-mobile-projects-tasks-block';
        const tasks = this.tasksForProject(project);
        const head = document.createElement('div');
        head.className = 'theia-mobile-projects-tasks-head';
        const headLabel = document.createElement('span');
        headLabel.textContent = nls.localize('qaap/mobileProjects/conversationsHeading', 'recent chats');
        head.append(headLabel);

        if (tasks.length > 0) {
            const count = document.createElement('span');
            count.className = 'theia-mobile-projects-tasks-count';
            count.textContent = String(tasks.length);
            head.append(count);
        }
        block.append(head);

        if (tasks.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'theia-mobile-projects-tasks-empty';
            empty.textContent = nls.localize(
                'qaap/mobileProjects/conversationsEmpty', 'No recent chats yet. Start one above.'
            );
            block.append(empty);
            return block;
        }

        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-tasks-list';
        for (const task of tasks) {
            list.append(this.createTaskItem(project, task, activeInfo));
        }
        block.append(list);
        return block;
    }

    protected createTaskItem(
        project: MobileProjectEntry,
        task: MobileProjectTaskView,
        _activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
    ): HTMLElement {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theia-mobile-projects-task-item';
        const isRunning = task.state === 'running';
        const isDone = task.state === 'completed';
        const isFailed = task.state === 'failed' || task.state === 'interrupted';
        const stateColor = isRunning
            ? 'var(--theia-charts-green, #4caf7c)'
            : isDone
                ? 'var(--theia-charts-green, #4caf7c)'
                : isFailed
                    ? 'var(--theia-errorForeground, #f14c4c)'
                    : 'var(--theia-descriptionForeground)';
        if (this.justAddedTaskId === task.id) {
            item.classList.add('theia-mod-flash');
        }
        if (isDone) {
            item.classList.add('theia-mod-done');
        }

        const taskDot = document.createElement('span');
        taskDot.className = 'theia-mobile-projects-task-dot';
        taskDot.style.background = stateColor;
        if (isRunning) {
            taskDot.classList.add('theia-mod-pulse');
        }

        const taskBody = document.createElement('div');
        taskBody.className = 'theia-mobile-projects-task-body';

        const taskTitleRow = document.createElement('div');
        taskTitleRow.className = 'theia-mobile-projects-task-title-row';
        const taskTitle = document.createElement('span');
        taskTitle.className = 'theia-mobile-projects-task-title';
        taskTitle.textContent = task.title;
        const taskSince = document.createElement('span');
        taskSince.className = 'theia-mobile-projects-task-since';
        taskSince.textContent = this.formatTaskSince(task);
        taskTitleRow.append(taskTitle, taskSince);
        taskBody.append(taskTitleRow);

        const preview = document.createElement('div');
        preview.className = 'theia-mobile-projects-task-preview';
        preview.textContent = this.taskPreviewText(task, isRunning);
        taskBody.append(preview);

        const footRow = document.createElement('div');
        footRow.className = 'theia-mobile-projects-task-foot';
        const agentId = this.activeTasks?.getDefaultAgent() ?? SHELL_AGENT_ID;
        const agentLabel = this.activeTasks?.getAgents().find(a => a.id === agentId)?.label ?? agentId;
        const agentChip = document.createElement('span');
        agentChip.className = 'theia-mobile-projects-task-agent';
        agentChip.style.color = stateColor;
        agentChip.textContent = agentLabel;
        footRow.append(agentChip);

        const progress = this.pseudoTaskProgress(task);
        if (isRunning && progress > 0) {
            const bar = document.createElement('span');
            bar.className = 'theia-mobile-projects-task-progress-bar';
            const fill = document.createElement('span');
            fill.className = 'theia-mobile-projects-task-progress-fill';
            fill.style.background = stateColor;
            fill.style.width = `${Math.round(progress * 100)}%`;
            bar.append(fill);
            const pct = document.createElement('span');
            pct.className = 'theia-mobile-projects-task-progress-pct';
            pct.textContent = `${Math.round(progress * 100)}%`;
            footRow.append(bar, pct);
        } else {
            const sep = document.createElement('span');
            sep.className = 'theia-mobile-projects-task-foot-sep';
            sep.textContent = '·';
            const stateChip = document.createElement('span');
            stateChip.className = 'theia-mobile-projects-task-state';
            stateChip.style.color = stateColor;
            stateChip.textContent = this.taskStateLabel(task.state);
            footRow.append(sep, stateChip);
        }
        taskBody.append(footRow);

        item.append(taskDot, taskBody);
        item.addEventListener('click', ev => {
            ev.stopPropagation();
            void this.openTaskInAgent(project, task);
        });
        return item;
    }

    protected formatTaskSince(task: MobileProjectTaskView): string {
        const anchor = task.finishedAt ?? task.createdAt;
        if (!anchor) {
            return '';
        }
        const diff = Math.max(0, Date.now() - anchor);
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (task.state === 'running' && diff < 45 * 1000) {
            return nls.localize('qaap/mobileProjects/taskSinceNow', 'just now');
        }
        if (diff < hour) {
            return nls.localize('qaap/mobileProjects/taskSinceMinutes', '{0} min', String(Math.max(1, Math.round(diff / minute))));
        }
        if (diff < day) {
            return nls.localize('qaap/mobileProjects/taskSinceHours', '{0} h', String(Math.round(diff / hour)));
        }
        return nls.localize('qaap/mobileProjects/taskSinceDays', '{0} d', String(Math.round(diff / day)));
    }

    protected taskPreviewText(task: MobileProjectTaskView, isRunning: boolean): string {
        const command = task.command?.trim();
        if (command && command !== task.title) {
            return command.length > 120 ? `${command.slice(0, 117)}…` : command;
        }
        if (isRunning) {
            return nls.localize(
                'qaap/mobileProjects/taskPreviewStarting', 'Starting up — reading project context…'
            );
        }
        if (task.state === 'completed') {
            return nls.localize('qaap/mobileProjects/chatPreviewOpen', 'Open to read this chat.');
        }
        if (task.state === 'failed' || task.state === 'interrupted') {
            return nls.localize('qaap/mobileProjects/taskPreviewFailed', 'Task stopped — open to inspect.');
        }
        return task.title;
    }

    protected taskStateLabel(state: string): string {
        switch (state) {
            case 'running':
                return nls.localize('qaap/mobileProjects/taskStateRunning', 'running');
            case 'completed':
                return nls.localize('qaap/mobileProjects/taskStateChat', 'chat');
            case 'failed':
            case 'interrupted':
                return nls.localize('qaap/mobileProjects/taskStateFailed', 'failed');
            default:
                return state;
        }
    }

    protected pseudoTaskProgress(task: MobileProjectTaskView): number {
        if (task.state !== 'running') {
            return 0;
        }
        const elapsedMin = Math.max(0, Date.now() - task.createdAt) / 60_000;
        return Math.min(0.92, 0.04 + elapsedMin * 0.06);
    }

    /**
     * Tap on a task in the landing: dismiss the dashboard and ask the hub to bring up the Agent on
     * this task. The hub action handles the cross-workspace case: if the task lives in a different
     * project it persists a pending action, switches the workspace (page reload), and replays it
     * once the new session boots.
     */
    protected async openTaskInAgent(project: MobileProjectEntry, task?: MobileProjectTaskView): Promise<void> {
        // Task ids now correspond to conversation ids — tap opens the transcript sheet in-place so
        // the user can read/continue the conversation without switching workspaces.
        if (task && this.conversations) {
            const summary = this.conversationsForProject(project).find(c => c.id === task.id);
            if (summary) {
                if (summary.source === 'theia-chat') {
                    await this.openTheiaChatTranscriptSheet(project, summary);
                    return;
                }
                await this.openTranscriptSheet(project, summary);
                return;
            }
        }
        const entry = task ? { ...project, task: task.title } : project;
        this.hide();
        this.delegate.onDismiss();
        await this.delegate.onOpenAgentOnTask?.(entry);
    }

    protected buildCardMenu(
        project: MobileProjectEntry,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
    ): HTMLElement {
        const canRunTask = !!this.projectsService.getProjectCwd(project) || !!project.github;

        const menu = document.createElement('div');
        menu.className = 'theia-mobile-projects-card-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/runTask', 'Run background task'),
            disabled: !canRunTask,
            onSelect: () => { void this.openAgentComposer(project); },
        });
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/viewActiveLog', 'View active log'),
            disabled: !activeInfo?.taskId,
            onSelect: () => {
                if (activeInfo?.taskId) {
                    void this.showTaskLog(project, activeInfo.taskId);
                }
            },
        });

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/cancelActiveTask', 'Cancel active task'),
            danger: true,
            disabled: !activeInfo?.taskId,
            onSelect: () => {
                if (activeInfo?.taskId) {
                    void this.cancelActiveTask(activeInfo.taskId);
                }
            },
        });

        if (project.previewUrl || project.isCurrent) {
            this.appendCardMenuItem(menu, {
                label: nls.localize('qaap/mobileProjects/openPreview', 'Open preview'),
                disabled: !this.delegate.onResumePreview,
                onSelect: () => {
                    this.closeCardMenu();
                    void this.delegate.onResumePreview?.(project);
                },
            });
        }

        const taskSeparator = document.createElement('div');
        taskSeparator.className = 'theia-mobile-projects-card-menu-separator';
        taskSeparator.setAttribute('role', 'separator');
        menu.append(taskSeparator);

        this.appendCardMenuItem(menu, {
            label: project.pinned
                ? nls.localize('qaap/mobileProjects/unpin', 'Unpin')
                : nls.localize('qaap/mobileProjects/pin', 'Pin'),
            onSelect: () => { void this.onTogglePin(project); },
        });

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/rename', 'Rename'),
            onSelect: () => { void this.onRenameProject(project); },
        });

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/duplicate', 'Duplicate'),
            onSelect: () => { void this.onDuplicateProject(project); },
        });

        const separator = document.createElement('div');
        separator.className = 'theia-mobile-projects-card-menu-separator';
        separator.setAttribute('role', 'separator');
        menu.append(separator);

        const canRemove = this.projectsService.canRemove(project);
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/remove', 'Remove'),
            danger: true,
            disabled: !canRemove,
            title: !canRemove && project.github
                ? nls.localize('qaap/mobileProjects/removeGithubDisabled', 'GitHub repositories stay visible in Projects')
                : !canRemove
                ? nls.localize('qaap/mobileProjects/removeCurrentDisabled', 'Cannot remove the active workspace')
                : undefined,
            onSelect: () => { void this.onRemoveProject(project); },
        });

        // The kebab button itself is built by the caller (createRow) — buildCardMenu only owns the menu.
        return menu;
    }

    protected createFootButton(
        label: string,
        iconClass: string,
        modifier: 'theia-mod-primary' | 'theia-mod-secondary' | 'theia-mod-accent',
        onClick: () => void,
        disabled = false,
    ): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `theia-mobile-projects-foot-btn ${modifier}`;
        btn.disabled = disabled;
        const icon = document.createElement('span');
        icon.className = `codicon ${iconClass}`;
        icon.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.className = 'theia-mobile-projects-foot-btn-label';
        text.textContent = label;
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.append(icon, text);
        btn.addEventListener('click', ev => {
            ev.stopPropagation();
            onClick();
        });
        return btn;
    }

    protected createQuickActions(project: MobileProjectEntry): HTMLElement | undefined {
        const showPreview = !!project.previewUrl || project.isCurrent;
        const showAgent = !!project.task?.trim() && project.task !== '—';
        if (!showPreview && !showAgent) {
            return undefined;
        }
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-quick';
        row.addEventListener('click', ev => ev.stopPropagation());

        if (showPreview && this.delegate.onResumePreview) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-quick-btn';
            btn.innerHTML = '<span class="codicon codicon-preview" aria-hidden="true"></span> ' +
                nls.localize('qaap/mobileProjects/resumePreview', 'Resume preview');
            btn.addEventListener('click', ev => {
                ev.stopPropagation();
                void this.delegate.onResumePreview?.(project);
            });
            row.append(btn);
        }
        if (showAgent && this.delegate.onOpenAgentOnTask) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-quick-btn theia-mod-secondary';
            btn.innerHTML = '<span class="codicon codicon-comment-discussion" aria-hidden="true"></span> ' +
                nls.localize('qaap/mobileProjects/openAgent', 'Open agent');
            btn.addEventListener('click', ev => {
                ev.stopPropagation();
                void this.delegate.onOpenAgentOnTask?.(project);
            });
            row.append(btn);
        }
        return row.childElementCount > 0 ? row : undefined;
    }

    protected toggleCardMenu(card: HTMLElement, menu: HTMLElement, menuBtn: HTMLButtonElement): void {
        if (this.openMenu === menu) {
            this.closeCardMenu();
            return;
        }
        this.closeCardMenu();
        this.openMenu = menu;
        this.openMenuAnchor = menuBtn;
        this.openMenuCard = card;
        menu.hidden = false;
        menu.classList.add('theia-mod-open', 'theia-mod-floating');
        this.root.appendChild(menu);
        menuBtn.setAttribute('aria-expanded', 'true');
        card.classList.add('theia-mod-menu-open');
        window.requestAnimationFrame(() => {
            if (this.openMenu === menu) {
                this.positionCardMenu(menu, menuBtn);
            }
        });
        this.scroll.addEventListener('scroll', this.onScrollWhileMenuOpen, { passive: true });
        window.addEventListener('resize', this.onWindowResizeWhileMenuOpen);
        this.openMenuRepositionDispose.dispose();
        this.openMenuRepositionDispose = Disposable.create(() => {
            this.scroll.removeEventListener('scroll', this.onScrollWhileMenuOpen);
            window.removeEventListener('resize', this.onWindowResizeWhileMenuOpen);
        });
    }

    protected closeCardMenu(): void {
        if (!this.openMenu) {
            return;
        }
        const menu = this.openMenu;
        const card = this.openMenuCard ?? menu.closest('.theia-mobile-projects-card');
        const menuBtn = card?.querySelector('.theia-mobile-projects-card-menu-btn');
        menu.hidden = true;
        menu.classList.remove('theia-mod-open', 'theia-mod-floating');
        this.clearCardMenuPosition(menu);
        if (card && card.contains(menu) === false) {
            card.appendChild(menu);
        }
        card?.classList.remove('theia-mod-menu-open');
        if (menuBtn instanceof HTMLButtonElement) {
            menuBtn.setAttribute('aria-expanded', 'false');
        }
        this.openMenuRepositionDispose.dispose();
        this.openMenuRepositionDispose = Disposable.NULL;
        this.openMenu = undefined;
        this.openMenuAnchor = undefined;
        this.openMenuCard = undefined;
    }

    /** Fixed layer above the projects panel so overflow on the scroll area does not clip options. */
    protected positionCardMenu(menu: HTMLElement, anchor: HTMLElement): void {
        const margin = 8;
        const gap = 4;
        const anchorRect = anchor.getBoundingClientRect();
        const menuWidth = Math.max(menu.offsetWidth, 168);
        const menuHeight = menu.offsetHeight;
        let top = anchorRect.bottom + gap;
        const maxBottom = window.innerHeight - margin;
        if (top + menuHeight > maxBottom) {
            const aboveTop = anchorRect.top - gap - menuHeight;
            top = aboveTop >= margin ? aboveTop : Math.max(margin, maxBottom - menuHeight);
        }
        let left = anchorRect.right - menuWidth;
        left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
    }

    protected clearCardMenuPosition(menu: HTMLElement): void {
        menu.style.top = '';
        menu.style.left = '';
        menu.style.right = '';
        menu.style.bottom = '';
        menu.style.position = '';
        menu.style.zIndex = '';
    }

    protected appendCardMenuItem(
        menu: HTMLElement,
        options: {
            label: string;
            disabled?: boolean;
            danger?: boolean;
            title?: string;
            onSelect: () => void;
        }
    ): void {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theia-mobile-projects-card-menu-item';
        if (options.danger) {
            item.classList.add('theia-mod-danger');
        }
        item.setAttribute('role', 'menuitem');
        item.textContent = options.label;
        item.disabled = !!options.disabled;
        if (options.title) {
            item.title = options.title;
        }
        item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!item.disabled) {
                options.onSelect();
            }
        });
        menu.append(item);
    }

    protected async onTogglePin(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        this.projectsService.togglePin(project);
        this.projects = await this.projectsService.loadProjects();
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected async onRenameProject(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const renamed = await this.projectsService.renameProject(project);
        if (!renamed) {
            return;
        }
        this.projects = await this.projectsService.loadProjects();
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected async onDuplicateProject(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const duplicated = await this.projectsService.duplicateProject(project);
        if (!duplicated) {
            return;
        }
        this.projects = await this.projectsService.loadProjects();
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected async onRemoveProject(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const removed = await this.projectsService.removeProject(project);
        if (!removed) {
            return;
        }
        this.projects = await this.projectsService.loadProjects();
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected async openAgentComposer(project: MobileProjectEntry, draft?: string): Promise<void> {
        this.closeCardMenu();
        this.expandedId = project.id;
        this.composerExpanded = true;
        this.composerDraft = draft ?? this.composerDraft;
        this.renderList();
    }

    protected async ensureInlineComposerCwd(project: MobileProjectEntry): Promise<string | undefined> {
        let cwd = this.projectsService.getProjectCwd(project);
        if (!cwd && project.github) {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/preparingRepo', 'Preparing {0}…', project.name),
                { kind: 'loading' }
            );
            cwd = await this.projectsService.prepareProjectCwd(project);
            MobileSnackbar.dismiss();
        }
        if (!cwd) {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/runTaskNoCwd', 'Open or clone this project before running a background task.'),
                { duration: 2800 }
            );
            return undefined;
        }
        this.preparedCwdByProjectId.set(project.id, cwd);
        return cwd;
    }

    protected async submitBackgroundAgentTask(project: MobileProjectEntry, draft: string): Promise<void> {
        const cwd = await this.ensureInlineComposerCwd(project);
        if (!cwd) {
            return;
        }
        const agents = this.activeTasks?.getAgents() ?? [];
        const agent = reconcileSelectedAgent(
            readStoredAgent(cwd),
            agents,
            this.activeTasks?.getDefaultAgent(),
            cwd,
        );
        try {
            // Each inline submission opens a fresh conversation — the Antigravity-style "fan out
            // parallel sessions" UX. To continue an existing thread the user taps it to open the
            // transcript sheet and types from there.
            const conv = await createConversation({ cwd, agent, message: draft });
            this.conversations?.recordSnapshot(conversationToSummary(conv));
            this.applyTaskStartedToProject(cwd, draft, conv.id);
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/conversationStarted', 'Conversation started'),
                { kind: 'success', duration: 1400 }
            );
            // Drop the user straight into the new conversation so the agent reply is visible as
            // soon as it streams back. The sheet lives inside this panel — no workspace switch.
            void this.openTranscriptSheet(project, conversationToSummary(conv));
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/conversationStartFailed',
                'Could not start conversation: {0}',
                detail
            ));
        }
    }

    protected applyTaskStartedToProject(cwd: string, title: string, taskId: string): void {
        this.projects = this.projects.map(project => {
            const projectCwd = this.preparedCwdByProjectId.get(project.id)
                ?? this.projectsService.getProjectCwd(project);
            if (projectCwd !== cwd && !this.activeTasks?.findTasksForProject(project).some(task => task.id === taskId)) {
                return project;
            }
            this.preparedCwdByProjectId.set(project.id, cwd);
            return {
                ...project,
                status: 'working' as const,
                task: title,
                lastActive: nls.localize('qaap/mobileProjects/lastActiveNow', 'now'),
                progress: Math.max(project.progress, 0.04),
            };
        });
        this.justAddedTaskId = taskId;
        this.renderList();
        this.renderSubtitle();
        this.delegate.onProjectsChanged?.();
        window.setTimeout(() => {
            if (this.justAddedTaskId === taskId) {
                this.justAddedTaskId = undefined;
                this.renderList();
            }
        }, 1400);
    }

    protected async mountAgentChatInput(project: MobileProjectEntry, host: HTMLElement): Promise<void> {
        if (!this.createChatInputWidget || !this.chatService) {
            host.textContent = nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.');
            return;
        }
        host.textContent = nls.localize('qaap/mobileProjects/agentInputLoading', 'Loading agent input…');
        // Fresh widget every mount: WidgetManager caches by `id + JSON(options)`. A previously
        // disposed instance returned from the cache mounts into the DOM but its React tree is
        // gone — that was the empty rounded-card symptom.
        const uniqueId = `${project.id}-${++this.agentChatInputMountSeq}-${Date.now()}`;
        let widget: AIChatInputWidget;
        try {
            widget = await this.createChatInputWidget(uniqueId);
        } catch (error) {
            console.error('[qaap-mobile-projects] createChatInputWidget threw:', error);
            host.textContent = `Agent input failed to load: ${error instanceof Error ? error.message : String(error)}`;
            return;
        }
        // CRITICAL: every AIChatInputWidget hard-codes `this.id = AIChatInputWidget.ID` in its
        // postConstruct. The workspace Agent AI view already mounts an instance with that id;
        // creating a second one in this panel collides on Lumino's widget registry and our
        // instance gets silently shadowed (the workspace's widget keeps the DOM, our host stays
        // empty). Override the id with a unique one *before* attaching so both widgets coexist.
        widget.id = `mobile-projects-chat-input-${uniqueId}`;
        console.info('[qaap-mobile-projects] created widget', widget.id, 'isDisposed=', widget.isDisposed);
        if (!this.composerExpanded || this.expandedId !== project.id || !host.isConnected) {
            widget.dispose();
            return;
        }
        host.replaceChildren();
        // Attach FIRST, configure SECOND. The chatModel/pinnedAgent setters call `update()` which
        // enqueues a render in Lumino's MessageLoop — but the MessageLoop only flushes updates
        // for widgets that are already attached. Configuring before attach silently drops that
        // first render and leaves the widget empty.
        if (widget.node.parentElement && widget.node.parentElement !== host) {
            LuminoWidget.detach(widget);
        }
        if (!widget.node.parentElement) {
            LuminoWidget.attach(widget, host);
        }
        widget.node.classList.add('chat-input-widget', 'theia-mobile-projects-real-agent-input');
        // Lumino widgets start with `lm-mod-hidden` (display: none). show() removes it; without
        // this, the widget renders fine internally but the outer host clips it to zero height.
        widget.show();

        const session = this.ensureAgentChatSession();
        widget.chatModel = session.model;
        widget.pinnedAgent = session.pinnedAgent;
        widget.initialValue = this.composerDraft
            ? (this.composerDraft.startsWith('@') ? this.composerDraft : `@Coder ${this.composerDraft}`)
            : '@Coder ';
        widget.setEnabled(true);
        widget.onQuery = async (query: string, _modeId?: string, _capabilityOverrides?: Record<string, boolean>,
            _genericCapabilitySelections?: GenericCapabilitySelections) => {
            const cleaned = query.replace(/^@Coder\s+/i, '').trim() || query.trim();
            if (!cleaned) {
                return;
            }
            widget.clearPendingImageAttachments();
            this.composerExpanded = false;
            this.composerDraft = '';
            await this.submitBackgroundAgentTask(project, cleaned);
        };
        widget.onCancel = (requestModel: ChatRequestModel) => {
            void this.chatService?.cancelRequest(requestModel.session.id, requestModel.id);
        };
        widget.onUnpin = () => {
            session.pinnedAgent = undefined;
            widget.pinnedAgent = undefined;
        };
        widget.onDeleteChangeSet = ((sessionId: string) => {
            this.chatService?.deleteChangeSet(sessionId);
        }) as unknown as (requestModel: ChatRequestModel) => void;
        widget.onDeleteChangeSetElement = ((sessionId: string, uri: Parameters<ChatService['deleteChangeSetElement']>[1]) => {
            this.chatService?.deleteChangeSetElement(sessionId, uri);
        }) as unknown as (requestModel: ChatRequestModel, index: number) => void;

        this.agentChatInputWidget = widget;
        widget.activate();
        widget.update();
    }

    /** @deprecated Logic merged into {@link mountAgentChatInput}; kept as no-op for callers. */
    protected async ensureAgentChatInput(_project: MobileProjectEntry): Promise<AIChatInputWidget> {
        throw new Error('ensureAgentChatInput is no longer used — call mountAgentChatInput directly.');
    }

    protected ensureAgentChatSession(): ChatSession {
        if (this.agentChatInputSession) {
            return this.agentChatInputSession;
        }
        const coderAgent = this.chatAgentService?.getAgent('Coder');
        const session = this.chatService!.createSession(ChatAgentLocation.Panel, { focus: false }, coderAgent);
        this.agentChatInputSession = session;
        return session;
    }

    protected disposeAgentChatInput(): void {
        if (this.agentChatInputWidget && !this.agentChatInputWidget.isDisposed) {
            this.agentChatInputWidget.dispose();
        }
        this.agentChatInputWidget = undefined;
    }

    protected activeInfoForProject(project: MobileProjectEntry): ReturnType<MobileProjectsActiveTasks['getForCwd']> {
        const cwd = this.projectsService.getProjectCwd(project);
        return cwd && this.activeTasks ? this.activeTasks.getForCwd(cwd) : undefined;
    }

    protected async cancelActiveTask(taskId: string): Promise<void> {
        this.closeCardMenu();
        try {
            const response = await fetch(`/qaap/api/agent-tasks/${encodeURIComponent(taskId)}/cancel`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                this.activeTasks?.recordTaskEnded(await response.json());
                MobileSnackbar.show(
                    nls.localize('qaap/mobileProjects/taskCancelled', 'Task cancelled'),
                    { duration: 1400 }
                );
            }
        } finally {
            this.projects = await this.projectsService.loadProjects();
            this.render();
            this.delegate.onProjectsChanged?.();
        }
    }

    protected async showTaskLog(project: MobileProjectEntry, taskId: string): Promise<void> {
        this.closeCardMenu();
        const root = document.createElement('div');
        root.className = 'theia-mobile-agent-log theia-mod-visible';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-agent-log-backdrop';
        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-agent-log-sheet';
        const header = document.createElement('header');
        header.className = 'theia-mobile-agent-log-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/activeLogTitle', '{0} log', project.name);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-agent-log-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileProjects/closeLog', 'Close');
        close.setAttribute('aria-label', close.title);
        const pre = document.createElement('pre');
        pre.className = 'theia-mobile-agent-log-output';
        pre.textContent = nls.localize('qaap/mobileProjects/loadingLog', 'Loading...');
        const dispose = (): void => root.remove();
        close.addEventListener('click', dispose);
        backdrop.addEventListener('click', dispose);
        header.append(title, close);
        sheet.append(header, pre);
        root.append(backdrop, sheet);
        this.root.append(root);
        try {
            const response = await fetch(`/qaap/api/agent-tasks/${encodeURIComponent(taskId)}`, { credentials: 'include' });
            if (response.ok) {
                const detail = await response.json() as { log?: string };
                pre.textContent = detail.log || nls.localize('qaap/mobileProjects/noLogOutput', '(no output yet)');
            } else {
                pre.textContent = response.statusText;
            }
        } catch (error) {
            pre.textContent = error instanceof Error ? error.message : String(error);
        }
    }

    protected createAgentStack(agents: MobileProjectEntry['agents']): HTMLElement {
        const stack = document.createElement('span');
        stack.className = 'theia-mobile-projects-agents';
        agents.forEach((agent, i) => {
            const chip = document.createElement('span');
            chip.className = 'theia-mobile-projects-agent';
            chip.style.background = agent.color;
            chip.style.marginLeft = i > 0 ? '-4px' : '0';
            chip.textContent = agent.role[0]?.toUpperCase() ?? '?';
            stack.append(chip);
        });
        return stack;
    }

    async showOpenRepositoryDialog(): Promise<void> {
        await this.onNewClick();
    }

    async openProject(project: MobileProjectEntry): Promise<void> {
        if (project.isCurrent) {
            // Active workspace: dismiss the landing/sheet entirely so the user transitions into the
            // workspace view. Even in home/landing mode the user is explicitly opting in here.
            this.hide();
            this.delegate.onDismiss();
            await this.delegate.onCurrentProjectActivated?.(project);
            return;
        }
        // Persist before any async clone/open so a reload always skips the landing dashboard.
        markMobileProjectsPanelDismiss();
        let openedViaReload = false;
        try {
            if (project.github || project.uri) {
                openedViaReload = true;
                await this.projectsService.openInCurrentWindowAsync(project);
            } else {
                const openFolder = WorkspaceCommands.OPEN_FOLDER.id;
                if (this.commands.getCommand(openFolder)) {
                    markMobileProjectReadmeForOpen();
                    await this.commands.executeCommand(openFolder);
                }
            }
        } finally {
            if (openedViaReload) {
                // Home landing stays up during clone; sessionStorage + reload dismiss it.
                return;
            }
            this.dismissPanelIfSheet();
            if (this.homeMode) {
                this.delegate.onWorkspaceOpened?.();
            }
        }
    }

    /**
     * Show the transcript of a conversation in a modal sheet docked inside the projects panel.
     * The agent is still running server-side, so this works even when no workspace is open and
     * even when the user is in a different project's workspace — that is the whole point of the
     * persistent-conversations model.
     */
    protected async openTranscriptSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeTranscriptSheet();
        const root = document.createElement('div');
        root.className = 'theia-mobile-agent-log theia-mobile-agent-transcript-root theia-mod-visible';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-agent-log-backdrop';
        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-agent-log-sheet theia-mod-transcript';
        const header = document.createElement('header');
        header.className = 'theia-mobile-agent-log-header';
        const title = document.createElement('h2');
        title.textContent = summary.title || project.name;
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-agent-log-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileProjects/closeTranscript', 'Close');
        close.setAttribute('aria-label', close.title);
        header.append(title, close);

        const transcript = document.createElement('div');
        transcript.className = 'theia-mobile-agent-transcript';
        transcript.textContent = nls.localize('qaap/mobileProjects/loadingTranscript', 'Loading…');

        const composer = document.createElement('div');
        composer.className = 'theia-mobile-agent-transcript-chat-input';
        composer.textContent = nls.localize('qaap/mobileProjects/agentInputLoading', 'Loading agent input…');

        sheet.append(header, transcript, composer);
        root.append(backdrop, sheet);
        document.body.append(root);
        this.transcriptSheet = root;

        const refresh = async (): Promise<void> => {
            try {
                const full = await getConversation(summary.id);
                this.renderTranscriptMessages(transcript, full);
            } catch (error) {
                transcript.textContent = error instanceof Error ? error.message : String(error);
            }
        };
        const subscription = this.conversations?.onDidChange(() => { void refresh(); });
        this.transcriptSheetDispose = Disposable.create(() => {
            subscription?.dispose();
        });
        void refresh();

        const dismiss = (): void => this.closeTranscriptSheet();
        close.addEventListener('click', dismiss);
        backdrop.addEventListener('click', dismiss);

        void this.mountTranscriptChatInput(project, summary, composer, async content => {
            const full = await postConversationMessage(summary.id, content);
            this.renderTranscriptMessages(transcript, full);
            this.conversations?.recordSnapshot(conversationToSummary(full));
        });
    }

    protected async openTheiaChatTranscriptSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeTranscriptSheet();
        const root = document.createElement('div');
        root.className = 'theia-mobile-agent-log theia-mobile-agent-transcript-root theia-mod-visible';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-agent-log-backdrop';
        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-agent-log-sheet theia-mod-transcript';
        const header = document.createElement('header');
        header.className = 'theia-mobile-agent-log-header';
        const title = document.createElement('h2');
        title.textContent = summary.title || project.name;
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-agent-log-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileProjects/closeTranscript', 'Close');
        close.setAttribute('aria-label', close.title);
        header.append(title, close);

        const chatHost = document.createElement('div');
        chatHost.className = 'theia-mobile-agent-transcript-real-chat';
        chatHost.textContent = nls.localize('qaap/mobileProjects/loadingTranscript', 'Loading…');

        sheet.append(header, chatHost);
        root.append(backdrop, sheet);
        document.body.append(root);
        this.transcriptSheet = root;

        const dismiss = (): void => this.closeTranscriptSheet();
        close.addEventListener('click', dismiss);
        backdrop.addEventListener('click', dismiss);
        const previousActiveSessionId = this.chatService?.getActiveSession()?.id;

        try {
            if (!this.createChatViewWidget || !this.chatService || !summary.sessionId) {
                throw new Error(nls.localize('qaap/mobileProjects/agentViewUnavailable', 'Agent chat is unavailable.'));
            }
            const session = await this.getOrRestoreProjectChatSession(project, summary);
            if (!session) {
                throw new Error(nls.localize('qaap/mobileProjects/transcriptUnavailable', 'This chat could not be loaded.'));
            }
            const uniqueId = `transcript-${project.id}-${summary.id}-${++this.agentChatInputMountSeq}-${Date.now()}`;
            const widget = await this.createChatViewWidget(uniqueId);
            if (!this.transcriptSheet || !chatHost.isConnected) {
                widget.dispose();
                return;
            }
            this.transcriptChatViewWidget = widget;
            chatHost.replaceChildren();
            this.chatService.setActiveSession(session.id, { focus: false });
            if (widget.node.parentElement && widget.node.parentElement !== chatHost) {
                LuminoWidget.detach(widget);
            }
            if (!widget.node.parentElement) {
                LuminoWidget.attach(widget, chatHost);
            }
            widget.show();
            widget.update();
            widget.activate();
            this.transcriptSheetDispose = Disposable.create(() => {
                if (previousActiveSessionId && this.chatService?.getSession(previousActiveSessionId)) {
                    this.chatService.setActiveSession(previousActiveSessionId, { focus: false });
                }
            });
        } catch (error) {
            chatHost.textContent = error instanceof Error ? error.message : String(error);
            this.transcriptSheetDispose = Disposable.NULL;
        }
    }

    protected async getOrRestoreProjectChatSession(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<ChatSession | undefined> {
        if (!this.chatService || !summary.sessionId) {
            return undefined;
        }
        const restored = await this.chatService.getOrRestoreSession(summary.sessionId);
        return restored ?? this.restoreTheiaChatSessionFromProjectsStorage(project, summary);
    }

    protected async restoreTheiaChatSessionFromProjectsStorage(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<ChatSession | undefined> {
        if (!this.chatService || !summary.sessionId || !this.conversations) {
            return undefined;
        }
        const existing = this.chatService.getSession(summary.sessionId);
        if (existing) {
            return existing;
        }
        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const raw = summary.id.startsWith('theia-chat:')
            ? await this.conversations.getTheiaSerializedConversation(summary.id)
            : await this.conversations.findTheiaSerializedConversationBySessionId(summary.sessionId, cwd)
                ?? await this.conversations.findTheiaSerializedConversationBySessionId(summary.sessionId);
        if (!isRestorableTheiaChatData(raw)) {
            return undefined;
        }

        const model = new MutableChatModel(raw.model);
        const service = this.chatService as ChatService & {
            _sessions?: ChatSession[];
            restoreSessionData?: (model: MutableChatModel, data: RestorableTheiaChatData['model']) => Promise<void>;
            setupAutoSaveForSession?: (session: ChatSession) => void;
        };
        await service.restoreSessionData?.(model, raw.model);
        const pinnedAgent = raw.pinnedAgentId ? this.chatAgentService?.getAgent(raw.pinnedAgentId) : undefined;
        const session: ChatSession = {
            id: summary.sessionId,
            title: raw.title ?? summary.title,
            lastInteraction: new Date(raw.saveDate ?? summary.updatedAt),
            model,
            isActive: false,
            pinnedAgent,
        };
        if (!Array.isArray(service._sessions)) {
            return undefined;
        }
        service._sessions.push(session);
        service.setupAutoSaveForSession?.(session);
        return session;
    }

    protected async getChatServiceConversation(summary: QaapAgentConversationSummaryDTO): Promise<QaapAgentConversationDTO | undefined> {
        const sessionId = summary.sessionId;
        if (!sessionId || !this.chatService) {
            return undefined;
        }
        const session = await this.chatService.getOrRestoreSession(sessionId);
        if (!session) {
            return undefined;
        }
        const messages: QaapAgentConversationDTO['messages'] = [];
        let offset = 0;
        for (const request of session.model.getRequests()) {
            const userText = request.request.text?.trim();
            if (userText) {
                messages.push({
                    id: `${request.id}:user`,
                    role: 'user',
                    content: userText,
                    createdAt: summary.updatedAt + offset++,
                });
            }
            const agentText = request.response.response.asString().trim();
            if (agentText) {
                messages.push({
                    id: `${request.id}:agent`,
                    role: 'agent',
                    content: agentText,
                    createdAt: summary.updatedAt + offset++,
                });
            }
        }
        return {
            id: summary.id,
            cwd: summary.cwd,
            agentId: summary.agentId,
            title: summary.title,
            status: 'idle',
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt,
            messages,
        };
    }

    protected async mountTranscriptChatInput(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        host: HTMLElement,
        submit: (content: string, modeId?: string, capabilityOverrides?: Record<string, boolean>,
            genericCapabilitySelections?: GenericCapabilitySelections, widget?: AIChatInputWidget) => Promise<void>,
    ): Promise<void> {
        if (!this.createChatInputWidget || !this.chatService) {
            host.textContent = nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.');
            return;
        }
        if (this.transcriptChatInputWidget && !this.transcriptChatInputWidget.isDisposed) {
            this.transcriptChatInputWidget.dispose();
        }
        this.transcriptChatInputWidget = undefined;

        const uniqueId = `transcript-${project.id}-${summary.id}-${++this.agentChatInputMountSeq}-${Date.now()}`;
        let widget: AIChatInputWidget;
        try {
            widget = await this.createChatInputWidget(uniqueId);
        } catch (error) {
            console.error('[qaap-mobile-projects] transcript createChatInputWidget threw:', error);
            host.textContent = `Agent input failed to load: ${error instanceof Error ? error.message : String(error)}`;
            return;
        }
        widget.id = `mobile-projects-transcript-chat-input-${uniqueId}`;
        if (!this.transcriptSheet || !host.isConnected) {
            widget.dispose();
            return;
        }

        host.replaceChildren();
        if (widget.node.parentElement && widget.node.parentElement !== host) {
            LuminoWidget.detach(widget);
        }
        if (!widget.node.parentElement) {
            LuminoWidget.attach(widget, host);
        }
        widget.node.classList.add('chat-input-widget', 'theia-mobile-projects-real-agent-input');
        widget.show();

        const restoredSession = summary.sessionId && summary.id.startsWith('theia-chat')
            ? await this.chatService.getOrRestoreSession(summary.sessionId)
            : undefined;
        const session = restoredSession ?? this.ensureAgentChatSession();
        widget.chatModel = session.model;
        widget.pinnedAgent = session.pinnedAgent;
        widget.initialValue = '';
        widget.setEnabled(true);
        widget.onQuery = async (query: string, modeId?: string, capabilityOverrides?: Record<string, boolean>,
            genericCapabilitySelections?: GenericCapabilitySelections) => {
            const cleaned = query.trim();
            if (!cleaned) {
                return;
            }
            try {
                await submit(cleaned, modeId, capabilityOverrides, genericCapabilitySelections, widget);
                widget.clearPendingImageAttachments();
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                this.messageService?.error(nls.localize(
                    'qaap/mobileProjects/transcriptSendFailed', 'Could not send: {0}', detail
                ));
            }
        };
        widget.onCancel = (requestModel: ChatRequestModel) => {
            void this.chatService?.cancelRequest(requestModel.session.id, requestModel.id);
        };
        widget.onUnpin = () => {
            session.pinnedAgent = undefined;
            widget.pinnedAgent = undefined;
        };
        widget.onDeleteChangeSet = ((sessionId: string) => {
            this.chatService?.deleteChangeSet(sessionId);
        }) as unknown as (requestModel: ChatRequestModel) => void;
        widget.onDeleteChangeSetElement = ((sessionId: string, uri: Parameters<ChatService['deleteChangeSetElement']>[1]) => {
            this.chatService?.deleteChangeSetElement(sessionId, uri);
        }) as unknown as (requestModel: ChatRequestModel, index: number) => void;

        this.transcriptChatInputWidget = widget;
        widget.activate();
        widget.update();
    }

    protected renderTranscriptMessages(host: HTMLElement, conv: QaapAgentConversationDTO): void {
        host.replaceChildren();
        if (conv.messages.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'theia-mobile-agent-transcript-empty';
            empty.textContent = nls.localize('qaap/mobileProjects/transcriptEmpty', 'No messages yet.');
            host.append(empty);
            return;
        }
        for (const msg of conv.messages) {
            const row = document.createElement('div');
            row.className = `theia-mobile-agent-transcript-msg theia-mod-${msg.role}`;
            const role = document.createElement('div');
            role.className = 'theia-mobile-agent-transcript-role';
            role.textContent = msg.role === 'user'
                ? nls.localize('qaap/mobileProjects/transcriptYou', 'You')
                : nls.localize('qaap/mobileProjects/transcriptAgent', 'Agent');
            const content = document.createElement('div');
            content.className = 'theia-mobile-agent-transcript-content';
            content.textContent = msg.content;
            row.append(role, content);
            if (msg.error) {
                const err = document.createElement('div');
                err.className = 'theia-mobile-agent-transcript-error';
                err.textContent = msg.error;
                row.append(err);
            }
            host.append(row);
        }
        if (conv.status === 'streaming') {
            const pending = document.createElement('div');
            pending.className = 'theia-mobile-agent-transcript-msg theia-mod-agent theia-mod-streaming';
            pending.textContent = nls.localize('qaap/mobileProjects/transcriptStreaming', 'Agent is working…');
            host.append(pending);
        }
        host.scrollTop = host.scrollHeight;
    }

    protected closeTranscriptSheet(): void {
        this.transcriptSheetDispose.dispose();
        this.transcriptSheetDispose = Disposable.NULL;
        if (this.transcriptChatInputWidget && !this.transcriptChatInputWidget.isDisposed) {
            this.transcriptChatInputWidget.dispose();
        }
        this.transcriptChatInputWidget = undefined;
        if (this.transcriptChatViewWidget && !this.transcriptChatViewWidget.isDisposed) {
            this.transcriptChatViewWidget.dispose();
        }
        this.transcriptChatViewWidget = undefined;
        this.transcriptSheet?.remove();
        this.transcriptSheet = undefined;
    }


    /** Sheet overlay only — home dashboard stays visible until the workspace reloads. */
    protected dismissPanelIfSheet(): void {
        if (this.homeMode) {
            return;
        }
        this.hide();
        this.delegate.onDismiss();
    }
}
