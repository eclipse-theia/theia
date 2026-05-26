// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { MessageService } from '@theia/core/lib/common/message-service';
import { generateUuid } from '@theia/core/lib/common/uuid';
import { ConfirmDialog } from '@theia/core/lib/browser';
import { SingleTextInputDialog } from '@theia/core/lib/browser/dialogs';
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
import { MobileProjectsConversationFlags } from './mobile-projects-conversation-flags';
import { MobileProjectsService } from './mobile-projects-service';
import {
    QaapAgentConversationDTO,
    QaapAgentConversationSummaryDTO,
    cancelConversation,
    conversationToSummary,
    deleteConversation,
    forkConversation,
    getConversation,
    postConversationMessage,
    renameConversation,
    updateConversation,
} from '../common/qaap-agent-conversation-client';
import { markMobileProjectReadmeForOpen, markMobileProjectsPanelDismiss } from './mobile-projects-open';
import { MobileOpenRepositoryDialog } from './mobile-open-repository-dialog';
import {
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
    /**
     * Browser-local store of per-conversation priority/pause overrides for Theia-chat sessions
     * (the VPS conversation store handles its own flags). Optional — when omitted the menu items
     * fall back to no-op.
     */
    conversationFlags?: MobileProjectsConversationFlags;
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
    /**
     * True when the expansion was driven by the user (vs. the auto-expand of the current workspace
     * at render time). When true, renderList hides the other project rows so the user can focus
     * on the expanded project's chats without surrounding noise; collapsing restores the full list.
     */
    protected soloExpanded = false;
    /** Once the user collapses the current workspace row, do not auto-expand it again. */
    protected suppressCurrentAutoExpand = false;
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
    protected readonly conversationFlags: MobileProjectsConversationFlags | undefined;
    protected readonly createChatInputWidget: MobileProjectsPanelOptions['createChatInputWidget'];
    protected readonly createChatViewWidget: MobileProjectsPanelOptions['createChatViewWidget'];
    protected readonly chatService: ChatService | undefined;
    protected readonly chatAgentService: ChatAgentService | undefined;
    protected readonly messageService: MessageService | undefined;
    protected activeTasksDispose: Disposable = Disposable.NULL;
    protected conversationsDispose: Disposable = Disposable.NULL;
    protected chatServiceDispose: Disposable = Disposable.NULL;
    protected readonly chatSessionModelDisposables = new Map<string, Disposable>();
    protected readonly chatSessionProjectIds = new Map<string, string>();
    protected chatServiceRefreshHandle: number | undefined;
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
        this.conversationFlags = options.conversationFlags;
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
        title.textContent = nls.localize('qaap/mobileProjects/title', 'Work Hub');
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
            // Typing in search means the user wants to scan repos again, so leave the
            // solo-project focus mode and show the full filtered list.
            if (this.query) {
                this.soloExpanded = false;
            }
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
                    nls.localize('qaap/mobileProjects/refreshed', 'Work Hub refreshed'),
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
        this.chatServiceDispose.dispose();
        this.chatServiceDispose = Disposable.NULL;
        this.disposeChatSessionModelListeners();
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
        this.chatServiceDispose.dispose();
        this.chatServiceDispose = Disposable.NULL;
        this.disposeChatSessionModelListeners();
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
        this.chatServiceDispose.dispose();
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
        this.subscribeToChatServiceSessions();
    }

    protected subscribeToChatServiceSessions(): void {
        if (!this.chatService) {
            this.chatServiceDispose = Disposable.NULL;
            return;
        }
        const disposables = new DisposableCollection();
        disposables.push(this.chatService.onSessionEvent(() => {
            this.trackChatServiceSessionModels();
            this.scheduleChatServiceRefresh();
        }));
        this.chatServiceDispose = disposables;
        this.trackChatServiceSessionModels();
    }

    protected trackChatServiceSessionModels(): void {
        if (!this.chatService) {
            return;
        }
        const liveIds = new Set(this.chatService.getSessions().map(session => session.id));
        for (const [sessionId, disposable] of [...this.chatSessionModelDisposables]) {
            if (!liveIds.has(sessionId)) {
                disposable.dispose();
                this.chatSessionModelDisposables.delete(sessionId);
                this.chatSessionProjectIds.delete(sessionId);
            }
        }
        for (const session of this.chatService.getSessions()) {
            if (this.chatSessionModelDisposables.has(session.id)) {
                continue;
            }
            this.chatSessionModelDisposables.set(session.id, session.model.onDidChange(() => {
                this.scheduleChatServiceRefresh();
            }));
        }
    }

    protected disposeChatSessionModelListeners(): void {
        if (this.chatServiceRefreshHandle !== undefined) {
            window.clearTimeout(this.chatServiceRefreshHandle);
            this.chatServiceRefreshHandle = undefined;
        }
        for (const disposable of this.chatSessionModelDisposables.values()) {
            disposable.dispose();
        }
        this.chatSessionModelDisposables.clear();
    }

    protected scheduleChatServiceRefresh(): void {
        if (!this.visible || this.chatServiceRefreshHandle !== undefined) {
            return;
        }
        this.chatServiceRefreshHandle = window.setTimeout(() => {
            this.chatServiceRefreshHandle = undefined;
            void this.applyActiveTasksRefresh();
        }, 120);
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

    protected countNeedsInputTasks(project: MobileProjectEntry): number {
        return this.conversationsForProject(project).filter(c => {
            const session = c.sessionId ? this.chatService?.getSession(c.sessionId) : undefined;
            return !!session && this.isChatSessionWaitingForInput(session);
        }).length;
    }

    protected countFailedTasks(project: MobileProjectEntry): number {
        return this.conversationsForProject(project).filter(c => c.status === 'failed').length;
    }

    protected countUnreadTasks(project: MobileProjectEntry): number {
        if (!this.conversationFlags) {
            return 0;
        }
        return this.conversationsForProject(project).filter(c => this.isConversationUnread(c)).length;
    }

    /**
     * A conversation is "unread" when the agent has produced new activity since the user last
     * opened it. Conversations the user has never opened only count as unread if their last
     * message is from the agent — otherwise the row would render as a permanent badge.
     */
    protected isConversationUnread(summary: QaapAgentConversationSummaryDTO): boolean {
        if (!this.conversationFlags) {
            return false;
        }
        if (summary.lastMessageRole !== 'agent' || !summary.messageCount) {
            return false;
        }
        const lastSeen = this.conversationFlags.getLastSeen(summary.id);
        return summary.updatedAt > lastSeen;
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
        this.trackChatServiceSessionModels();
        let persisted: ChatSessionMetadata[] = [];
        try {
            persisted = Object.values(await this.chatService.getPersistedSessions());
        } catch {
            persisted = [];
        }
        const activeSessions = new Map(this.chatService.getSessions()
            .filter(session => !session.model.isEmpty())
            .map(session => [session.id, session]));
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
        for (const session of sessions) {
            const project = this.projectForChatSession(session.sessionId, targetProject);
            if (activeSessions.has(session.sessionId) && !this.chatSessionProjectIds.has(session.sessionId)) {
                this.rememberChatSessionProject(session.sessionId, project);
            }
            const projectCwd = this.projectsService.getProjectCwd(project) ?? cwd;
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
            const existing = this.chatServiceSessionSummariesByProjectId.get(project.id) ?? [];
            existing.push(summary);
            this.chatServiceSessionSummariesByProjectId.set(project.id, existing);
        }
    }

    protected projectForChatSession(sessionId: string, fallback: MobileProjectEntry): MobileProjectEntry {
        const mappedId = this.chatSessionProjectIds.get(sessionId);
        if (mappedId) {
            return this.projects.find(project => project.id === mappedId) ?? fallback;
        }
        return fallback;
    }

    protected rememberChatSessionProject(sessionId: string | undefined, project: MobileProjectEntry): void {
        if (sessionId) {
            this.chatSessionProjectIds.set(sessionId, project.id);
        }
    }

    protected isChatSessionWorking(session: ChatSession): boolean {
        return session.model.getRequests().some(request =>
            !request.response.isComplete && !request.response.isCanceled
        );
    }

    protected isChatSessionWaitingForInput(session: ChatSession): boolean {
        return session.model.getRequests().some(request => request.response.isWaitingForInput);
    }

    protected chatSessionPreview(session: ChatSession | undefined): string | undefined {
        const request = session?.model.getRequests().at(-1);
        return request?.request.displayText?.trim() || request?.request.text?.trim();
    }

    protected mergeConversationSummaries(
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
    protected compareConversationOrder(
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
    protected resolveConversationLineage(
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
    protected resolveConversationFlags(summary: QaapAgentConversationSummaryDTO): { priority: boolean; paused: boolean } {
        if (summary.source === 'theia-chat' && this.conversationFlags) {
            const overrides = this.conversationFlags.get(summary.id);
            return {
                priority: !!(summary.priority || overrides.priority),
                paused: !!(summary.paused || overrides.paused),
            };
        }
        return { priority: !!summary.priority, paused: !!summary.paused };
    }

    protected preferConversationSummary(
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
            state: this.conversationTaskState(c),
            createdAt: c.createdAt,
            finishedAt: c.status !== 'streaming' ? c.updatedAt : undefined,
        }));
    }

    protected conversationTaskState(conversation: QaapAgentConversationSummaryDTO): string {
        const session = conversation.sessionId ? this.chatService?.getSession(conversation.sessionId) : undefined;
        if (session && this.isChatSessionWaitingForInput(session)) {
            return 'needs-input';
        }
        if (conversation.status === 'streaming' || (session && this.isChatSessionWorking(session))) {
            return 'running';
        }
        if (conversation.status === 'failed') {
            return 'failed';
        }
        return 'completed';
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
                this.soloExpanded = false;
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

        // Default: keep the active workspace expanded so the user lands on what matters. If the
        // user collapses it manually, keep that collapsed state like any other project row.
        if (this.expandedId === undefined && !this.suppressCurrentAutoExpand) {
            const current = filtered.find(p => p.isCurrent);
            if (current) {
                this.expandedId = current.id;
                this.soloExpanded = true;
            }
        }

        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-rows';
        const visible = this.soloExpanded && this.expandedId !== undefined
            ? filtered.filter(p => p.id === this.expandedId)
            : filtered;
        for (const p of visible) {
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
        const needsInput = this.countNeedsInputTasks(project) > 0;
        const failed = this.countFailedTasks(project) > 0;
        const unreadCount = this.countUnreadTasks(project);
        const doneCount = this.countDoneTasks(project);
        const activeInfo = this.activeInfoForProject(project);

        // Collapsed header (always visible) — clicking toggles the expansion.
        const header = document.createElement('div');
        header.className = 'theia-mobile-projects-row-head';
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');

        // Status glyph follows a priority ladder so the most actionable state wins:
        //   needs-input > failed > running > unread > current workspace > done > idle
        // The colored dot + animation pair signals intent at a glance from the project list.
        const glyph = document.createElement('span');
        glyph.className = 'theia-mobile-projects-row-glyph';
        if (project.isCurrent) {
            glyph.classList.add('theia-mod-workspace');
        }
        if (needsInput) {
            glyph.classList.add('theia-mod-needs-input');
            glyph.title = nls.localize('qaap/mobileProjects/glyphNeedsInput', 'Waiting for your input');
        } else if (failed) {
            glyph.classList.add('theia-mod-failed');
            glyph.title = nls.localize('qaap/mobileProjects/glyphFailed', 'A chat failed — review and retry');
        } else if (running) {
            glyph.classList.add('theia-mod-running');
            glyph.title = nls.localize('qaap/mobileProjects/glyphRunning', 'Agent is working');
        } else if (unreadCount > 0) {
            glyph.classList.add('theia-mod-unread');
            glyph.title = unreadCount === 1
                ? nls.localize('qaap/mobileProjects/glyphUnreadOne', 'New agent reply since you last opened this project')
                : nls.localize('qaap/mobileProjects/glyphUnreadMany', '{0} chats with new agent replies', String(unreadCount));
        } else if (doneCount > 0) {
            glyph.classList.add('theia-mod-done');
        }
        header.append(glyph);

        const main = document.createElement('div');
        main.className = 'theia-mobile-projects-row-main';

        const nameRow = document.createElement('div');
        nameRow.className = 'theia-mobile-projects-row-name-row';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-projects-row-chevron';
        chevron.textContent = '›';
        chevron.setAttribute('aria-hidden', 'true');
        nameRow.append(chevron);
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
        if (project.isCurrent) {
            const sep = document.createElement('span');
            sep.className = 'theia-mobile-projects-row-meta-sep';
            sep.textContent = '·';
            const current = document.createElement('button');
            current.type = 'button';
            current.className = 'theia-mobile-projects-row-current-open';
            current.title = nls.localize('qaap/mobileProjects/workspaceFocus', 'Focus');
            const currentLabel = document.createElement('span');
            currentLabel.className = 'theia-mobile-projects-row-current-open-label';
            currentLabel.textContent = nls.localize('qaap/mobileProjects/workspaceOpen', 'Workspace open');
            const close = document.createElement('span');
            close.className = 'theia-mobile-projects-row-current-close';
            close.setAttribute('role', 'button');
            close.setAttribute('tabindex', '0');
            const closeLabel = nls.localize('qaap/mobileProjects/closeWorkspace', 'Close workspace');
            close.setAttribute('aria-label', closeLabel);
            close.title = closeLabel;
            close.textContent = '×';
            close.addEventListener('click', ev => {
                ev.stopPropagation();
                void this.closeCurrentWorkspace();
            });
            close.addEventListener('keydown', ev => {
                if (ev.key !== 'Enter' && ev.key !== ' ') {
                    return;
                }
                ev.preventDefault();
                ev.stopPropagation();
                void this.closeCurrentWorkspace();
            });
            current.append(currentLabel, close);
            current.addEventListener('click', ev => {
                ev.stopPropagation();
                this.delegate.onProjectOpen(project);
            });
            current.addEventListener('keydown', ev => ev.stopPropagation());
            metaRow.append(sep, current);
        } else {
            const openBtn = document.createElement('button');
            openBtn.type = 'button';
            openBtn.className = 'theia-mobile-projects-row-meta-open';
            const openLabel = nls.localize('qaap/mobileProjects/workspaceOpenIn', 'Open in workspace');
            openBtn.setAttribute('aria-label', openLabel);
            openBtn.title = openLabel;
            const openIcon = document.createElement('span');
            openIcon.className = 'codicon codicon-link-external';
            openIcon.setAttribute('aria-hidden', 'true');
            openBtn.append(openIcon);
            openBtn.addEventListener('click', ev => {
                ev.stopPropagation();
                this.delegate.onProjectOpen(project);
            });
            openBtn.addEventListener('keydown', ev => ev.stopPropagation());
            metaRow.append(openBtn);
        }
        main.append(metaRow);
        header.append(main);

        const menu = this.buildProjectOptionsMenu(project);
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
            this.toggleCardMenu(card, menu, menuBtn);
        });
        menuBtn.addEventListener('keydown', ev => ev.stopPropagation());
        header.append(menuBtn);

        header.addEventListener('click', ev => {
            ev.stopPropagation();
            void this.toggleRowExpanded(project);
        });
        header.addEventListener('keydown', ev => {
            if (ev.key !== 'Enter' && ev.key !== ' ') {
                return;
            }
            ev.preventDefault();
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

        const workspaceBlock = this.createWorkspaceBlock(project);
        if (workspaceBlock) {
            body.append(workspaceBlock);
        }
        body.append(this.createInlineComposer(project));
        body.append(this.createTaskBlock(project, activeInfo));

        card.append(body, menu);
        return card;
    }

    protected async toggleRowExpanded(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const wasExpanded = this.expandedId === project.id;
        this.expandedId = wasExpanded ? undefined : project.id;
        this.suppressCurrentAutoExpand = wasExpanded && project.isCurrent;
        // Hide the other rows while the user has a project expanded so the chat list isn't lost in
        // noise; when the user collapses it again the full list returns.
        this.soloExpanded = this.expandedId !== undefined;
        // Collapse the composer chrome whenever the expanded row changes so each row reopens clean.
        this.composerExpanded = false;
        await this.refreshChatServiceSessionSummaries();
        this.renderList();
    }

    protected async closeCurrentWorkspace(): Promise<void> {
        const commandId = WorkspaceCommands.CLOSE.id;
        if (!this.commands.getCommand(commandId) || !this.commands.isEnabled(commandId)) {
            return;
        }
        try {
            await this.commands.executeCommand(commandId);
            await this.refreshProjects();
        } catch (error) {
            console.error('[qaap-mobile-projects] close workspace failed:', error);
        }
    }

    protected createWorkspaceBlock(project: MobileProjectEntry): HTMLElement | undefined {
        if (project.isCurrent) {
            return undefined;
        }
        // For non-current projects the "Open in workspace" affordance is rendered as a compact
        // icon button on the meta row (see createRow) so it doesn't take a full line in the body.
        return undefined;
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
        // Left-side caret doubles as the "more options" accordion trigger: tapping it expands the
        // composer into its full chrome, same as the former right-side tune button (now removed).
        const caret = document.createElement('button');
        caret.type = 'button';
        caret.className = 'theia-mobile-projects-inline-caret';
        caret.textContent = '›';
        caret.title = nls.localize('qaap/mobileProjects/inlineMoreOptions', 'More options');
        caret.setAttribute('aria-label', caret.title);
        caret.setAttribute('aria-expanded', 'false');

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'theia-mobile-projects-inline-input';
        input.placeholder = nls.localize('qaap/mobileProjects/inlineComposerPlaceholder', 'Ask the agent to…');
        input.disabled = !canRunTask;
        input.addEventListener('click', ev => ev.stopPropagation());
        input.addEventListener('focus', () => {
            this.composerDraft = input.value;
        });

        caret.addEventListener('click', ev => {
            ev.stopPropagation();
            this.composerDraft = input.value;
            this.composerExpanded = true;
            this.renderList();
        });

        // Send affordance — sits pinned to the right inside the input wrapper instead of stealing
        // a flex column at the end of the composer row.
        const startBtn = document.createElement('button');
        startBtn.type = 'button';
        startBtn.className = 'theia-mobile-projects-inline-start';
        startBtn.disabled = true;
        const startLabel = nls.localize('qaap/mobileProjects/inlineStart', 'Start');
        startBtn.title = startLabel;
        startBtn.setAttribute('aria-label', startLabel);
        startBtn.innerHTML = '<span class="codicon codicon-send" aria-hidden="true"></span>';

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
            void this.submitBackgroundAgentTask(project, draft, { openConversation: false });
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

        const inputWrap = document.createElement('div');
        inputWrap.className = 'theia-mobile-projects-inline-input-wrap';
        inputWrap.append(input, startBtn);
        wrap.append(caret, inputWrap);
        return wrap;
    }

    protected createInlineComposerExpanded(project: MobileProjectEntry, canRunTask: boolean): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-projects-agent-chat-input';
        if (!canRunTask) {
            wrap.classList.add('theia-mod-disabled');
        }

        // Collapse handle on top — mirrors the left caret on the collapsed composer so the user
        // can fold the full agent input back into the simple inline input row.
        const collapseRow = document.createElement('div');
        collapseRow.className = 'theia-mobile-projects-agent-chat-input-collapse-row';
        const collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.className = 'theia-mobile-projects-inline-caret theia-mod-expanded';
        collapseBtn.textContent = '⌃';
        const collapseLabel = nls.localize('qaap/mobileProjects/inlineCollapse', 'Collapse to simple input');
        collapseBtn.title = collapseLabel;
        collapseBtn.setAttribute('aria-label', collapseLabel);
        collapseBtn.setAttribute('aria-expanded', 'true');
        collapseBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.composerExpanded = false;
            this.renderList();
        });
        collapseRow.append(collapseBtn);
        wrap.append(collapseRow);

        if (!this.createChatInputWidget || !this.chatService) {
            const unavailable = document.createElement('div');
            unavailable.textContent = nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.');
            wrap.append(unavailable);
            return wrap;
        }
        const mountHost = document.createElement('div');
        mountHost.className = 'theia-mobile-projects-agent-chat-input-host';
        wrap.append(mountHost);
        void this.mountAgentChatInput(project, mountHost);
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

        // Pre-compute the set of conversation ids that have at least one descendant fork, so each
        // row can decide which lineage glyph to render (parent / child / both / standalone).
        const conversations = this.conversationsForProject(project);
        const parentIds = new Set<string>();
        for (const c of conversations) {
            if (c.forkedFromId) {
                parentIds.add(c.forkedFromId);
            }
        }

        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-tasks-list';
        for (const group of this.groupConversationTasks(tasks)) {
            const section = document.createElement('section');
            section.className = `theia-mobile-projects-conversation-group theia-mod-${group.id}`;
            const groupHead = document.createElement('div');
            groupHead.className = 'theia-mobile-projects-conversation-group-head';
            const groupLabel = document.createElement('span');
            groupLabel.className = 'theia-mobile-projects-conversation-group-label';
            groupLabel.textContent = group.label;
            const groupCount = document.createElement('span');
            groupCount.className = 'theia-mobile-projects-conversation-group-count';
            groupCount.textContent = String(group.tasks.length);
            groupHead.append(groupLabel, groupCount);
            section.append(groupHead);
            for (const task of group.tasks) {
                const summary = conversations.find(c => c.id === task.id);
                section.append(this.createTaskItem(project, task, activeInfo, summary, parentIds));
            }
            list.append(section);
        }
        block.append(list);
        return block;
    }

    protected groupConversationTasks(tasks: MobileProjectTaskView[]): Array<{
        id: 'working' | 'needs-you' | 'recent' | 'done';
        label: string;
        tasks: MobileProjectTaskView[];
    }> {
        type ConversationGroup = {
            id: 'working' | 'needs-you' | 'recent' | 'done';
            label: string;
            tasks: MobileProjectTaskView[];
        };
        const groups = {
            working: [] as MobileProjectTaskView[],
            needsYou: [] as MobileProjectTaskView[],
            recent: [] as MobileProjectTaskView[],
            done: [] as MobileProjectTaskView[],
        };
        const recentWindowMs = 24 * 60 * 60 * 1000;
        const now = Date.now();
        for (const task of tasks) {
            if (task.state === 'running') {
                groups.working.push(task);
            } else if (task.state === 'needs-input' || task.state === 'failed' || task.state === 'interrupted') {
                groups.needsYou.push(task);
            } else if (now - (task.finishedAt ?? task.createdAt) <= recentWindowMs) {
                groups.recent.push(task);
            } else {
                groups.done.push(task);
            }
        }
        const ordered: ConversationGroup[] = [
            {
                id: 'working',
                label: nls.localize('qaap/mobileProjects/conversationGroupWorking', 'Working'),
                tasks: groups.working,
            },
            {
                id: 'needs-you',
                label: nls.localize('qaap/mobileProjects/conversationGroupNeedsYou', 'Needs you'),
                tasks: groups.needsYou,
            },
            {
                id: 'recent',
                label: nls.localize('qaap/mobileProjects/conversationGroupRecent', 'Recent'),
                tasks: groups.recent,
            },
            {
                id: 'done',
                label: nls.localize('qaap/mobileProjects/conversationGroupDone', 'Done'),
                tasks: groups.done,
            },
        ];
        return ordered.filter(group => group.tasks.length > 0);
    }

    protected createTaskItem(
        project: MobileProjectEntry,
        task: MobileProjectTaskView,
        _activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
        summary?: QaapAgentConversationSummaryDTO,
        parentIds: ReadonlySet<string> = new Set<string>(),
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-task-row';

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theia-mobile-projects-task-item';
        const isRunning = task.state === 'running';
        const needsInput = task.state === 'needs-input';
        const isDone = task.state === 'completed';
        const isFailed = task.state === 'failed' || task.state === 'interrupted';
        const stateColor = isRunning
            ? 'var(--theia-charts-green, #4caf7c)'
            : needsInput
                ? 'var(--theia-notificationsWarningIcon-foreground, #cca700)'
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
        if (needsInput) {
            item.classList.add('theia-mod-needs-input');
        }

        const lineage = summary ? this.resolveConversationLineage(summary, parentIds) : 'none';
        const taskDot = document.createElement('span');
        if (lineage === 'none') {
            // Standalone chat → keep the existing colored status dot (idle/running/failed/etc).
            taskDot.className = 'theia-mobile-projects-task-dot';
            taskDot.style.background = stateColor;
            if (isRunning) {
                taskDot.classList.add('theia-mod-pulse');
            } else if (needsInput) {
                taskDot.classList.add('theia-mod-attention');
            }
        } else {
            // Fork lineage glyph mirrors Claude Code desktop's chat list:
            //   parent  → green branch (someone forked from this chat)
            //   child   → purple fork (this chat came from another)
            //   both    → orange merge (forked in and out)
            const iconClass = lineage === 'parent'
                ? 'codicon-git-branch'
                : lineage === 'child'
                    ? 'codicon-repo-forked'
                    : 'codicon-git-merge';
            taskDot.className = `theia-mobile-projects-task-lineage theia-mod-${lineage} codicon ${iconClass}`;
            taskDot.setAttribute('aria-hidden', 'true');
            const lineageLabel = lineage === 'parent'
                ? nls.localize('qaap/mobileProjects/lineageParent', 'Forked into other chats')
                : lineage === 'child'
                    ? nls.localize('qaap/mobileProjects/lineageChild', 'Forked from another chat')
                    : nls.localize('qaap/mobileProjects/lineageBoth', 'Forked from another chat and into others');
            taskDot.title = lineageLabel;
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
        row.append(item);

        if (summary) {
            const flags = this.resolveConversationFlags(summary);
            if (flags.priority && !flags.paused) {
                row.classList.add('theia-mod-priority');
                const star = document.createElement('span');
                star.className = 'codicon codicon-star-full theia-mobile-projects-conversation-priority-badge';
                star.setAttribute('aria-label', nls.localize('qaap/mobileProjects/priorityBadge', 'High priority'));
                star.title = star.getAttribute('aria-label')!;
                taskTitleRow.insertBefore(star, taskTitleRow.firstChild);
            }
            if (flags.paused) {
                row.classList.add('theia-mod-paused');
                const pause = document.createElement('span');
                pause.className = 'codicon codicon-debug-pause theia-mobile-projects-conversation-pause-badge';
                pause.setAttribute('aria-label', nls.localize('qaap/mobileProjects/pausedBadge', 'Paused'));
                pause.title = pause.getAttribute('aria-label')!;
                taskTitleRow.insertBefore(pause, taskTitleRow.firstChild);
            }
            const menuBtn = document.createElement('button');
            menuBtn.type = 'button';
            menuBtn.className = 'theia-mobile-projects-card-menu-btn theia-mobile-projects-conversation-menu-btn';
            menuBtn.setAttribute('aria-label', nls.localize('qaap/mobileProjects/conversationMenu', 'Chat options'));
            menuBtn.setAttribute('aria-haspopup', 'menu');
            menuBtn.setAttribute('aria-expanded', 'false');
            const icon = document.createElement('span');
            icon.className = 'codicon codicon-kebab-vertical';
            icon.setAttribute('aria-hidden', 'true');
            menuBtn.append(icon);
            const menu = this.buildConversationMenu(project, summary);
            menuBtn.addEventListener('click', ev => {
                ev.stopPropagation();
                this.toggleCardMenu(row, menu, menuBtn);
            });
            row.append(menuBtn, menu);
        }

        return row;
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
            case 'needs-input':
                return nls.localize('qaap/mobileProjects/taskStateNeedsInput', 'needs you');
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
                await this.openConversationSummary(project, summary);
                return;
            }
        }
        const entry = task ? { ...project, task: task.title } : project;
        this.hide();
        this.delegate.onDismiss();
        await this.delegate.onOpenAgentOnTask?.(entry);
    }

    protected async openConversationSummary(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeCardMenu();
        // Opening a chat clears its unread badge — record the high-water mark before navigating so
        // the project glyph drops the "new replies" treatment on the next render.
        this.conversationFlags?.markRead(summary.id, summary.updatedAt);
        if (summary.source === 'theia-chat') {
            await this.openTheiaChatTranscriptSheet(project, summary);
            return;
        }
        await this.openTranscriptSheet(project, summary);
    }

    protected buildProjectOptionsMenu(project: MobileProjectEntry): HTMLElement {
        const menu = document.createElement('div');
        menu.className = 'theia-mobile-projects-card-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        this.appendCardMenuItem(menu, {
            label: project.pinned
                ? nls.localize('qaap/mobileProjects/unpin', 'Unpin')
                : nls.localize('qaap/mobileProjects/pin', 'Pin'),
            iconClass: project.pinned ? 'codicon-pinned' : 'codicon-pin',
            onSelect: () => { void this.onTogglePin(project); },
        });

        const canRemove = this.projectsService.canRemove(project);
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/remove', 'Remove'),
            iconClass: 'codicon-trash',
            danger: true,
            disabled: !canRemove,
            title: !canRemove && project.github
                ? nls.localize('qaap/mobileProjects/removeGithubDisabled', 'Remove is only for custom or recent projects')
                : !canRemove
                ? nls.localize('qaap/mobileProjects/removeCurrentDisabled', 'Cannot remove the active workspace')
                : undefined,
            onSelect: () => { void this.onRemoveProject(project); },
        });

        const conversations = this.conversationsForProject(project);
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/clearAllChats', 'Clear all chats'),
            iconClass: 'codicon-clear-all',
            danger: true,
            disabled: conversations.length === 0,
            title: conversations.length === 0
                ? nls.localize('qaap/mobileProjects/clearAllChatsDisabled', 'No chats to clear')
                : undefined,
            onSelect: () => { void this.onClearProjectChats(project); },
        });

        return menu;
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

    protected buildConversationMenu(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): HTMLElement {
        const menu = document.createElement('div');
        menu.className = 'theia-mobile-projects-card-menu theia-mobile-projects-conversation-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/openChat', 'Open chat'),
            iconClass: 'codicon-comment-discussion',
            onSelect: () => {
                void this.openConversationSummary(project, summary);
            },
        });

        const isTheiaChat = summary.source === 'theia-chat';
        const canFork = isTheiaChat
            ? !!summary.sessionId && !!this.chatService && !!this.conversations
            : true;
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/forkChat', 'Fork chat'),
            iconClass: 'codicon-git-branch',
            disabled: !canFork,
            title: canFork
                ? nls.localize('qaap/mobileProjects/forkChatTitle', 'Duplicate this chat to try another strategy.')
                : nls.localize('qaap/mobileProjects/forkChatUnavailable', 'Only saved workspace chats can be forked here.'),
            onSelect: () => { void this.onForkConversation(project, summary); },
        });

        const canRename = isTheiaChat ? !!summary.sessionId && !!this.chatService : true;
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/renameChat', 'Rename chat'),
            iconClass: 'codicon-edit',
            disabled: !canRename,
            title: canRename
                ? nls.localize('qaap/mobileProjects/renameChatTitle', 'Change this chat name.')
                : nls.localize('qaap/mobileProjects/renameChatUnavailable', 'This chat cannot be renamed.'),
            onSelect: () => { void this.onRenameConversation(project, summary); },
        });

        const flags = this.resolveConversationFlags(summary);
        const canFlag = isTheiaChat ? !!this.conversationFlags : true;
        this.appendCardMenuItem(menu, {
            label: flags.priority
                ? nls.localize('qaap/mobileProjects/removePriority', 'Remove high priority')
                : nls.localize('qaap/mobileProjects/markPriority', 'Mark as high priority'),
            iconClass: flags.priority ? 'codicon-star-full' : 'codicon-star-empty',
            disabled: !canFlag,
            title: flags.priority
                ? nls.localize('qaap/mobileProjects/removePriorityTitle', 'Stop pinning this chat at the top.')
                : nls.localize('qaap/mobileProjects/markPriorityTitle', 'Pin this chat at the top of the project list.'),
            onSelect: () => { void this.onSetConversationPriority(summary, !flags.priority); },
        });
        this.appendCardMenuItem(menu, {
            label: flags.paused
                ? nls.localize('qaap/mobileProjects/resumeChat', 'Resume chat')
                : nls.localize('qaap/mobileProjects/pauseChat', 'Pause chat'),
            iconClass: flags.paused ? 'codicon-debug-start' : 'codicon-debug-pause',
            disabled: !canFlag,
            title: flags.paused
                ? nls.localize('qaap/mobileProjects/resumeChatTitle', 'Move this chat back to the active list.')
                : nls.localize(
                    'qaap/mobileProjects/pauseChatTitle',
                    'Stop any active turn and push this chat to the bottom of the list.'
                ),
            onSelect: () => { void this.onSetConversationPaused(project, summary, !flags.paused); },
        });

        if (summary.status === 'streaming') {
            const separator = document.createElement('div');
            separator.className = 'theia-mobile-projects-card-menu-separator';
            separator.setAttribute('role', 'separator');
            menu.append(separator);

            this.appendCardMenuItem(menu, {
                label: nls.localize('qaap/mobileProjects/cancelConversation', 'Cancel run'),
                iconClass: 'codicon-debug-stop',
                danger: true,
                onSelect: () => { void this.onCancelConversation(project, summary); },
            });
        }

        const separator = document.createElement('div');
        separator.className = 'theia-mobile-projects-card-menu-separator';
        separator.setAttribute('role', 'separator');
        menu.append(separator);

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/deleteChat', 'Delete chat'),
            iconClass: 'codicon-trash',
            danger: true,
            disabled: summary.source === 'theia-chat' && !summary.sessionId,
            onSelect: () => { void this.onDeleteConversation(summary); },
        });

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
        const menuBtn = this.openMenuAnchor ?? card?.querySelector('.theia-mobile-projects-card-menu-btn');
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
            iconClass?: string;
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
        if (options.iconClass) {
            const icon = document.createElement('span');
            icon.className = `codicon ${options.iconClass}`;
            icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.textContent = options.label;
            item.append(icon, label);
        } else {
            item.textContent = options.label;
        }
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

    protected async onForkConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeCardMenu();
        try {
            if (summary.source !== 'theia-chat') {
                const full = await forkConversation(summary.id);
                const forked = conversationToSummary(full);
                this.conversations?.recordSnapshot(forked);
                this.renderList();
                await this.openTranscriptSheet(project, forked);
                return;
            }
            const session = await this.forkTheiaConversation(project, summary);
            if (!session) {
                this.messageService?.error(nls.localize(
                    'qaap/mobileProjects/forkChatFailedUnavailable',
                    'Could not fork this chat because its saved transcript is unavailable.'
                ));
                return;
            }
            this.rememberChatSessionProject(session.id, project);
            this.trackChatServiceSessionModels();
            await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            this.renderList();
            this.messageService?.info(nls.localize('qaap/mobileProjects/forkChatCreated', 'Forked chat created'));
            await this.openTheiaChatTranscriptSheet(project, {
                ...summary,
                id: `theia-chat:fork:${session.id}`,
                sessionId: session.id,
                title: session.title ?? summary.title,
                updatedAt: Date.now(),
                status: 'idle',
            });
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/forkChatFailed',
                'Could not fork chat: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onRenameConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeCardMenu();
        if (summary.source === 'theia-chat' && (!summary.sessionId || !this.chatService)) {
            return;
        }
        const dialog = new SingleTextInputDialog({
            title: nls.localize('qaap/mobileProjects/renameChatDialog', 'Rename chat'),
            initialValue: summary.title,
            placeholder: nls.localize('qaap/mobileProjects/renameChatPlaceholder', 'Chat name'),
            validate: (value, mode) => {
                if (mode !== 'preview' && !value.trim()) {
                    return nls.localize('qaap/mobileProjects/renameChatRequired', 'Enter a chat name');
                }
                return true;
            },
        });
        const value = await dialog.open();
        const title = value?.trim();
        if (!title || title === summary.title) {
            return;
        }
        try {
            if (summary.source === 'theia-chat') {
                await this.getOrRestoreProjectChatSession(project, summary);
                await this.chatService!.renameSession(summary.sessionId!, title);
                await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            } else {
                const full = await renameConversation(summary.id, title);
                this.conversations?.recordSnapshot(conversationToSummary(full));
            }
            this.renderList();
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/renameChatFailed',
                'Could not rename chat: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onSetConversationPriority(
        summary: QaapAgentConversationSummaryDTO,
        priority: boolean,
    ): Promise<void> {
        this.closeCardMenu();
        try {
            if (summary.source === 'theia-chat') {
                if (!this.conversationFlags) {
                    return;
                }
                this.conversationFlags.set(summary.id, { priority });
                this.conversations?.recordSnapshot({ ...summary, priority: priority || undefined });
            } else {
                const full = await updateConversation(summary.id, { priority });
                this.conversations?.recordSnapshot(conversationToSummary(full));
            }
            this.renderList();
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/priorityFailed',
                'Could not update chat priority: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onSetConversationPaused(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        paused: boolean,
    ): Promise<void> {
        this.closeCardMenu();
        try {
            if (paused && summary.status === 'streaming') {
                // Stopping the active turn mirrors what the server does for qaap-agent chats; for
                // Theia chats we use the same path as the existing "Cancel run" menu item.
                await this.onCancelConversation(project, summary);
            }
            if (summary.source === 'theia-chat') {
                if (!this.conversationFlags) {
                    return;
                }
                this.conversationFlags.set(summary.id, { paused });
                this.conversations?.recordSnapshot({ ...summary, paused: paused || undefined });
            } else {
                const full = await updateConversation(summary.id, { paused });
                this.conversations?.recordSnapshot(conversationToSummary(full));
            }
            this.renderList();
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/pauseFailed',
                'Could not change chat pause state: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onCancelConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeCardMenu();
        try {
            if (summary.source === 'theia-chat') {
                const session = await this.getOrRestoreProjectChatSession(project, summary);
                const request = [...(session?.model.getRequests() ?? [])]
                    .reverse()
                    .find(candidate => ChatRequestModel.isInProgress(candidate));
                if (session && request) {
                    await this.chatService?.cancelRequest(session.id, request.id);
                }
            } else {
                await cancelConversation(summary.id);
            }
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/cancelChatFailed',
                'Could not cancel run: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onDeleteConversation(summary: QaapAgentConversationSummaryDTO): Promise<void> {
        this.closeCardMenu();
        const confirmed = await new ConfirmDialog({
            title: nls.localize('qaap/mobileProjects/deleteChat', 'Delete chat'),
            msg: nls.localize('qaap/mobileProjects/deleteChatConfirm', 'Delete this chat? This cannot be undone.'),
        }).open();
        if (!confirmed) {
            return;
        }
        try {
            if (summary.source === 'theia-chat') {
                if (!summary.sessionId || !this.chatService) {
                    return;
                }
                await this.chatService.deleteSession(summary.sessionId);
                this.conversations?.removeSnapshot(summary.id, summary.cwd, summary.source);
                await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            } else {
                await deleteConversation(summary.id);
                this.conversations?.removeSnapshot(summary.id, summary.cwd, summary.source);
            }
            this.closeTranscriptSheet();
            this.renderList();
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/deleteChatFailed',
                'Could not delete chat: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
    }

    protected async onClearProjectChats(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const conversations = this.conversationsForProject(project);
        if (conversations.length === 0) {
            return;
        }
        const confirmed = await new ConfirmDialog({
            title: nls.localize('qaap/mobileProjects/clearAllChats', 'Clear all chats'),
            msg: nls.localize(
                'qaap/mobileProjects/clearAllChatsConfirm',
                'Clear all chats for this project? This cannot be undone.'
            ),
        }).open();
        if (!confirmed) {
            return;
        }
        try {
            for (const summary of conversations) {
                if (summary.source === 'theia-chat') {
                    if (summary.sessionId && this.chatService) {
                        await this.chatService.deleteSession(summary.sessionId);
                        this.conversations?.removeSnapshot(summary.id, summary.cwd, summary.source);
                    }
                } else {
                    await deleteConversation(summary.id);
                    this.conversations?.removeSnapshot(summary.id, summary.cwd, summary.source);
                }
            }
            await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            this.closeTranscriptSheet();
            await this.refreshChatServiceSessionSummaries();
            this.renderList();
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/clearAllChatsFailed',
                'Could not clear chats: {0}',
                error instanceof Error ? error.message : String(error)
            ));
        }
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
        this.soloExpanded = true;
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

    protected async submitBackgroundAgentTask(
        project: MobileProjectEntry,
        draft: string,
        options: {
            openConversation?: boolean;
            modeId?: string;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: ReturnType<AIChatInputWidget['getAllVariablesForRequest']>;
        } = {},
    ): Promise<void> {
        const cwd = await this.ensureInlineComposerCwd(project);
        if (!cwd) {
            return;
        }
        try {
            const summary = await this.createProjectChatSession(project, cwd, draft, options);
            this.applyTaskStartedToProject(cwd, draft, summary.id);
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/conversationStarted', 'Conversation started'),
                { kind: 'success', duration: 1400 }
            );
            if (options.openConversation ?? true) {
                void this.openTheiaChatTranscriptSheet(project, summary);
            }
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/conversationStartFailed',
                'Could not start conversation: {0}',
                detail
            ));
        }
    }

    protected async createProjectChatSession(
        project: MobileProjectEntry,
        cwd: string,
        draft: string,
        options: {
            modeId?: string;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: ReturnType<AIChatInputWidget['getAllVariablesForRequest']>;
        },
    ): Promise<QaapAgentConversationSummaryDTO> {
        if (!this.chatService) {
            throw new Error(nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.'));
        }
        const previousActiveSessionId = this.chatService.getActiveSession()?.id;
        const coderAgent = this.chatAgentService?.getAgent('Coder');
        const session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: false }, coderAgent);
        this.rememberChatSessionProject(session.id, project);
        this.trackChatServiceSessionModels();
        const summary = this.chatServiceSessionToSummary(session, project, cwd, draft, 'streaming');
        this.upsertProjectChatServiceSummary(project.id, summary);
        if (previousActiveSessionId && this.chatService.getSession(previousActiveSessionId)) {
            this.chatService.setActiveSession(previousActiveSessionId, { focus: false });
        }
        const invocation = await this.chatService.sendRequest(session.id, {
            text: draft,
            modeId: options.modeId,
            capabilityOverrides: options.capabilityOverrides,
            genericCapabilitySelections: options.genericCapabilitySelections,
            ...(options.variables && options.variables.length > 0 ? { variables: options.variables } : {}),
        });
        this.scheduleChatServiceRefresh();
        void invocation?.responseCompleted.finally(() => this.scheduleChatServiceRefresh());
        return summary;
    }

    protected chatServiceSessionToSummary(
        session: ChatSession,
        project: MobileProjectEntry,
        cwd: string,
        fallbackTitle: string,
        fallbackStatus?: QaapAgentConversationSummaryDTO['status'],
    ): QaapAgentConversationSummaryDTO {
        const now = session.lastInteraction?.getTime?.() ?? Date.now();
        return {
            id: this.chatServiceConversationId(session.id),
            source: 'theia-chat',
            cwd,
            workspacePath: cwd,
            sessionId: session.id,
            agentId: session.pinnedAgent?.id ?? 'chat',
            title: session.title ?? fallbackTitle,
            status: fallbackStatus ?? (this.isChatSessionWorking(session) ? 'streaming' : 'idle'),
            createdAt: now,
            updatedAt: now,
            messageCount: Math.max(1, session.model.getRequests().length),
            lastMessagePreview: this.chatSessionPreview(session) ?? fallbackTitle,
            lastMessageRole: 'user',
        };
    }

    protected upsertProjectChatServiceSummary(projectId: string, summary: QaapAgentConversationSummaryDTO): void {
        const list = [...(this.chatServiceSessionSummariesByProjectId.get(projectId) ?? [])];
        const index = list.findIndex(item => item.id === summary.id || (!!item.sessionId && item.sessionId === summary.sessionId));
        if (index >= 0) {
            list[index] = summary;
        } else {
            list.unshift(summary);
        }
        this.chatServiceSessionSummariesByProjectId.set(projectId, list);
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
        widget.onQuery = async (query: string, modeId?: string, capabilityOverrides?: Record<string, boolean>,
            genericCapabilitySelections?: GenericCapabilitySelections) => {
            const cleaned = query.replace(/^@Coder\s+/i, '').trim() || query.trim();
            if (!cleaned) {
                return;
            }
            const variables = widget.getAllVariablesForRequest();
            widget.clearPendingImageAttachments();
            this.composerExpanded = false;
            this.composerDraft = '';
            await this.submitBackgroundAgentTask(project, cleaned, {
                openConversation: false,
                modeId,
                capabilityOverrides,
                genericCapabilitySelections,
                variables,
            });
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
            this.rememberChatSessionProject(session.id, project);
            this.trackChatServiceSessionModels();
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

    protected async forkTheiaConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<ChatSession | undefined> {
        if (!this.chatService || !this.conversations || !summary.sessionId) {
            return undefined;
        }

        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const existing = await this.getOrRestoreProjectChatSession(project, summary);
        const raw = summary.id.startsWith('theia-chat:')
            ? await this.conversations.getTheiaSerializedConversation(summary.id)
            : await this.conversations.findTheiaSerializedConversationBySessionId(summary.sessionId, cwd)
                ?? await this.conversations.findTheiaSerializedConversationBySessionId(summary.sessionId);
        const baseData: RestorableTheiaChatData | undefined = isRestorableTheiaChatData(raw)
            ? raw
            : existing
                ? {
                    title: existing.title,
                    pinnedAgentId: existing.pinnedAgent?.id,
                    saveDate: existing.lastInteraction?.getTime() ?? Date.now(),
                    model: existing.model.toSerializable() as RestorableTheiaChatData['model'],
                }
                : undefined;
        if (!baseData) {
            return undefined;
        }

        const sessionId = generateUuid();
        const serializedModel = JSON.parse(JSON.stringify(baseData.model)) as RestorableTheiaChatData['model'];
        (serializedModel as { sessionId: string }).sessionId = sessionId;

        const model = new MutableChatModel(serializedModel);
        const service = this.chatService as ChatService & {
            _sessions?: ChatSession[];
            restoreSessionData?: (model: MutableChatModel, data: RestorableTheiaChatData['model']) => Promise<void>;
            setupAutoSaveForSession?: (session: ChatSession) => void;
            saveSession?: (sessionId: string) => Promise<void>;
        };
        await service.restoreSessionData?.(model, serializedModel);

        const title = nls.localize(
            'qaap/mobileProjects/forkedChatTitle',
            '{0} fork',
            baseData.title ?? summary.title ?? project.name
        );
        const pinnedAgentId = baseData.pinnedAgentId ?? existing?.pinnedAgent?.id;
        const session: ChatSession = {
            id: sessionId,
            title,
            lastInteraction: new Date(),
            model,
            isActive: false,
            pinnedAgent: pinnedAgentId ? this.chatAgentService?.getAgent(pinnedAgentId) : existing?.pinnedAgent,
        };
        if (!Array.isArray(service._sessions)) {
            return undefined;
        }
        service._sessions.push(session);
        service.setupAutoSaveForSession?.(session);
        await service.saveSession?.(session.id);
        this.chatService.setActiveSession(session.id, { focus: false });
        return session;
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
