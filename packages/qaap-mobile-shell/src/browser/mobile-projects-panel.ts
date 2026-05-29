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
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { SingleTextInputDialog } from '@theia/core/lib/browser/dialogs';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { Widget as LuminoWidget } from '@lumino/widgets';
import { AIVariable, AIVariableResolutionRequest, GenericCapabilitySelections } from '@theia/ai-core';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { ChatAgent, ChatAgentLocation, ChatMode, ChatRequestModel, ChatService, ChatSession, ChatSessionMetadata, MutableChatModel } from '@theia/ai-chat';
import { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import { MobileProjectAIChatInputWidget, MobileProjectChatViewWidget } from './mobile-project-ai-chat-input-widget';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import {
    MobileProjectEntry,
    MobileProjectFilter,
    MobileProjectsHubView,
    mobileProjectInitials,
} from './mobile-projects-types';
import { MobileProjectsActiveTasks, MobileProjectTaskView } from './mobile-projects-active-tasks';
import { MobileProjectsConversations } from './mobile-projects-conversations';
import { MobileProjectsConversationFlags } from './mobile-projects-conversation-flags';
import { MobileProjectsService } from './mobile-projects-service';
import { conversationTurnProgressRatio } from '../common/qaap-agent-conversation-list-metrics';
import {
    QaapAgentConversationDTO,
    QaapAgentConversationSummaryDTO,
    QaapAgentMessageSegmentDTO,
    cancelConversation,
    conversationToSummary,
    createConversation,
    deleteConversation,
    forkConversation,
    getConversation,
    postConversationMessage,
    renameConversation,
    retryConversation,
    updateConversation,
} from '../common/qaap-agent-conversation-client';
import {
    markMobileProjectReadmeForOpen,
    markMobileProjectsPanelDismiss,
    setMobileLandingHubListChrome,
} from './mobile-projects-open';
import { MobileOpenRepositoryDialog } from './mobile-open-repository-dialog';
import {
    extractBackendAgentMention,
    fetchAgentTaskListAll,
    isTheiaCoderAgent,
    isTheiaCoderMention,
    migrateLegacyBackendAgentId,
    normalizeBackendAgentId,
    readStoredAgent,
    isStickyComposerAgentSelected,
    reconcileStickyComposerAgent,
    resolveBackendAgentForTurn,
    QAIQ_AGENT_ID,
    resolveExplicitAgentForSubmit,
    SHELL_AGENT_ID,
    THEIA_CODER_AGENT_ID,
    writeStoredAgent,
    type QaapAgentTaskAgentOption,
    type QaapAgentTaskListSnapshot,
} from '../common/qaap-agent-task-client';
import {
    applyBackendInteractionModeToPrompt,
    reconcileComposerModeId,
    resolveComposerModeLabel,
    resolveStickyComposerModes,
    writeStoredComposerMode,
} from '../common/qaap-sticky-composer-mode';
import {
    attachStickyComposerMentionUi,
    buildStickyComposerMentionOptions,
    buildStickyComposerVariableOptions,
    type StickyComposerTokenOption,
} from '../common/qaap-sticky-composer-mention';
import {
    createMobileSheetGrabber,
    installMobilePullToRefresh,
    installMobileSheetDragDismiss,
} from './mobile-sheet-gestures';
import { MobileSnackbar } from './mobile-snackbar';
import { renderQaapAccountAvatarVisual } from './qaap-account-avatar-visual';
import {
    buildQaapAccountMenuSignOutOnly,
    dismissQaapAccountMenu,
    toggleQaapAccountMenu,
} from './qaap-workbench-account-menu';
import {
    fetchQaapAuthConfig,
    fetchQaapAuthSession,
    fetchQaapGithubPullRequests,
    startGithubOAuth,
} from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import { clearQaapAuthSession, readQaapSignedIn } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import {
    filterCatalogSections,
    QAAP_WORK_HUB_GETTING_STARTED,
    QAAP_WORK_HUB_WORKFLOWS,
    countCatalogItems,
    type WorkHubCatalogAction,
    type WorkHubCatalogItem,
    type WorkHubCatalogSection,
} from '../common/mobile-work-hub-catalog';
import {
    createWorkHubRoutine,
    deleteWorkHubRoutine,
    fetchWorkHubRoutines,
    runWorkHubRoutineNow,
    updateWorkHubRoutine,
} from '../common/qaap-work-hub-routine-client';
import {
    filterRoutinesByQuery,
    routineScheduleLabel,
    type QaapWorkHubRoutine,
    type QaapWorkHubRoutineTrigger,
} from '../common/qaap-work-hub-routine';
import {
    buildWorkHubInboxItems,
    githubRepoKeysForProjects,
    pullRequestKey,
    pullRequestMatchesQuery,
    type MobileWorkHubInboxItem,
} from './mobile-work-hub-inbox';
import { MobileOnboardingTutorialContribution } from './mobile-onboarding-tutorial-contribution';
import { MobileWorkHubInboxStream } from './mobile-work-hub-inbox-stream';
import { Widget } from '@lumino/widgets';
import {
    QAAP_GIT_REVIEW_API_PATH,
    type QaapGitChangedFile,
} from '../common/qaap-git-review';
import {
    QaapDiffReviewWidget,
    type QaapDiffReviewRepositoryContext,
} from './qaap-diff-review-widget';

export interface MobileProjectsPanelDelegate {
    onProjectOpen(project: MobileProjectEntry): void;
    onDismiss(): void;
    /** Work Hub inbox: open the mobile PR review sheet for this pull request. */
    onOpenPullRequest?(pullRequest: QaapGithubPullRequestSummary): void;
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
    /** GitHub webhook inbox SSE — refreshes the Work Hub inbox without polling. */
    inboxStream?: MobileWorkHubInboxStream;
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
    /** Embeds the diff-review React surface inside the Work Hub. */
    createDiffReviewWidget?: () => Promise<QaapDiffReviewWidget>;
    /** Same picker as the Agent chat input attach control. */
    pickContextVariable?: () => Promise<AIVariableResolutionRequest | undefined>;
    /** Variables offered for `#` completion in the sticky composer (same pool as Agent chat). */
    getComposerVariables?: () => readonly AIVariable[];
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

interface QaapDiffProjectTab {
    projectId: string;
    label: string;
    rootUri: string;
    rootFsPath: string;
    isActiveWorkspace: boolean;
    fileCount: number;
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

    /** Max conversation rows per repo card before "More" expands the list. */
    protected static readonly CONVERSATIONS_COLLAPSED_LIMIT = 6;

    protected readonly root: HTMLElement;
    protected readonly scroll: HTMLElement;
    protected readonly stickyComposerHost: HTMLElement;
    protected readonly subtitleEl: HTMLElement;
    protected readonly filterRow: HTMLElement;
    protected readonly searchInput: HTMLInputElement;
    protected readonly accountBtn: HTMLButtonElement;
    protected readonly accountAvatar: HTMLSpanElement;
    protected readonly titleBlock: HTMLElement;
    protected readonly titleRow: HTMLElement;
    protected readonly titleEl: HTMLHeadingElement;
    protected readonly headerBackBtn: HTMLButtonElement;
    protected readonly newFabBtn: HTMLButtonElement;
    protected filter: MobileProjectFilter = 'all';
    protected hubView: MobileProjectsHubView = 'repos';
    protected query = '';
    /** Project ids whose conversation list is fully expanded (not capped at {@link CONVERSATIONS_COLLAPSED_LIMIT}). */
    protected readonly expandedConversationProjectIds = new Set<string>();
    protected readonly diffProjectTabsHost: HTMLElement;
    protected readonly diffWidgetHost: HTMLElement;
    protected diffProjectTabs: QaapDiffProjectTab[] = [];
    protected diffActiveProjectId: string | undefined;
    protected diffReviewWidget: QaapDiffReviewWidget | undefined;
    protected diffScanning = false;
    protected diffPendingPreferredProjectId: string | undefined;
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
    /** Last measured lift for the home FAB so it does not jump when the sticky composer hides. */
    protected stickyComposerFabLiftPx = 0;
    protected stickyComposerFabLiftObserver: ResizeObserver | undefined;
    protected stickyComposerDraft = '';
    protected stickyComposerContext: AIVariableResolutionRequest[] = [];
    protected stickyComposerPinnedAgentId: string | undefined;
    protected stickyComposerBackendAgents: QaapAgentTaskAgentOption[] = [];
    protected stickyComposerToolsWidget: MobileProjectAIChatInputWidget | undefined;
    protected stickyComposerToolsHost: HTMLElement | undefined;
    protected stickyComposerAgentSheet: HTMLElement | undefined;
    protected stickyComposerModeSheet: HTMLElement | undefined;
    protected stickyComposerModeId: string | undefined;
    protected transcriptComposerHost: HTMLElement | undefined;
    protected transcriptComposerProject: MobileProjectEntry | undefined;
    protected transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    protected transcriptComposerContext: AIVariableResolutionRequest[] = [];
    protected transcriptComposerPinnedAgentId: string | undefined;
    protected transcriptComposerDraft = '';
    protected transcriptComposerBackendAgents: QaapAgentTaskAgentOption[] = [];
    protected transcriptComposerAgentSheet: HTMLElement | undefined;
    protected transcriptComposerModeSheet: HTMLElement | undefined;
    protected transcriptComposerModeId: string | undefined;
    protected transcriptComposerToolsHost: HTMLElement | undefined;
    protected transcriptComposerToolsWidget: MobileProjectAIChatInputWidget | undefined;
    protected agentChatInputSession: ChatSession | undefined;
    protected transcriptChatInputWidget: AIChatInputWidget | undefined;
    protected transcriptChatViewWidget: MobileProjectChatViewWidget | undefined;
    protected transcriptRefreshTimer: number | undefined;
    protected transcriptChatHost: HTMLElement | undefined;
    protected transcriptOpenSummaryId: string | undefined;
    protected transcriptLastFingerprint: string | undefined;
    protected transcriptLiveUpdatesDispose: Disposable = Disposable.NULL;
    protected readonly transcriptTheiaSessionByConversationId = new Map<string, string>();
    /** Monotonic counter that disambiguates each AIChatInputWidget instance from the WidgetManager cache. */
    protected agentChatInputMountSeq = 0;
    /** Last-flashed task id — drives the highlight animation when a fresh task appears. */
    protected justAddedTaskId: string | undefined;
    /** cwd resolved after clone/prepare — keyed by project id when uri is not yet on the card. */
    protected readonly preparedCwdByProjectId = new Map<string, string>();
    protected inboxPullRequests: QaapGithubPullRequestSummary[] = [];
    protected inboxPullRequestsLoading = false;
    protected inboxPullRequestsLoaded = false;
    /** Server GitHub session for inbox PRs (undefined when no GitHub repos in the hub). */
    protected inboxGithubSignedIn: boolean | undefined;
    /** Bumps when the inbox tab is re-entered so stale PR fetches cannot repaint. */
    protected inboxLoadGeneration = 0;
    protected inboxPullRequestsAbort: AbortController | undefined;
    protected static readonly INBOX_PR_FETCH_TIMEOUT_MS = 20_000;
    protected workHubRoutines: QaapWorkHubRoutine[] = [];
    protected workHubRoutinesLoading = false;
    protected workHubRoutinesLoaded = false;
    protected workHubRoutinesDefaultAgent: string | undefined;
    protected routineSheet: HTMLElement | undefined;
    protected editingRoutineId: string | undefined;
    protected routinesRefreshTimer: number | undefined;
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
    protected readonly inboxStream: MobileWorkHubInboxStream | undefined;
    protected readonly conversationFlags: MobileProjectsConversationFlags | undefined;
    protected readonly createChatInputWidget: MobileProjectsPanelOptions['createChatInputWidget'];
    protected readonly createChatViewWidget: MobileProjectsPanelOptions['createChatViewWidget'];
    protected readonly createDiffReviewWidget: MobileProjectsPanelOptions['createDiffReviewWidget'];
    protected readonly pickContextVariable: MobileProjectsPanelOptions['pickContextVariable'];
    protected readonly getComposerVariables: MobileProjectsPanelOptions['getComposerVariables'];
    protected readonly chatService: ChatService | undefined;
    protected readonly chatAgentService: ChatAgentService | undefined;
    protected readonly messageService: MessageService | undefined;
    protected activeTasksDispose: Disposable = Disposable.NULL;
    protected conversationsDispose: Disposable = Disposable.NULL;
    protected inboxStreamDispose: Disposable = Disposable.NULL;
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

    protected readonly onAuthSessionChanged = (): void => {
        this.updateAccountAvatar();
        if (this.hubView === 'chats') {
            this.resetInboxPullRequestState();
            void this.refreshInboxPullRequests(undefined, true);
        }
    };

    protected readonly onAccountClick = (): void => {
        toggleQaapAccountMenu(
            this.accountBtn,
            this.commands,
            buildQaapAccountMenuSignOutOnly(readQaapSignedIn()),
            {
                section: QAAP_WORK_HUB_GETTING_STARTED,
                onCatalogAction: action => { void this.runCatalogAction(action); },
            },
        );
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
        this.inboxStream = options.inboxStream;
        this.conversationFlags = options.conversationFlags;
        this.createChatInputWidget = options.createChatInputWidget;
        this.createChatViewWidget = options.createChatViewWidget;
        this.createDiffReviewWidget = options.createDiffReviewWidget;
        this.pickContextVariable = options.pickContextVariable;
        this.getComposerVariables = options.getComposerVariables;
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

        this.titleBlock = document.createElement('div');
        this.titleBlock.className = 'theia-mobile-projects-title-block';
        this.titleRow = document.createElement('div');
        this.titleRow.className = 'theia-mobile-projects-title-row';
        this.headerBackBtn = document.createElement('button');
        this.headerBackBtn.type = 'button';
        this.headerBackBtn.className = 'theia-mobile-projects-header-back';
        this.headerBackBtn.hidden = true;
        this.headerBackBtn.setAttribute('aria-hidden', 'true');
        this.headerBackBtn.title = nls.localize('qaap/mobileProjects/backToProjects', 'Back to projects');
        this.headerBackBtn.setAttribute('aria-label', this.headerBackBtn.title);
        this.headerBackBtn.innerHTML = '<span class="codicon codicon-chevron-left" aria-hidden="true"></span>';
        this.headerBackBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            this.closeProjectDetail();
        });
        this.titleEl = document.createElement('h1');
        this.titleEl.className = 'theia-mobile-projects-title';
        this.titleEl.textContent = nls.localize('qaap/mobileProjects/title', 'Work Hub');
        this.subtitleEl = document.createElement('div');
        this.subtitleEl.className = this.homeMode ? 'theia-mobile-projects-subtitle' : 'theia-mobile-projects-meta';
        this.titleRow.append(this.headerBackBtn, this.titleEl);
        this.titleBlock.append(this.titleRow, this.subtitleEl);

        const actions = document.createElement('div');
        actions.className = 'theia-mobile-projects-header-actions';

        this.accountBtn = document.createElement('button');
        this.accountBtn.type = 'button';
        this.accountBtn.className = 'theia-workbench-nav-btn theia-workbench-account-btn';
        this.accountBtn.title = nls.localize('qaap/accountMenu/title', 'Account');
        this.accountBtn.setAttribute('aria-haspopup', 'menu');
        this.accountAvatar = document.createElement('span');
        this.accountAvatar.className = 'theia-workbench-account-avatar';
        this.accountAvatar.setAttribute('aria-hidden', 'true');
        this.accountBtn.appendChild(this.accountAvatar);
        this.accountBtn.addEventListener('click', this.onAccountClick);
        actions.append(this.accountBtn);
        header.append(this.titleBlock, actions);

        this.newFabBtn = document.createElement('button');
        this.newFabBtn.type = 'button';
        this.newFabBtn.className = 'theia-mobile-projects-fab';
        this.newFabBtn.title = nls.localize('qaap/mobileProjects/new', 'New');
        this.newFabBtn.setAttribute('aria-label', nls.localize('qaap/mobileProjects/new', 'New'));
        this.newFabBtn.innerHTML = '<span class="codicon codicon-add" aria-hidden="true"></span>';
        this.newFabBtn.hidden = true;
        this.newFabBtn.addEventListener('click', () => { void this.onNewClick(); });
        if (this.homeMode) {
            this.newFabBtn.classList.add('theia-mod-header-action');
            actions.insertBefore(this.newFabBtn, this.accountBtn);
        }

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
            if (this.query && this.homeMode && this.expandedId !== undefined) {
                this.expandedId = undefined;
                this.soloExpanded = false;
            } else if (this.query) {
                // Keep expanded repo + its conversations; only stop hiding other rows while searching.
                this.soloExpanded = this.expandedId !== undefined;
            }
            this.renderList();
        });
        searchWrap.append(searchIcon, this.searchInput);

        this.filterRow = document.createElement('div');
        this.filterRow.className = 'theia-mobile-projects-filters';
        this.filterRow.setAttribute('role', 'tablist');

        this.scroll = document.createElement('div');
        this.scroll.className = 'theia-mobile-projects-scroll';

        this.diffProjectTabsHost = document.createElement('div');
        this.diffProjectTabsHost.className = 'theia-mobile-projects-diff-tabs';
        this.diffProjectTabsHost.hidden = true;
        this.diffWidgetHost = document.createElement('div');
        this.diffWidgetHost.className = 'theia-mobile-projects-diff-widget-host';
        this.diffWidgetHost.hidden = true;

        this.stickyComposerHost = document.createElement('div');
        this.stickyComposerHost.className = 'theia-mobile-projects-sticky-composer';
        this.stickyComposerHost.hidden = true;

        this.root.append(
            grabber,
            header,
            searchWrap,
            this.filterRow,
            this.scroll,
            this.stickyComposerHost,
            ...(this.homeMode ? [] : [this.newFabBtn]),
        );

        if (typeof ResizeObserver !== 'undefined') {
            this.stickyComposerFabLiftObserver = new ResizeObserver(() => {
                if (!this.stickyComposerHost.hidden) {
                    this.updateStickyComposerFabLift();
                }
            });
            this.stickyComposerFabLiftObserver.observe(this.stickyComposerHost);
        }

        this.titleBlock.addEventListener('click', () => this.onTitleTap());
        window.addEventListener('qaap-auth-session-changed', this.onAuthSessionChanged);
        this.updateAccountAvatar();

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
                if (this.hubView === 'chats') {
                    await this.refreshInboxPullRequests(undefined, true);
                }
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

    getHubView(): MobileProjectsHubView {
        return this.hubView;
    }

    /** Work Hub home: user drilled into a single repository (chats + sticky composer). */
    isProjectDetailView(): boolean {
        return this.homeMode && this.hubView === 'repos' && this.expandedId !== undefined;
    }

    /** Leave the per-project chats surface and return to the repository list. */
    closeProjectDetail(): void {
        if (!this.expandedId) {
            return;
        }
        const wasCurrent = this.projects.some(p => p.id === this.expandedId && p.isCurrent);
        this.expandedId = undefined;
        this.soloExpanded = false;
        if (wasCurrent) {
            this.suppressCurrentAutoExpand = true;
        }
        this.disposeStickyComposerTools();
        this.stickyComposerContext = [];
        this.stickyComposerPinnedAgentId = undefined;
        this.stickyComposerModeId = undefined;
        this.render();
        this.syncLandingHubListChrome();
        this.delegate.onProjectsChanged?.();
    }

    /** Work Hub landing: repos list, chats inbox, or diff review (collapses any expanded repo row). */
    selectHubLandingView(view: MobileProjectsHubView, preferredDiffProjectId?: string): void {
        if (this.hubView === view && view === 'repos' && this.expandedId === undefined) {
            return;
        }
        if (this.hubView === view && view === 'diff' && !preferredDiffProjectId) {
            void this.refreshDiffHubView();
            return;
        }
        if (this.hubView === view && view === 'chats') {
            this.conversations?.start();
            this.inboxStream?.start();
            this.subscribeToInboxStream();
            void this.refreshInboxPullRequests(undefined, true);
            this.render();
            return;
        }
        if (this.hubView === view && view === 'workflows') {
            this.render();
            return;
        }
        if (this.hubView === view && view === 'routines') {
            void this.refreshWorkHubRoutines(true);
            return;
        }
        this.hubView = view;
        this.projectsService.setHubView(view);
        this.expandedId = undefined;
        this.soloExpanded = false;
        if (view === 'routines') {
            void this.refreshWorkHubRoutines(true);
        }
        if (view === 'chats') {
            this.inboxLoadGeneration++;
            this.inboxPullRequestsLoaded = false;
            this.inboxStream?.start();
            this.subscribeToInboxStream();
            void this.refreshInboxPullRequests(undefined, true);
        }
        if (view === 'diff') {
            this.diffPendingPreferredProjectId = preferredDiffProjectId;
        }
        this.render();
        this.syncLandingHubListChrome();
        if (view === 'diff') {
            void this.refreshDiffHubView();
        } else {
            this.detachDiffReviewWidget();
        }
    }

    /** Open the cross-project diff surface inside Work Hub (commands, notifications, deep links). */
    async openDiffView(preferredProjectId?: string): Promise<void> {
        if (!this.visible) {
            await this.show();
        }
        this.selectHubLandingView('diff', preferredProjectId);
    }

    protected updateAccountAvatar(): void {
        renderQaapAccountAvatarVisual(this.accountAvatar, { titleTarget: this.accountBtn });
    }

    dispose(): void {
        dismissQaapAccountMenu();
        window.clearTimeout(this.routinesRefreshTimer);
        this.closeRoutineEditor();
        window.removeEventListener('qaap-auth-session-changed', this.onAuthSessionChanged);
        this.accountBtn.removeEventListener('click', this.onAccountClick);
        this.closeCardMenu();
        this.disposeStickyComposerTools();
        this.dragDismissDispose.dispose();
        this.dragDismissDispose = Disposable.NULL;
        this.pullToRefreshDispose.dispose();
        this.pullToRefreshDispose = Disposable.NULL;
        this.activeTasksDispose.dispose();
        this.activeTasksDispose = Disposable.NULL;
        this.conversationsDispose.dispose();
        this.conversationsDispose = Disposable.NULL;
        this.inboxStreamDispose.dispose();
        this.inboxStreamDispose = Disposable.NULL;
        this.chatServiceDispose.dispose();
        this.chatServiceDispose = Disposable.NULL;
        this.disposeChatSessionModelListeners();
        this.closeTranscriptSheet();
        this.stickyComposerFabLiftObserver?.disconnect();
        this.stickyComposerFabLiftObserver = undefined;
        this.detachDiffReviewWidget();
        setMobileLandingHubListChrome(false);
    }

    async show(): Promise<void> {
        this.projects = await this.projectsService.loadProjects();
        await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
        await this.refreshChatServiceSessionSummaries();
        this.filter = this.projectsService.getFilter();
        this.hubView = this.projectsService.getHubView();
        this.updateSearchPlaceholder();
        this.render();
        if (this.hubView === 'diff') {
            void this.refreshDiffHubView();
        }
        if (this.hubView === 'chats') {
            this.conversations?.start();
            this.inboxStream?.start();
            this.subscribeToInboxStream();
            void this.refreshInboxPullRequests(undefined, true);
        }
        this.visible = true;
        this.root.hidden = false;
        this.root.setAttribute('aria-hidden', 'false');
        this.root.classList.add('theia-mod-visible');
        document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
        this.updateAccountAvatar();
        this.subscribeToActiveTasks();
        this.syncLandingHubListChrome();
    }

    hide(): void {
        if (!this.visible) {
            return;
        }
        this.closeCardMenu();
        dismissQaapAccountMenu();
        this.openRepoDialog?.hide();
        document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
        this.activeTasksDispose.dispose();
        this.activeTasksDispose = Disposable.NULL;
        this.conversationsDispose.dispose();
        this.conversationsDispose = Disposable.NULL;
        this.inboxStreamDispose.dispose();
        this.inboxStreamDispose = Disposable.NULL;
        this.chatServiceDispose.dispose();
        this.chatServiceDispose = Disposable.NULL;
        this.disposeChatSessionModelListeners();
        this.closeTranscriptSheet();
        this.visible = false;
        this.root.hidden = true;
        this.root.setAttribute('aria-hidden', 'true');
        this.root.classList.remove('theia-mod-visible');
        this.syncLandingHubListChrome();
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
                if (this.visible && !this.transcriptSheet) {
                    void this.applyActiveTasksRefresh();
                }
            });
        }
        if (this.conversations) {
            this.conversations.start();
            this.conversationsDispose = this.conversations.onDidChange(() => {
                if (this.visible && !this.transcriptSheet) {
                    void this.applyActiveTasksRefresh();
                }
            });
        }
        this.subscribeToChatServiceSessions();
        this.subscribeToInboxStream();
    }

    protected subscribeToInboxStream(): void {
        this.inboxStreamDispose.dispose();
        if (!this.inboxStream) {
            this.inboxStreamDispose = Disposable.NULL;
            return;
        }
        this.inboxStreamDispose = this.inboxStream.onDidChange(() => {
            if (!this.visible || this.hubView !== 'chats' || this.transcriptSheet) {
                return;
            }
            this.inboxPullRequests = this.mergeInboxPullRequests(this.inboxPullRequests);
            this.inboxPullRequestsLoaded = true;
            this.renderList();
        });
    }

    protected mergeInboxPullRequests(polled: QaapGithubPullRequestSummary[]): QaapGithubPullRequestSummary[] {
        const live = this.inboxStream?.getLivePullRequests() ?? [];
        const merged = new Map<string, QaapGithubPullRequestSummary>();
        for (const pullRequest of polled) {
            merged.set(pullRequestKey(pullRequest), pullRequest);
        }
        for (const pullRequest of live) {
            merged.set(pullRequestKey(pullRequest), pullRequest);
        }
        return [...merged.values()].sort(
            (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
        );
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
        if (this.transcriptSheet || !this.visible || this.chatServiceRefreshHandle !== undefined) {
            return;
        }
        this.chatServiceRefreshHandle = window.setTimeout(() => {
            this.chatServiceRefreshHandle = undefined;
            void this.applyActiveTasksRefresh();
        }, 120);
    }

    protected async applyActiveTasksRefresh(): Promise<void> {
        if (this.transcriptSheet) {
            return;
        }
        try {
            this.projects = await this.projectsService.loadProjects();
            await this.conversations?.refreshTheiaChatSessionsForProjects(this.projects);
            await this.refreshChatServiceSessionSummaries();
            this.renderSubtitle();
            this.renderFilters();
            // While the user is interacting with the expanded agent composer, do NOT rebuild the
            // list — renderList() disposes and remounts the AIChatInputWidget, which would wipe
            // their draft and break the in-place chrome. Only refresh ambient chrome (subtitle,
            // filter counts). The card visuals catch up the next time the user collapses/expands.
            this.renderList();
            this.renderStickyComposer();
        } catch {
            /* a transient load failure must not break the live view */
        }
    }

    protected renderHeader(): void {
        const inProjectDetail = this.isProjectDetailView();
        this.headerBackBtn.hidden = !inProjectDetail;
        this.headerBackBtn.setAttribute('aria-hidden', inProjectDetail ? 'false' : 'true');
        this.titleBlock.classList.toggle('theia-mod-with-back', inProjectDetail);

        if (this.hubView === 'diff') {
            this.titleEl.textContent = nls.localize('qaap/diff/reviewLabel', 'Working changes');
            return;
        }
        if (this.hubView === 'chats') {
            this.titleEl.textContent = nls.localize('qaap/mobileProjects/inboxTitle', 'Inbox');
            return;
        }
        if (this.hubView === 'workflows') {
            this.titleEl.textContent = nls.localize('qaap/mobileProjects/workflowsTitle', 'Workflows');
            return;
        }
        if (this.hubView === 'routines') {
            this.titleEl.textContent = nls.localize('qaap/mobileProjects/routinesTitle', 'Routines');
            return;
        }
        if (inProjectDetail) {
            const appName = FrontendApplicationConfigProvider.get().applicationName?.trim();
            this.titleEl.textContent = appName || nls.localize('qaap/mobileProjects/title', 'Work Hub');
            return;
        }
        if (this.homeMode) {
            const appName = FrontendApplicationConfigProvider.get().applicationName?.trim();
            this.titleEl.textContent = appName || nls.localize('qaap/mobileProjects/title', 'Work Hub');
            return;
        }
        this.titleEl.textContent = nls.localize('qaap/mobileProjects/title', 'Work Hub');
    }

    protected renderSubtitle(): void {
        if (this.hubView === 'diff') {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            const count = this.diffProjectTabs.length;
            this.subtitleEl.textContent = count === 1
                ? nls.localize('qaap/diff/oneProjectWithChanges', '1 project with changes')
                : nls.localize('qaap/diff/nProjectsWithChanges', '{0} projects with changes', String(count));
            return;
        }
        if (this.homeMode && this.hubView === 'workflows') {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            const filtered = filterCatalogSections(QAAP_WORK_HUB_WORKFLOWS, this.query);
            const count = countCatalogItems(filtered);
            this.subtitleEl.textContent = nls.localize(
                'qaap/mobileProjects/workflowsSubtitle',
                '{0} agent workflows for the Qaap mobile workbench',
                String(count),
            );
            return;
        }
        if (this.homeMode && this.hubView === 'routines') {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            const visible = filterRoutinesByQuery(this.workHubRoutines, this.query);
            const running = visible.filter(r => r.lastRunState === 'running').length;
            if (this.workHubRoutinesLoading && !this.workHubRoutinesLoaded) {
                this.subtitleEl.textContent = nls.localize('qaap/mobileProjects/routinesLoading', 'Loading routines…');
            } else if (running > 0) {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/routinesSubtitleRunning',
                    '{0} routines · {1} running on the VPS',
                    String(visible.length),
                    String(running),
                );
            } else {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/routinesSubtitle',
                    '{0} VPS routines · tap Run or enable a schedule',
                    String(visible.length),
                );
            }
            return;
        }
        if (this.homeMode && this.hubView === 'chats') {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            const prCount = this.inboxPullRequests.length;
            const agentCount = this.projects.reduce(
                (sum, project) => sum + this.conversationsForProject(project).filter(c => c.status === 'streaming').length,
                0,
            );
            if (this.inboxPullRequestsLoading && !this.inboxPullRequestsLoaded) {
                this.subtitleEl.textContent = nls.localize('qaap/mobileProjects/inboxLoading', 'Loading inbox…');
            } else if (this.inboxPullRequestsLoading && this.inboxPullRequestsLoaded) {
                this.subtitleEl.textContent = nls.localize('qaap/mobileProjects/inboxRefreshing', 'Refreshing pull requests…');
            } else if (prCount > 0 && agentCount > 0) {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/inboxSubtitlePrAndAgents',
                    '{0} open PRs · {1} agents active',
                    String(prCount),
                    String(agentCount),
                );
            } else if (prCount > 0) {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/inboxSubtitlePrs',
                    '{0} open pull requests',
                    String(prCount),
                );
            } else {
                this.subtitleEl.textContent = nls.localize(
                    'qaap/mobileProjects/inboxSubtitle',
                    'Pull requests and agent activity',
                );
            }
            return;
        }
        if (this.isProjectDetailView()) {
            const project = this.resolveSelectedProject();
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            if (!project) {
                this.subtitleEl.textContent = '';
                return;
            }
            const parts: string[] = [project.name, project.branch];
            if (project.lastActive && project.lastActive !== '—') {
                parts.push(project.lastActive);
            }
            if (project.isCurrent) {
                parts.push(nls.localize('qaap/mobileProjects/ideOpen', 'IDE open'));
            }
            this.subtitleEl.textContent = parts.join(' · ');
            return;
        }
        if (this.homeMode) {
            this.subtitleEl.className = 'theia-mobile-projects-subtitle';
            this.subtitleEl.textContent = nls.localize('qaap/mobileProjects/homeSubtitle', 'Projects');
            return;
        }
        this.subtitleEl.className = 'theia-mobile-projects-meta';
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
    protected summaryToTaskView(conversation: QaapAgentConversationSummaryDTO): MobileProjectTaskView {
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

    protected tasksForProject(project: MobileProjectEntry): MobileProjectTaskView[] {
        const conversations = this.conversationsForProject(project);
        if (conversations.length === 0) {
            return this.fallbackTasksFromProject(project);
        }
        return conversations.map(c => this.summaryToTaskView(c));
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
        if (this.hubView === 'routines') {
            this.openRoutineEditor();
            return;
        }
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
        this.root.classList.toggle('theia-mod-hub-diff', this.hubView === 'diff');
        this.root.classList.toggle('theia-mod-hub-inbox', this.hubView === 'chats');
        this.root.classList.toggle('theia-mod-hub-workflows', this.hubView === 'workflows');
        this.root.classList.toggle('theia-mod-hub-routines', this.hubView === 'routines');
        this.root.classList.toggle('theia-mod-project-detail', this.isProjectDetailView());
        this.renderHeader();
        this.renderSubtitle();
        this.syncHubViewAvailability();
        this.renderFilters();
        this.updateSearchPlaceholder();
        this.renderList();
    }

    protected updateSearchPlaceholder(): void {
        if (this.hubView === 'chats') {
            this.searchInput.placeholder = nls.localize(
                'qaap/mobileProjects/searchInboxPlaceholder',
                'Search PRs, agents, and messages',
            );
        } else if (this.hubView === 'workflows') {
            this.searchInput.placeholder = nls.localize(
                'qaap/mobileProjects/searchWorkflowsPlaceholder',
                'Search workflows and guides',
            );
        } else if (this.hubView === 'routines') {
            this.searchInput.placeholder = nls.localize(
                'qaap/mobileProjects/searchRoutinesPlaceholder',
                'Search routines and automations',
            );
        } else {
            this.searchInput.placeholder = nls.localize(
                'qaap/mobileProjects/searchPlaceholder',
                'Search repositories and chats',
            );
        }
    }

    protected syncHubViewAvailability(): void {
        // Inbox is PRs + optional agent threads; keep the tab even when the VPS conversation service is absent.
    }

    /** Projects included in the current hub list (inbox ignores Active/Pinned filters). */
    protected projectsForCurrentHubList(): MobileProjectEntry[] {
        const base = this.hubView === 'chats'
            ? this.projects
            : this.applyFilter(this.projects, this.filter);
        return this.applySearch(base);
    }

    protected renderFilters(): void {
        const searchWrap = this.searchInput.parentElement;
        const hideRepoChrome = this.hubView === 'diff'
            || this.hubView === 'chats'
            || this.hubView === 'workflows'
            || this.hubView === 'routines'
            || this.isProjectDetailView();
        if (searchWrap) {
            searchWrap.hidden = hideRepoChrome;
        }
        this.filterRow.hidden = hideRepoChrome;
        if (hideRepoChrome) {
            this.filterRow.replaceChildren();
            return;
        }
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
                const filtered = this.applySearch(this.applyFilter(this.projects, this.filter));
                if (this.expandedId !== undefined && !filtered.some(p => p.id === this.expandedId)) {
                    this.expandedId = undefined;
                }
                // Show every repo that matches the tab; solo mode would hide matches when
                // expandedId pointed at a repo outside this filter (e.g. Active count > 0, empty list).
                this.soloExpanded = false;
                this.renderFilters();
                this.renderList();
            });
            this.filterRow.append(btn);
        }
    }

    protected renderList(): void {
        this.closeCardMenu();
        this.scroll.replaceChildren();
        try {
            if (this.hubView === 'diff') {
                this.renderDiffHubView();
                return;
            }
            this.diffProjectTabsHost.hidden = true;
            this.diffWidgetHost.hidden = true;

            const filtered = this.projectsForCurrentHubList();

            if (this.hubView === 'chats') {
                this.renderChatsInbox(filtered);
                return;
            }
            if (this.hubView === 'workflows') {
                this.renderCatalogHubView();
                return;
            }
            if (this.hubView === 'routines') {
                this.renderRoutinesHubView();
                return;
            }

            if (filtered.length === 0) {
                this.scroll.append(this.createEmptyState());
                return;
            }

            if (this.homeMode && this.expandedId !== undefined) {
                const selected = filtered.find(p => p.id === this.expandedId)
                    ?? this.projects.find(p => p.id === this.expandedId);
                if (selected) {
                    this.scroll.append(this.createProjectDetailView(selected));
                    return;
                }
                this.expandedId = undefined;
                this.soloExpanded = false;
            }

            if (!this.homeMode && this.expandedId === undefined && !this.suppressCurrentAutoExpand) {
                const current = filtered.find(p => p.isCurrent);
                if (current) {
                    this.expandedId = current.id;
                    this.soloExpanded = true;
                }
            }

            let visible = filtered;
            if (!this.homeMode && this.soloExpanded && this.expandedId !== undefined) {
                visible = filtered.filter(p => p.id === this.expandedId);
                if (visible.length === 0) {
                    visible = filtered;
                    this.soloExpanded = false;
                }
            }

            const list = document.createElement('div');
            list.className = 'theia-mobile-projects-rows';
            for (const p of visible) {
                list.append(this.createRow(p));
            }
            this.scroll.append(list);
        } finally {
            this.updateNewFabVisibility();
            this.syncLandingHubListChrome();
            if (this.homeMode) {
                this.renderStickyComposer();
            }
        }
    }

    /** FAB opens "new repository"; hide while a repo row is expanded (conversations + composer). */
    protected updateNewFabVisibility(): void {
        const repoExpanded = this.hubView === 'repos' && this.expandedId !== undefined;
        this.root.classList.toggle('theia-mod-repo-expanded', repoExpanded);
        const showRepoFab = this.hubView === 'repos' && !repoExpanded;
        const showRoutineFab = this.hubView === 'routines';
        const showFab = showRepoFab || showRoutineFab;
        this.newFabBtn.hidden = !showFab;
        this.newFabBtn.setAttribute('aria-hidden', showFab ? 'false' : 'true');
        this.newFabBtn.title = showRoutineFab
            ? nls.localize('qaap/mobileProjects/newRoutine', 'New routine')
            : nls.localize('qaap/mobileProjects/newRepository', 'Add repository');
        this.newFabBtn.setAttribute('aria-label', this.newFabBtn.title);
    }

    /**
     * Landing hub list (no expanded project): show the global bottom nav. Hide it while a project
     * row is expanded so the user can focus on chats and the sticky composer.
     */
    protected syncLandingHubListChrome(): void {
        if (!this.homeMode) {
            setMobileLandingHubListChrome(false);
            return;
        }
        const hubList = this.visible && this.expandedId === undefined;
        setMobileLandingHubListChrome(hubList);
    }

    protected renderDiffHubView(): void {
        this.newFabBtn.hidden = true;
        this.stickyComposerHost.hidden = true;
        this.root.classList.remove('theia-mod-sticky-composer');
        this.scroll.append(this.diffProjectTabsHost, this.diffWidgetHost);
        this.diffProjectTabsHost.hidden = false;
        this.diffWidgetHost.hidden = false;
        this.renderDiffProjectTabs();
        if (this.diffScanning) {
            this.detachDiffReviewWidget();
            const loading = document.createElement('div');
            loading.className = 'theia-mobile-projects-diff-loading';
            loading.textContent = nls.localize('qaap/diff/scanningProjects', 'Scanning projects for changes…');
            this.diffWidgetHost.replaceChildren(loading);
            return;
        }
        if (this.diffProjectTabs.length === 0) {
            this.detachDiffReviewWidget();
            const empty = document.createElement('div');
            empty.className = 'theia-mobile-projects-diff-empty';
            empty.innerHTML = `<i class="codicon codicon-check-all" aria-hidden="true"></i>`
                + `<p>${nls.localize('qaap/diff/noChangesAnyProject', 'No pending changes across your projects.')}</p>`
                + `<span>${nls.localize('qaap/diff/noChangesHint', 'Edits made by you or an agent will show up here.')}</span>`;
            this.diffWidgetHost.replaceChildren(empty);
            return;
        }
        void this.mountDiffReviewWidget();
    }

    protected renderDiffProjectTabs(): void {
        this.diffProjectTabsHost.replaceChildren();
        if (this.diffProjectTabs.length <= 1) {
            this.diffProjectTabsHost.hidden = this.diffProjectTabs.length === 0;
            return;
        }
        this.diffProjectTabsHost.hidden = false;
        const bar = document.createElement('div');
        bar.className = 'theia-mobile-projects-diff-tabs-bar';
        bar.setAttribute('role', 'tablist');
        for (const tab of this.diffProjectTabs) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-diff-tab';
            btn.setAttribute('role', 'tab');
            const active = tab.projectId === this.diffActiveProjectId;
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
            if (active) {
                btn.classList.add('theia-mod-active');
            }
            const label = document.createElement('span');
            label.className = 'theia-mobile-projects-diff-tab-label';
            label.textContent = tab.label;
            const count = document.createElement('span');
            count.className = 'theia-mobile-projects-diff-tab-count';
            count.textContent = String(tab.fileCount);
            btn.append(label, count);
            btn.addEventListener('click', () => {
                if (this.diffActiveProjectId !== tab.projectId) {
                    this.diffActiveProjectId = tab.projectId;
                    this.renderDiffProjectTabs();
                    void this.applyDiffTabToWidget(tab);
                }
            });
            bar.append(btn);
        }
        this.diffProjectTabsHost.append(bar);
    }

    protected async refreshDiffHubView(): Promise<void> {
        if (!this.createDiffReviewWidget) {
            return;
        }
        this.diffScanning = true;
        this.renderDiffHubView();
        try {
            const tabs = await this.scanProjectsWithChanges();
            this.diffProjectTabs = tabs;
            const preferred = this.diffPendingPreferredProjectId;
            this.diffPendingPreferredProjectId = undefined;
            const pick = (preferred && tabs.some(t => t.projectId === preferred))
                ? preferred
                : tabs.find(t => t.isActiveWorkspace)?.projectId
                ?? tabs[0]?.projectId;
            this.diffActiveProjectId = pick;
        } finally {
            this.diffScanning = false;
            this.renderHeader();
            this.renderSubtitle();
            this.renderDiffHubView();
        }
    }

    protected async scanProjectsWithChanges(): Promise<QaapDiffProjectTab[]> {
        const tabs: QaapDiffProjectTab[] = [];
        const projects = this.projects.length > 0 ? this.projects : await this.projectsService.loadProjects();
        await Promise.all(projects.map(async project => {
            const cwd = this.projectsService.getProjectCwd(project);
            if (!cwd) {
                return;
            }
            const rootUri = project.uri?.toString() ?? `file://${cwd}`;
            try {
                const response = await fetch(
                    `${QAAP_GIT_REVIEW_API_PATH}/changes?root=${encodeURIComponent(cwd)}`,
                    { credentials: 'include' },
                );
                if (!response.ok) {
                    return;
                }
                const body = await response.json() as { files?: QaapGitChangedFile[] };
                const files = body.files ?? [];
                if (files.length === 0) {
                    return;
                }
                tabs.push({
                    projectId: project.id,
                    label: project.name,
                    rootUri,
                    rootFsPath: cwd,
                    isActiveWorkspace: project.isCurrent,
                    fileCount: files.length,
                });
            } catch {
                /* skip unreachable repos */
            }
        }));
        tabs.sort((a, b) => {
            if (a.isActiveWorkspace !== b.isActiveWorkspace) {
                return a.isActiveWorkspace ? -1 : 1;
            }
            return a.label.localeCompare(b.label);
        });
        return tabs;
    }

    protected async mountDiffReviewWidget(): Promise<void> {
        if (!this.createDiffReviewWidget) {
            return;
        }
        const tab = this.diffProjectTabs.find(t => t.projectId === this.diffActiveProjectId)
            ?? this.diffProjectTabs[0];
        if (!tab) {
            return;
        }
        this.diffActiveProjectId = tab.projectId;
        if (!this.diffReviewWidget) {
            this.diffReviewWidget = await this.createDiffReviewWidget();
            this.diffReviewWidget.node.classList.add('theia-mobile-projects-diff-embed');
            this.diffReviewWidget.enableWorkHubEmbed();
        }
        if (!this.diffReviewWidget.isAttached) {
            Widget.attach(this.diffReviewWidget, this.diffWidgetHost);
        } else if (this.diffReviewWidget.node.parentElement !== this.diffWidgetHost) {
            this.diffWidgetHost.appendChild(this.diffReviewWidget.node);
        }
        await this.applyDiffTabToWidget(tab);
    }

    protected async applyDiffTabToWidget(tab: QaapDiffProjectTab): Promise<void> {
        if (!this.diffReviewWidget) {
            return;
        }
        const context: QaapDiffReviewRepositoryContext = {
            rootUri: tab.rootUri,
            rootFsPath: tab.rootFsPath,
            isActiveWorkspace: tab.isActiveWorkspace,
        };
        this.diffReviewWidget.setRepositoryContext(context);
    }

    protected detachDiffReviewWidget(): void {
        if (this.diffReviewWidget?.isAttached) {
            Widget.detach(this.diffReviewWidget);
        }
    }

    protected resolveStickyComposerProject(projects: MobileProjectEntry[]): MobileProjectEntry | undefined {
        return this.resolveSelectedProject(projects);
    }

    protected resolveSelectedProject(
        projects: MobileProjectEntry[] = this.projectsForCurrentHubList(),
    ): MobileProjectEntry | undefined {
        if (this.expandedId === undefined) {
            return undefined;
        }
        return projects.find(p => p.id === this.expandedId)
            ?? this.projects.find(p => p.id === this.expandedId);
    }

    protected createProjectDetailView(project: MobileProjectEntry): HTMLElement {
        const detail = document.createElement('div');
        detail.className = 'theia-mobile-projects-detail';
        detail.style.setProperty('--qaap-mobile-project-accent', project.color);
        const activeInfo = this.activeInfoForProject(project);
        detail.append(this.createTaskBlock(project, activeInfo));
        return detail;
    }

    protected async onStickyComposerAttach(project: MobileProjectEntry): Promise<void> {
        if (!this.pickContextVariable) {
            return;
        }
        const variable = await this.pickContextVariable();
        if (!variable) {
            return;
        }
        if (this.stickyComposerToolsWidget && !this.stickyComposerToolsWidget.isDisposed) {
            this.stickyComposerToolsWidget.addContext(variable);
        }
        this.stickyComposerContext.push(variable);
        this.renderStickyComposer();
    }

    protected renderStickyComposer(): void {
        this.stickyComposerHost.replaceChildren();
        const filtered = this.applySearch(this.applyFilter(this.projects, this.filter));
        const project = this.resolveStickyComposerProject(filtered);
        const show = this.homeMode && !!this.conversations && !!project && this.hubView === 'repos';
        this.stickyComposerHost.hidden = !show;
        this.root.classList.toggle('theia-mod-sticky-composer', show);
        if (!show || !project) {
            this.closeStickyComposerSheets();
            return;
        }

        void this.refreshStickyComposerAgents(project);

        const canRunTask = !!project && (!!this.projectsService.getProjectCwd(project) || !!project.github);
        const pinnedId = this.resolveStickyComposerPinnedAgentId(project);
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        const modes = resolveStickyComposerModes(pinnedId, this.chatAgentService);
        this.stickyComposerModeId = reconcileComposerModeId(
            this.stickyComposerModeId,
            modes,
            cwd,
        );

        const column = this.buildStickyComposerColumn({
            project,
            getContext: () => this.stickyComposerContext,
            clearContext: () => {
                this.stickyComposerContext = [];
                this.renderStickyComposer();
            },
            getDraft: () => this.stickyComposerDraft,
            setDraft: value => { this.stickyComposerDraft = value; },
            resolveAgentLabel: () => this.resolveStickyComposerAgentLabel(),
            modes,
            resolveModeLabel: () => resolveComposerModeLabel(modes, this.stickyComposerModeId),
            onOpenModeSheet: modes.length > 1
                ? () => { this.openStickyComposerModeSheet(project, modes); }
                : undefined,
            canSubmit: canRunTask,
            onAttach: () => { void this.onStickyComposerAttach(project); },
            onOpenAgentSheet: () => { this.openStickyComposerAgentSheet(project); },
            onOpenToolsSheet: () => { void this.openStickyComposerToolsSheet(project); },
            onSubmit: draft => {
                const resolvedPinnedId = this.resolveStickyComposerPinnedAgentId(project);
                const selectedAgentId = resolveExplicitAgentForSubmit(draft, {
                    pinnedChatAgentId: resolvedPinnedId,
                }) ?? resolvedPinnedId;
                const widgetVars = this.stickyComposerToolsWidget && !this.stickyComposerToolsWidget.isDisposed
                    ? this.stickyComposerToolsWidget.getAllVariablesForRequest()
                    : [];
                const variables = [...this.stickyComposerContext, ...widgetVars];
                const capabilityOverrides = this.stickyComposerToolsWidget?.getCapabilityOverridesForSubmit();
                const genericCapabilitySelections = this.stickyComposerToolsWidget?.getGenericCapabilitySelectionsForSubmit();
                const modeId = this.stickyComposerModeId;
                this.stickyComposerContext = [];
                if (this.stickyComposerToolsWidget && !this.stickyComposerToolsWidget.isDisposed) {
                    this.stickyComposerToolsWidget.clearPendingImageAttachments();
                }
                void this.submitBackgroundAgentTask(project, draft, {
                    openConversation: false,
                    selectedAgentId,
                    modeId,
                    capabilityOverrides,
                    genericCapabilitySelections,
                    variables: variables.length > 0 ? variables : undefined,
                }).finally(() => this.renderStickyComposer());
            },
            onSubmitBlocked: () => {
                MobileSnackbar.show(
                    nls.localize('qaap/mobileProjects/stickyComposerNoProject', 'Add or open a repository first.'),
                    { duration: 2400 },
                );
            },
            afterInputChange: () => { /* sticky draft persisted in setDraft */ },
            getMentionOptions: () => this.resolveComposerMentionOptions(this.stickyComposerBackendAgents),
            getVariableOptions: this.getComposerVariables
                ? () => this.resolveComposerVariableOptions()
                : undefined,
        });
        this.stickyComposerHost.append(column);
        this.updateNewFabVisibility();
        window.requestAnimationFrame(() => this.updateStickyComposerFabLift());
    }

    protected updateStickyComposerFabLift(): void {
        if (this.homeMode) {
            this.stickyComposerFabLiftPx = 0;
            this.root.style.setProperty('--theia-mobile-projects-fab-lift', '0px');
            return;
        }
        const composerVisible = this.root.classList.contains('theia-mod-sticky-composer')
            && !this.stickyComposerHost.hidden
            && this.stickyComposerHost.offsetHeight > 0;
        if (composerVisible) {
            const lift = this.stickyComposerHost.offsetHeight;
            this.root.style.setProperty('--theia-mobile-projects-fab-lift', `${lift}px`);
            return;
        }
        this.root.style.setProperty('--theia-mobile-projects-fab-lift', '0px');
    }

    protected buildStickyComposerColumn(options: {
        project: MobileProjectEntry;
        getContext: () => AIVariableResolutionRequest[];
        clearContext: () => void;
        getDraft: () => string;
        setDraft: (value: string) => void;
        resolveAgentLabel: () => string;
        modes?: readonly ChatMode[];
        resolveModeLabel?: () => string;
        onOpenModeSheet?: () => void;
        canSubmit: boolean;
        onAttach: () => void;
        onOpenAgentSheet: () => void;
        onOpenToolsSheet: () => void;
        onSubmit: (draft: string) => void;
        onSubmitBlocked?: () => void;
        afterInputChange?: () => void;
        sendLabel?: string;
        getMentionOptions?: () => readonly StickyComposerTokenOption[];
        getVariableOptions?: () => readonly StickyComposerTokenOption[];
    }): HTMLElement {
        const column = document.createElement('div');
        column.className = 'theia-mobile-projects-sticky-composer-column';
        const contextItems = options.getContext();
        if (contextItems.length > 0) {
            const contextRow = document.createElement('div');
            contextRow.className = 'theia-mobile-projects-sticky-composer-context';
            const contextLabel = document.createElement('span');
            contextLabel.className = 'theia-mobile-projects-sticky-composer-context-label';
            contextLabel.textContent = nls.localize(
                'qaap/mobileProjects/stickyComposerContextCount',
                '{0} context item(s)',
                String(contextItems.length),
            );
            const clearContext = document.createElement('button');
            clearContext.type = 'button';
            clearContext.className = 'theia-mobile-projects-sticky-composer-context-clear';
            clearContext.textContent = nls.localize('qaap/mobileProjects/stickyComposerContextClear', 'Clear');
            clearContext.addEventListener('click', ev => {
                ev.stopPropagation();
                options.clearContext();
            });
            contextRow.append(contextLabel, clearContext);
            column.append(contextRow);
        }

        const toolbar = document.createElement('div');
        toolbar.className = 'theia-mobile-projects-sticky-composer-toolbar';

        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-projects-sticky-composer-inner';

        const attachBtn = document.createElement('button');
        attachBtn.type = 'button';
        attachBtn.className = 'theia-mobile-projects-sticky-composer-attach';
        const attachLabel = nls.localize('theia/ai/chat-ui/attachToContext', 'Attach elements to context');
        attachBtn.title = attachLabel;
        attachBtn.setAttribute('aria-label', attachLabel);
        attachBtn.innerHTML = '<span class="codicon codicon-attach" aria-hidden="true"></span>';
        if (contextItems.length > 0) {
            attachBtn.classList.add('theia-mod-has-context');
        }
        attachBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            options.onAttach();
        });

        const agentBtn = document.createElement('button');
        agentBtn.type = 'button';
        agentBtn.className = 'theia-mobile-projects-sticky-composer-agent';
        const agentLabel = options.resolveAgentLabel();
        agentBtn.title = nls.localize('qaap/mobileProjects/stickyComposerAgent', 'Agent: {0}', agentLabel);
        agentBtn.setAttribute('aria-label', agentBtn.title);
        agentBtn.innerHTML = `<span class="theia-mobile-projects-sticky-composer-agent-label">${agentLabel}</span>`
            + '<span class="codicon codicon-chevron-down" aria-hidden="true"></span>';
        agentBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            options.onOpenAgentSheet();
        });

        const toolbarItems: HTMLElement[] = [agentBtn];
        const modes = options.modes ?? [];
        if (modes.length > 1 && options.onOpenModeSheet && options.resolveModeLabel) {
            const modeBtn = document.createElement('button');
            modeBtn.type = 'button';
            modeBtn.className = 'theia-mobile-projects-sticky-composer-mode';
            const modeLabel = options.resolveModeLabel();
            modeBtn.title = nls.localize('qaap/mobileProjects/stickyComposerMode', 'Mode: {0}', modeLabel);
            modeBtn.setAttribute('aria-label', modeBtn.title);
            modeBtn.innerHTML = `<span class="theia-mobile-projects-sticky-composer-mode-label">${modeLabel}</span>`
                + '<span class="codicon codicon-chevron-down" aria-hidden="true"></span>';
            modeBtn.addEventListener('click', ev => {
                ev.stopPropagation();
                options.onOpenModeSheet!();
            });
            toolbarItems.push(modeBtn);
        }

        const toolsBtn = document.createElement('button');
        toolsBtn.type = 'button';
        toolsBtn.className = 'theia-mobile-projects-sticky-composer-tools';
        const toolsLabel = nls.localize('theia/ai/chat-ui/toggleCapabilitiesConfig', 'Toggle Capabilities Configuration');
        toolsBtn.title = toolsLabel;
        toolsBtn.setAttribute('aria-label', toolsLabel);
        toolsBtn.innerHTML = '<span class="codicon codicon-tools" aria-hidden="true"></span>';
        toolsBtn.addEventListener('click', ev => {
            ev.stopPropagation();
            options.onOpenToolsSheet();
        });

        toolbarItems.push(toolsBtn);
        toolbar.append(...toolbarItems);

        const inputWrap = document.createElement('div');
        inputWrap.className = 'theia-mobile-projects-sticky-composer-input-wrap';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'theia-mobile-projects-sticky-composer-input';
        const placeholderAgent = options.resolveAgentLabel();
        input.placeholder = nls.localize(
            'qaap/mobileProjects/stickyComposerPlaceholder',
            'Message {0} on {1}',
            placeholderAgent,
            options.project.name,
        );
        input.value = options.getDraft();
        input.disabled = !options.canSubmit;

        const sendBtn = document.createElement('button');
        sendBtn.type = 'button';
        sendBtn.className = 'theia-mobile-projects-sticky-composer-send';
        sendBtn.disabled = true;
        const sendLabel = options.sendLabel ?? nls.localize('qaap/mobileProjects/inlineStart', 'Start');
        sendBtn.title = sendLabel;
        sendBtn.setAttribute('aria-label', sendLabel);
        sendBtn.innerHTML = '<span class="codicon codicon-send" aria-hidden="true"></span>';

        const updateSend = (): void => {
            const has = input.value.trim().length > 0;
            sendBtn.disabled = !has || !options.canSubmit;
            sendBtn.classList.toggle('theia-mod-ready', has && options.canSubmit);
        };
        input.addEventListener('input', () => {
            options.setDraft(input.value);
            options.afterInputChange?.();
            updateSend();
        });
        updateSend();

        if (options.getMentionOptions) {
            attachStickyComposerMentionUi({
                inputWrap,
                input,
                getMentionOptions: options.getMentionOptions,
                getVariableOptions: options.getVariableOptions,
                onDraftChange: value => {
                    options.setDraft(value);
                    updateSend();
                },
                afterInputChange: options.afterInputChange,
                mentionButtonTitle: nls.localize('qaap/mobileProjects/stickyComposerMention', 'Mention agent (@)'),
                variableButtonTitle: nls.localize('qaap/mobileProjects/stickyComposerVariable', 'Insert variable (#)'),
            });
        }

        const submit = (): void => {
            const draft = input.value.trim();
            if (!draft || !options.canSubmit) {
                options.onSubmitBlocked?.();
                return;
            }
            input.value = '';
            options.setDraft('');
            updateSend();
            options.onSubmit(draft);
        };
        input.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' && !ev.defaultPrevented) {
                ev.preventDefault();
                submit();
            }
        });
        sendBtn.addEventListener('click', ev => {
            ev.preventDefault();
            submit();
        });

        inputWrap.append(attachBtn, input, sendBtn);
        wrap.append(inputWrap);
        column.append(toolbar, wrap);
        return column;
    }

    protected resolveComposerMentionOptions(
        backendAgents: readonly QaapAgentTaskAgentOption[],
    ): StickyComposerTokenOption[] {
        const coder = this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID);
        return buildStickyComposerMentionOptions(
            backendAgents,
            coder ? { name: coder.name } : undefined,
        );
    }

    protected resolveComposerVariableOptions(): StickyComposerTokenOption[] {
        return buildStickyComposerVariableOptions(this.getComposerVariables?.() ?? []);
    }

    protected resolveStickyComposerPinnedAgentId(project: MobileProjectEntry): string {
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        const pinned = this.stickyComposerPinnedAgentId ?? readStoredAgent(cwd);
        if (pinned) {
            return pinned;
        }
        return this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID)
            ? THEIA_CODER_AGENT_ID
            : (this.stickyComposerBackendAgents[0]?.id ?? QAIQ_AGENT_ID);
    }

    protected resolveStickyComposerAgentLabel(): string {
        const pinned = this.stickyComposerPinnedAgentId;
        if (isTheiaCoderAgent(pinned)) {
            return this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID)?.name ?? 'Coder';
        }
        const fromList = this.stickyComposerBackendAgents.find(a => a.id === pinned)?.label;
        if (fromList) {
            return fromList;
        }
        if (pinned === QAIQ_AGENT_ID) {
            return 'QAIQ';
        }
        return this.resolveConversationAgentLabel(undefined);
    }

    protected reconcileStickyComposerPinnedAgent(
        current: string | undefined,
        agents: readonly QaapAgentTaskAgentOption[],
        defaultAgent: string | undefined,
        cwd: string | undefined,
    ): string {
        return reconcileStickyComposerAgent(
            current,
            agents,
            defaultAgent,
            cwd,
            !!this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID),
        );
    }

    protected filterSelectableComposerAgents(
        agents: readonly QaapAgentTaskAgentOption[],
    ): QaapAgentTaskAgentOption[] {
        return agents.filter(agent => agent.id !== SHELL_AGENT_ID);
    }

    protected async refreshStickyComposerAgents(project: MobileProjectEntry): Promise<void> {
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        try {
            const snapshot = await this.loadBackendAgentSnapshot();
            const filteredAgents = this.filterSelectableComposerAgents(snapshot.agents);
            this.stickyComposerBackendAgents = filteredAgents;
            const resolved = this.reconcileStickyComposerPinnedAgent(
                this.stickyComposerPinnedAgentId ?? readStoredAgent(cwd),
                filteredAgents,
                snapshot.defaultAgent,
                cwd,
            );
            if (this.stickyComposerPinnedAgentId !== resolved) {
                this.stickyComposerPinnedAgentId = resolved;
                this.renderStickyComposer();
            }
        } catch {
            this.stickyComposerBackendAgents = this.filterSelectableComposerAgents(this.activeTasks?.getAgents() ?? []);
        }
    }

    protected openStickyComposerAgentSheet(project: MobileProjectEntry): void {
        this.closeStickyComposerSheets();
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        const sheet = document.createElement('div');
        sheet.className = 'theia-mobile-sticky-composer-sheet theia-mod-agent';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeStickyComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickAgent', 'Choose agent');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeStickyComposerSheets());
        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';

        const coder = this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID);
        if (coder) {
            list.append(this.createStickyAgentSheetOption(
                coder.name,
                THEIA_CODER_AGENT_ID,
                cwd,
                () => this.closeStickyComposerSheets(),
            ));
        }
        for (const agent of this.filterSelectableComposerAgents(this.stickyComposerBackendAgents)) {
            list.append(this.createStickyAgentSheetOption(
                agent.label,
                agent.id,
                cwd,
                () => this.closeStickyComposerSheets(),
            ));
        }

        panel.append(header, list);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.stickyComposerAgentSheet = sheet;
    }

    protected createStickyAgentSheetOption(
        label: string,
        agentId: string,
        cwd: string | undefined,
        onPick: () => void,
    ): HTMLElement {
        return this.createAgentSheetOption(
            label,
            agentId,
            cwd,
            this.stickyComposerPinnedAgentId,
            id => {
                this.stickyComposerPinnedAgentId = id;
                if (cwd) {
                    writeStoredAgent(cwd, id);
                }
                const modes = resolveStickyComposerModes(id, this.chatAgentService);
                this.stickyComposerModeId = reconcileComposerModeId(undefined, modes, cwd);
                if (cwd && this.stickyComposerModeId) {
                    writeStoredComposerMode(cwd, this.stickyComposerModeId);
                }
                this.syncStickyToolsWidgetAgent(id);
                void this.syncStickyToolsWidgetMode(this.stickyComposerModeId);
                onPick();
                this.renderStickyComposer();
            },
        );
    }

    protected openStickyComposerModeSheet(project: MobileProjectEntry, modes: readonly ChatMode[]): void {
        this.closeStickyComposerSheets();
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        const sheet = document.createElement('div');
        sheet.className = 'theia-mobile-sticky-composer-sheet theia-mod-mode';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeStickyComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickMode', 'Choose mode');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeStickyComposerSheets());
        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';
        for (const mode of modes) {
            list.append(this.createModeSheetOption(
                mode.name,
                mode.id,
                this.stickyComposerModeId,
                id => {
                    this.stickyComposerModeId = id;
                    if (cwd) {
                        writeStoredComposerMode(cwd, id);
                    }
                    void this.syncStickyToolsWidgetMode(id);
                    this.closeStickyComposerSheets();
                    this.renderStickyComposer();
                },
            ));
        }

        panel.append(header, list);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.stickyComposerModeSheet = sheet;
    }

    protected createModeSheetOption(
        label: string,
        modeId: string,
        selectedModeId: string | undefined,
        onSelect: (modeId: string) => void,
    ): HTMLElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-sticky-composer-sheet-option';
        if (selectedModeId === modeId) {
            btn.classList.add('theia-mod-selected');
        }
        btn.textContent = label;
        btn.addEventListener('click', () => {
            onSelect(modeId);
        });
        return btn;
    }

    protected async syncStickyToolsWidgetMode(modeId: string | undefined): Promise<void> {
        if (!modeId || !this.stickyComposerToolsWidget || this.stickyComposerToolsWidget.isDisposed) {
            return;
        }
        await this.stickyComposerToolsWidget.applyComposerMode(modeId);
    }

    protected createAgentSheetOption(
        label: string,
        agentId: string,
        cwd: string | undefined,
        selectedAgentId: string | undefined,
        onSelect: (agentId: string) => void,
    ): HTMLElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-sticky-composer-sheet-option';
        if (isStickyComposerAgentSelected(agentId, selectedAgentId, cwd)) {
            btn.classList.add('theia-mod-selected');
        }
        btn.textContent = label;
        btn.addEventListener('click', () => {
            onSelect(agentId);
        });
        return btn;
    }

    protected async openStickyComposerToolsSheet(project: MobileProjectEntry): Promise<void> {
        this.closeStickyComposerSheets();
        if (!this.createChatInputWidget || !this.chatService) {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.'),
                { duration: 2400 },
            );
            return;
        }
        const sheet = document.createElement('div');
        sheet.className = 'theia-mobile-sticky-composer-sheet theia-mod-tools';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeStickyComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/stickyComposerTools', 'Tools & capabilities');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeStickyComposerSheets());
        header.append(title, close);

        const host = document.createElement('div');
        host.className = 'theia-mobile-sticky-composer-tools-host';
        host.textContent = nls.localize('qaap/mobileProjects/agentInputLoading', 'Loading agent input…');

        const done = document.createElement('button');
        done.type = 'button';
        done.className = 'theia-mobile-sticky-composer-sheet-done';
        done.textContent = nls.localize('qaap/mobileProjects/stickyComposerToolsDone', 'Done');
        done.addEventListener('click', () => {
            void this.saveAndCloseStickyComposerToolsSheet();
        });

        panel.append(header, host, done);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.stickyComposerToolsHost = host;

        const widget = await this.ensureStickyComposerToolsWidget(project);
        if (!widget || !host.isConnected) {
            return;
        }
        if (widget.node.parentElement && widget.node.parentElement !== host) {
            LuminoWidget.detach(widget);
        }
        if (widget.node.parentElement !== host) {
            host.replaceChildren();
            LuminoWidget.attach(widget, host);
        }
        widget.node.classList.add(
            'chat-input-widget',
            'theia-mobile-projects-sticky-tools-input',
            'theia-mod-tools-only',
        );
        widget.show();
        widget.activate();
        widget.update();
        await widget.prepareToolsSheet();
        if (!widget.hasVisibleToolsContent()) {
            const empty = document.createElement('p');
            empty.className = 'theia-mobile-sticky-composer-tools-empty';
            empty.textContent = nls.localize(
                'qaap/mobileProjects/stickyComposerToolsEmpty',
                'No tools are configured for this agent. Use @mention in your message or check AI settings.',
            );
            host.prepend(empty);
        }
        widget.update();
    }

    protected async ensureStickyComposerToolsWidget(project: MobileProjectEntry): Promise<MobileProjectAIChatInputWidget | undefined> {
        if (this.stickyComposerToolsWidget && !this.stickyComposerToolsWidget.isDisposed) {
            this.syncStickyToolsWidgetAgent(this.resolveStickyComposerPinnedAgentId(project));
            return this.stickyComposerToolsWidget;
        }
        if (!this.createChatInputWidget || !this.chatService) {
            return undefined;
        }
        const uniqueId = `sticky-tools-${project.id}-${++this.agentChatInputMountSeq}`;
        let widget: MobileProjectAIChatInputWidget;
        try {
            widget = await this.createChatInputWidget(uniqueId) as MobileProjectAIChatInputWidget;
        } catch (error) {
            console.error('[qaap-mobile-projects] sticky tools widget failed:', error);
            return undefined;
        }
        widget.id = `mobile-projects-sticky-tools-${uniqueId}`;
        const cwd = this.projectsService.getProjectCwd(project) ?? this.preparedCwdByProjectId.get(project.id);
        const session = this.ensureAgentChatSession(cwd);
        widget.chatModel = session.model;
        this.syncStickyToolsWidgetAgent(this.resolveStickyComposerPinnedAgentId(project));
        widget.setEnabled(true);
        widget.ensureStandaloneInputCallbacks();
        this.stickyComposerToolsWidget = widget;
        return widget;
    }

    protected syncStickyToolsWidgetAgent(agentId: string): void {
        if (!this.stickyComposerToolsWidget || this.stickyComposerToolsWidget.isDisposed) {
            return;
        }
        const agent = isTheiaCoderAgent(agentId)
            ? this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID)
            : this.chatAgentForBackendId(agentId);
        if (agent) {
            this.stickyComposerToolsWidget.pinnedAgent = agent;
            if (this.agentChatInputSession) {
                this.agentChatInputSession.pinnedAgent = agent;
            }
            this.stickyComposerToolsWidget.update();
        }
    }

    protected async saveAndCloseStickyComposerToolsSheet(): Promise<void> {
        const widget = this.stickyComposerToolsWidget;
        if (widget && !widget.isDisposed) {
            await widget.saveToolsSheetSelectionsToSettings();
        }
        this.closeStickyComposerSheets();
    }

    protected closeStickyComposerSheets(): void {
        if (this.stickyComposerAgentSheet) {
            this.stickyComposerAgentSheet.remove();
            this.stickyComposerAgentSheet = undefined;
        }
        if (this.stickyComposerModeSheet) {
            this.stickyComposerModeSheet.remove();
            this.stickyComposerModeSheet = undefined;
        }
        if (this.stickyComposerToolsWidget && !this.stickyComposerToolsWidget.isDisposed) {
            if (this.stickyComposerToolsWidget.node.isConnected) {
                LuminoWidget.detach(this.stickyComposerToolsWidget);
            }
            this.stickyComposerToolsWidget.stashToolsSheetPresentation();
        }
        if (this.stickyComposerToolsHost) {
            const sheet = this.stickyComposerToolsHost.closest('.theia-mobile-sticky-composer-sheet');
            sheet?.remove();
            this.stickyComposerToolsHost = undefined;
        }
    }

    protected disposeStickyComposerTools(): void {
        this.closeStickyComposerSheets();
        if (this.stickyComposerToolsWidget && !this.stickyComposerToolsWidget.isDisposed) {
            this.stickyComposerToolsWidget.dispose();
        }
        this.stickyComposerToolsWidget = undefined;
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
        return projects.filter(project => this.projectMatchesSearch(project, this.query));
    }

    protected projectMatchesSearch(project: MobileProjectEntry, query: string): boolean {
        if (project.name.toLowerCase().includes(query)
            || project.branch.toLowerCase().includes(query)
            || project.task.toLowerCase().includes(query)
            || project.github?.fullName.toLowerCase().includes(query)) {
            return true;
        }
        return this.conversationsForProject(project).some(c => this.conversationMatchesQuery(c, query));
    }

    protected conversationMatchesQuery(
        conversation: QaapAgentConversationSummaryDTO,
        query: string,
    ): boolean {
        if (conversation.title.toLowerCase().includes(query)) {
            return true;
        }
        if (conversation.agentId.toLowerCase().includes(query)) {
            return true;
        }
        const preview = conversation.lastMessagePreview?.toLowerCase();
        return !!preview && preview.includes(query);
    }

    protected renderChatsInbox(projects: MobileProjectEntry[]): void {
        if (!this.inboxPullRequestsLoaded && !this.inboxPullRequestsLoading) {
            void this.refreshInboxPullRequests(projects);
        }
        const groups = this.collectInboxGroups(projects);
        const hasGithubRepos = githubRepoKeysForProjects(projects).length > 0;
        if (groups.length === 0) {
            if (!this.inboxPullRequestsLoaded && this.inboxPullRequestsLoading) {
                this.scroll.append(this.createInboxLoadingState());
            } else {
                this.scroll.append(this.createChatsEmptyState());
            }
            this.renderSubtitle();
            return;
        }
        const inbox = document.createElement('div');
        inbox.className = 'theia-mobile-projects-chats-inbox';
        for (const group of groups) {
            inbox.append(this.createInboxProjectGroup(group.project, group.items));
        }
        if (hasGithubRepos && this.inboxPullRequestsLoaded && this.inboxGithubSignedIn === false) {
            inbox.append(this.createInboxGithubSignInHint());
        }
        this.scroll.append(inbox);
        this.renderSubtitle();
    }

    protected renderCatalogHubView(): void {
        const sections = filterCatalogSections(QAAP_WORK_HUB_WORKFLOWS, this.query);
        if (sections.length === 0) {
            this.scroll.append(this.createCatalogEmptyState());
            this.renderSubtitle();
            return;
        }
        const catalog = document.createElement('div');
        catalog.className = 'theia-mobile-hub-catalog';
        for (const section of sections) {
            catalog.append(this.createCatalogSection(section));
        }
        this.scroll.append(catalog);
        this.renderSubtitle();
    }

    protected renderRoutinesHubView(): void {
        if (!this.workHubRoutinesLoaded && !this.workHubRoutinesLoading) {
            void this.refreshWorkHubRoutines();
        }
        const routines = filterRoutinesByQuery(this.workHubRoutines, this.query);
        if (!this.workHubRoutinesLoaded && this.workHubRoutinesLoading) {
            this.scroll.append(this.createRoutinesLoadingState());
            this.renderSubtitle();
            return;
        }
        if (routines.length === 0) {
            this.scroll.append(this.createRoutinesEmptyState());
            this.renderSubtitle();
            return;
        }
        const list = document.createElement('div');
        list.className = 'theia-mobile-hub-routines';
        for (const routine of routines) {
            list.append(this.createRoutineRow(routine));
        }
        this.scroll.append(list);
        this.renderSubtitle();
        this.scheduleRoutinesRefreshWhileRunning();
    }

    protected async refreshWorkHubRoutines(force = false): Promise<void> {
        if (this.workHubRoutinesLoading && !force) {
            return;
        }
        this.workHubRoutinesLoading = true;
        try {
            const response = await fetchWorkHubRoutines();
            this.workHubRoutines = response.routines;
            this.workHubRoutinesDefaultAgent = response.defaultAgent;
            this.workHubRoutinesLoaded = true;
        } catch {
            if (!this.workHubRoutinesLoaded) {
                this.workHubRoutines = [];
            }
        } finally {
            this.workHubRoutinesLoading = false;
            if (this.visible && this.hubView === 'routines') {
                this.renderList();
            }
        }
    }

    protected scheduleRoutinesRefreshWhileRunning(): void {
        window.clearTimeout(this.routinesRefreshTimer);
        const hasRunning = this.workHubRoutines.some(r => r.lastRunState === 'running');
        if (!hasRunning || this.hubView !== 'routines' || !this.visible) {
            return;
        }
        this.routinesRefreshTimer = window.setTimeout(() => {
            void this.refreshWorkHubRoutines(true);
        }, 4000);
    }

    protected createRoutinesLoadingState(): HTMLElement {
        const loading = document.createElement('div');
        loading.className = 'theia-mobile-projects-empty theia-mod-inbox-loading';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-loading codicon-mod-spin';
        const title = document.createElement('strong');
        title.textContent = nls.localize('qaap/mobileProjects/routinesLoading', 'Loading routines…');
        loading.append(icon, title);
        return loading;
    }

    protected createRoutinesEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty theia-mod-routines-empty';
        const title = document.createElement('strong');
        title.textContent = this.query
            ? nls.localize('qaap/mobileProjects/routinesEmpty', 'No routines match your search')
            : nls.localize('qaap/mobileProjects/routinesEmptyAll', 'No routines yet');
        const body = document.createElement('span');
        body.textContent = nls.localize(
            'qaap/mobileProjects/routinesEmptyBody',
            'Tap + to create a VPS routine or enable a suggested template.',
        );
        empty.append(title, body);
        return empty;
    }

    protected createRoutineRow(routine: QaapWorkHubRoutine): HTMLElement {
        const row = document.createElement('article');
        row.className = 'theia-mobile-hub-routine-row';

        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'theia-mobile-hub-routine-main';

        const icon = document.createElement('span');
        icon.className = 'theia-mobile-hub-routine-icon codicon codicon-zap';
        icon.setAttribute('aria-hidden', 'true');

        const body = document.createElement('div');
        body.className = 'theia-mobile-hub-routine-body';
        const title = document.createElement('span');
        title.className = 'theia-mobile-hub-routine-title';
        title.textContent = routine.title;
        const subtitle = document.createElement('span');
        subtitle.className = 'theia-mobile-hub-routine-subtitle';
        subtitle.textContent = routine.prompt;
        const meta = document.createElement('span');
        meta.className = 'theia-mobile-hub-routine-meta';
        const status = this.routineStatusLabel(routine);
        meta.textContent = `${routineScheduleLabel(routine)} · ${status}`;
        body.append(title, subtitle, meta);

        main.append(icon, body);
        main.addEventListener('click', () => this.openRoutineEditor(routine));

        const actions = document.createElement('div');
        actions.className = 'theia-mobile-hub-routine-actions';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'theia-mobile-hub-routine-toggle';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', routine.enabled ? 'true' : 'false');
        toggle.title = routine.enabled
            ? nls.localize('qaap/mobileProjects/routineDisable', 'Disable routine')
            : nls.localize('qaap/mobileProjects/routineEnable', 'Enable routine');
        toggle.classList.toggle('theia-mod-on', routine.enabled);
        toggle.addEventListener('click', ev => {
            ev.stopPropagation();
            void this.toggleRoutineEnabled(routine);
        });

        const run = document.createElement('button');
        run.type = 'button';
        run.className = 'theia-mobile-hub-routine-run';
        run.textContent = nls.localize('qaap/mobileProjects/routineRun', 'Run');
        run.disabled = routine.lastRunState === 'running';
        run.addEventListener('click', ev => {
            ev.stopPropagation();
            void this.runRoutineNow(routine);
        });

        actions.append(toggle, run);
        row.append(main, actions);
        return row;
    }

    protected routineStatusLabel(routine: QaapWorkHubRoutine): string {
        if (routine.lastRunState === 'running') {
            return nls.localize('qaap/mobileProjects/routineStatusRunning', 'Running');
        }
        if (routine.lastRunState === 'completed') {
            return nls.localize('qaap/mobileProjects/routineStatusDone', 'Last run OK');
        }
        if (routine.lastRunState === 'failed') {
            return nls.localize('qaap/mobileProjects/routineStatusFailed', 'Last run failed');
        }
        return nls.localize('qaap/mobileProjects/routineStatusIdle', 'Not run yet');
    }

    protected async toggleRoutineEnabled(routine: QaapWorkHubRoutine): Promise<void> {
        try {
            await updateWorkHubRoutine(routine.id, { enabled: !routine.enabled });
            await this.refreshWorkHubRoutines(true);
        } catch (error) {
            this.messageService?.error(error instanceof Error ? error.message : String(error));
        }
    }

    protected async runRoutineNow(routine: QaapWorkHubRoutine): Promise<void> {
        try {
            await runWorkHubRoutineNow(routine.id);
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/routineStarted', 'Routine started on the VPS'),
                { kind: 'success', duration: 1800 },
            );
            await this.refreshWorkHubRoutines(true);
        } catch (error) {
            this.messageService?.error(error instanceof Error ? error.message : String(error));
        }
    }

    protected resolveDefaultRoutineCwd(): string {
        const current = this.projects.find(p => p.isCurrent);
        const cwd = current ? this.projectsService.getProjectCwd(current) : undefined;
        if (cwd) {
            return cwd;
        }
        const withUri = this.projects.find(p => p.uri);
        if (withUri?.uri) {
            return withUri.uri.path.toString();
        }
        return '';
    }

    protected openRoutineEditor(routine?: QaapWorkHubRoutine): void {
        this.closeRoutineEditor();
        this.editingRoutineId = routine?.id;
        const sheet = document.createElement('div');
        sheet.className = 'theia-mobile-routine-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-routine-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeRoutineEditor());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-routine-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-routine-sheet-header';
        const heading = document.createElement('h2');
        heading.textContent = routine
            ? nls.localize('qaap/mobileProjects/routineEdit', 'Edit routine')
            : nls.localize('qaap/mobileProjects/routineNew', 'New routine');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-routine-sheet-close codicon codicon-close';
        close.addEventListener('click', () => this.closeRoutineEditor());
        header.append(heading, close);

        const form = document.createElement('div');
        form.className = 'theia-mobile-routine-sheet-form';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'theia-mobile-routine-field';
        titleInput.placeholder = nls.localize('qaap/mobileProjects/routineTitlePlaceholder', 'Title');
        titleInput.value = routine?.title ?? '';

        const promptInput = document.createElement('textarea');
        promptInput.className = 'theia-mobile-routine-field theia-mod-textarea';
        promptInput.placeholder = nls.localize('qaap/mobileProjects/routinePromptPlaceholder', 'What should the VPS agent do?');
        promptInput.value = routine?.prompt ?? '';

        const cwdInput = document.createElement('input');
        cwdInput.type = 'text';
        cwdInput.className = 'theia-mobile-routine-field';
        cwdInput.placeholder = nls.localize('qaap/mobileProjects/routineCwdPlaceholder', 'Working directory (absolute path)');
        cwdInput.value = routine?.cwd ?? this.resolveDefaultRoutineCwd();

        const agentSelect = document.createElement('select');
        agentSelect.className = 'theia-mobile-routine-field';
        void fetchAgentTaskListAll().then(snapshot => {
            agentSelect.replaceChildren();
            for (const agent of snapshot.agents.filter(a => a.available && a.id !== SHELL_AGENT_ID)) {
                const option = document.createElement('option');
                option.value = agent.id;
                option.textContent = agent.label;
                agentSelect.append(option);
            }
            const selected = routine?.agent ?? this.workHubRoutinesDefaultAgent ?? QAIQ_AGENT_ID;
            agentSelect.value = selected;
        }).catch(() => {
            const option = document.createElement('option');
            option.value = QAIQ_AGENT_ID;
            option.textContent = 'QAIQ';
            agentSelect.append(option);
        });

        const triggerSelect = document.createElement('select');
        triggerSelect.className = 'theia-mobile-routine-field';
        for (const value of ['manual', 'interval'] as QaapWorkHubRoutineTrigger[]) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value === 'manual'
                ? nls.localize('qaap/mobileProjects/routineTriggerManual', 'Manual only')
                : nls.localize('qaap/mobileProjects/routineTriggerInterval', 'On a schedule');
            triggerSelect.append(option);
        }
        triggerSelect.value = routine?.trigger ?? 'manual';

        const intervalInput = document.createElement('input');
        intervalInput.type = 'number';
        intervalInput.min = '1';
        intervalInput.max = '168';
        intervalInput.className = 'theia-mobile-routine-field';
        intervalInput.placeholder = nls.localize('qaap/mobileProjects/routineIntervalHours', 'Interval (hours)');
        intervalInput.value = String(routine?.intervalHours ?? 24);

        const enabledLabel = document.createElement('label');
        enabledLabel.className = 'theia-mobile-routine-enabled';
        const enabledInput = document.createElement('input');
        enabledInput.type = 'checkbox';
        enabledInput.checked = routine?.enabled ?? false;
        enabledLabel.append(enabledInput, document.createTextNode(
            nls.localize('qaap/mobileProjects/routineEnabled', 'Enabled'),
        ));

        form.append(titleInput, promptInput, cwdInput, agentSelect, triggerSelect, intervalInput, enabledLabel);

        const footer = document.createElement('footer');
        footer.className = 'theia-mobile-routine-sheet-footer';
        if (routine) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'theia-mobile-routine-btn theia-mod-danger';
            deleteBtn.textContent = nls.localize('qaap/mobileProjects/routineDelete', 'Delete');
            deleteBtn.addEventListener('click', () => { void this.deleteRoutine(routine.id); });
            footer.append(deleteBtn);
        }
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'theia-mobile-routine-btn theia-mod-primary';
        saveBtn.textContent = nls.localize('qaap/mobileProjects/routineSave', 'Save');
        saveBtn.addEventListener('click', () => {
            void this.saveRoutineFromEditor({
                id: routine?.id,
                title: titleInput.value,
                prompt: promptInput.value,
                cwd: cwdInput.value,
                agent: agentSelect.value,
                trigger: triggerSelect.value as QaapWorkHubRoutineTrigger,
                intervalHours: Number(intervalInput.value),
                enabled: enabledInput.checked,
            });
        });
        footer.append(saveBtn);

        panel.append(header, form, footer);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.routineSheet = sheet;
    }

    protected closeRoutineEditor(): void {
        this.routineSheet?.remove();
        this.routineSheet = undefined;
        this.editingRoutineId = undefined;
    }

    protected async saveRoutineFromEditor(fields: {
        id?: string;
        title: string;
        prompt: string;
        cwd: string;
        agent: string;
        trigger: QaapWorkHubRoutineTrigger;
        intervalHours: number;
        enabled: boolean;
    }): Promise<void> {
        try {
            if (fields.id) {
                await updateWorkHubRoutine(fields.id, fields);
            } else {
                await createWorkHubRoutine(fields);
            }
            this.closeRoutineEditor();
            await this.refreshWorkHubRoutines(true);
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/routineSaved', 'Routine saved'),
                { kind: 'success', duration: 1400 },
            );
        } catch (error) {
            this.messageService?.error(error instanceof Error ? error.message : String(error));
        }
    }

    protected async deleteRoutine(id: string): Promise<void> {
        try {
            await deleteWorkHubRoutine(id);
            this.closeRoutineEditor();
            await this.refreshWorkHubRoutines(true);
        } catch (error) {
            this.messageService?.error(error instanceof Error ? error.message : String(error));
        }
    }

    protected createCatalogSection(section: WorkHubCatalogSection): HTMLElement {
        const block = document.createElement('section');
        block.className = 'theia-mobile-hub-catalog-section';

        const head = document.createElement('div');
        head.className = 'theia-mobile-hub-catalog-section-head';
        const title = document.createElement('h2');
        title.className = 'theia-mobile-hub-catalog-section-title';
        title.textContent = section.title;
        const count = document.createElement('span');
        count.className = 'theia-mobile-hub-catalog-section-count';
        count.textContent = String(section.items.length);
        head.append(title, count);

        const list = document.createElement('div');
        list.className = 'theia-mobile-hub-catalog-cards';
        for (const item of section.items) {
            list.append(this.createCatalogCard(item));
        }

        block.append(head, list);
        return block;
    }

    protected createCatalogCard(item: WorkHubCatalogItem): HTMLElement {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'theia-mobile-hub-catalog-card';
        if (item.accent) {
            card.style.setProperty('--qaap-hub-catalog-accent', item.accent);
        }

        const icon = document.createElement('span');
        icon.className = `theia-mobile-hub-catalog-card-icon codicon ${item.iconClass}`;
        icon.setAttribute('aria-hidden', 'true');

        const body = document.createElement('div');
        body.className = 'theia-mobile-hub-catalog-card-body';

        const title = document.createElement('span');
        title.className = 'theia-mobile-hub-catalog-card-title';
        title.textContent = item.title;

        const subtitle = document.createElement('span');
        subtitle.className = 'theia-mobile-hub-catalog-card-subtitle';
        subtitle.textContent = item.subtitle;

        body.append(title, subtitle);

        if (item.progress !== undefined) {
            const progressWrap = document.createElement('div');
            progressWrap.className = 'theia-mobile-hub-catalog-card-progress';
            progressWrap.setAttribute('role', 'progressbar');
            progressWrap.setAttribute('aria-valuemin', '0');
            progressWrap.setAttribute('aria-valuemax', '100');
            const percent = Math.round(Math.max(0, Math.min(1, item.progress)) * 100);
            progressWrap.setAttribute('aria-valuenow', String(percent));
            const bar = document.createElement('span');
            bar.className = 'theia-mobile-hub-catalog-card-progress-bar';
            bar.style.width = `${percent}%`;
            progressWrap.append(bar);
            body.append(progressWrap);
        }

        if (item.meta) {
            const meta = document.createElement('span');
            meta.className = 'theia-mobile-hub-catalog-card-meta';
            meta.textContent = item.meta;
            body.append(meta);
        }

        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-hub-catalog-card-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');

        card.append(icon, body, chevron);
        card.addEventListener('click', () => { void this.runCatalogAction(item.action); });
        return card;
    }

    protected createCatalogEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty theia-mod-catalog-empty';
        const title = document.createElement('strong');
        title.textContent = nls.localize('qaap/mobileProjects/workflowsEmpty', 'No workflows match your search');
        const body = document.createElement('span');
        body.textContent = nls.localize(
            'qaap/mobileProjects/workflowsEmptyBody',
            'Try another keyword or clear the search field.',
        );
        empty.append(title, body);
        return empty;
    }

    protected async runCatalogAction(action: WorkHubCatalogAction): Promise<void> {
        switch (action.type) {
            case 'command':
                if (this.commands.getCommand(action.commandId)) {
                    await this.commands.executeCommand(action.commandId);
                }
                return;
            case 'hub-view':
                this.selectHubLandingView(action.view);
                return;
            case 'replay-tutorial':
                await this.commands.executeCommand(MobileOnboardingTutorialContribution.REPLAY_COMMAND.id);
                return;
            default:
                return;
        }
    }

    protected resetInboxPullRequestState(): void {
        this.inboxPullRequestsAbort?.abort();
        this.inboxPullRequestsAbort = undefined;
        this.inboxPullRequests = [];
        this.inboxPullRequestsLoaded = false;
        this.inboxPullRequestsLoading = false;
        this.inboxGithubSignedIn = undefined;
    }

    protected finishInboxPullRequestLoad(generation: number): void {
        if (generation !== this.inboxLoadGeneration) {
            this.inboxPullRequestsLoading = false;
            return;
        }
        this.inboxPullRequestsLoaded = true;
        this.inboxPullRequestsLoading = false;
        if (this.visible && this.hubView === 'chats') {
            this.renderList();
        }
    }

    protected async refreshInboxPullRequests(
        projects: MobileProjectEntry[] = this.projectsForCurrentHubList(),
        force = false,
    ): Promise<void> {
        if (this.inboxPullRequestsLoading && !force) {
            return;
        }
        const generation = this.inboxLoadGeneration;
        this.inboxPullRequestsAbort?.abort();
        const abort = new AbortController();
        this.inboxPullRequestsAbort = abort;
        const timeout = window.setTimeout(() => abort.abort(), MobileProjectsPanel.INBOX_PR_FETCH_TIMEOUT_MS);
        this.inboxPullRequestsLoading = true;
        const repoKeys = githubRepoKeysForProjects(projects);
        try {
            const config = await fetchQaapAuthConfig().catch(() => ({ skipAuth: false, githubOAuth: false }));
            if (config.skipAuth) {
                this.inboxPullRequests = [];
                this.inboxGithubSignedIn = undefined;
                return;
            }
            if (repoKeys.length === 0) {
                this.inboxPullRequests = [];
                this.inboxGithubSignedIn = undefined;
                return;
            }
            const auth = await fetchQaapAuthSession();
            if (generation !== this.inboxLoadGeneration || abort.signal.aborted) {
                return;
            }
            if (!auth.signedIn) {
                if (readQaapSignedIn()) {
                    clearQaapAuthSession();
                }
                this.inboxGithubSignedIn = false;
                this.inboxPullRequests = [];
                return;
            }
            this.inboxGithubSignedIn = true;
            const response = await fetchQaapGithubPullRequests(repoKeys);
            if (generation !== this.inboxLoadGeneration || abort.signal.aborted) {
                return;
            }
            if (response.signedIn === false) {
                if (readQaapSignedIn()) {
                    clearQaapAuthSession();
                }
                this.inboxGithubSignedIn = false;
                this.inboxPullRequests = [];
                return;
            }
            this.inboxGithubSignedIn = true;
            this.inboxPullRequests = this.mergeInboxPullRequests(response.pullRequests);
        } catch {
            if (generation !== this.inboxLoadGeneration || abort.signal.aborted) {
                return;
            }
            this.inboxPullRequests = [];
        } finally {
            window.clearTimeout(timeout);
            if (this.inboxPullRequestsAbort === abort) {
                this.inboxPullRequestsAbort = undefined;
            }
            this.finishInboxPullRequestLoad(generation);
        }
    }

    protected createInboxGithubSignInHint(): HTMLElement {
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

    protected createInboxLoadingState(): HTMLElement {
        const loading = document.createElement('div');
        loading.className = 'theia-mobile-projects-empty theia-mod-inbox-loading';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-loading codicon-mod-spin';
        const title = document.createElement('strong');
        title.textContent = nls.localize('qaap/mobileProjects/inboxLoading', 'Loading inbox…');
        const body = document.createElement('span');
        body.textContent = nls.localize(
            'qaap/mobileProjects/inboxLoadingBody',
            'Fetching open pull requests and agent threads.',
        );
        loading.append(icon, title, body);
        return loading;
    }

    protected collectInboxGroups(
        projects: MobileProjectEntry[],
    ): Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }> {
        const groups: Array<{ project: MobileProjectEntry; items: MobileWorkHubInboxItem[] }> = [];
        const query = this.query.trim().toLowerCase();
        for (const project of projects) {
            let conversations = this.conversations
                ? this.conversationsForProject(project)
                : [];
            if (query) {
                conversations = conversations.filter(c => this.conversationMatchesQuery(c, query));
            }
            let pullRequests = this.inboxPullRequests.filter(pr => {
                if (query) {
                    return pullRequestMatchesQuery(pr, query);
                }
                return true;
            });
            const items = buildWorkHubInboxItems(
                project,
                conversations,
                pullRequests,
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

    protected activeAgentBranchForProject(project: MobileProjectEntry): string | undefined {
        const streaming = this.conversations
            ? this.conversationsForProject(project).some(c => c.status === 'streaming')
            : false;
        return streaming && project.branch ? project.branch : undefined;
    }

    protected compareChatInboxProjectOrder(a: MobileProjectEntry, b: MobileProjectEntry): number {
        const aRunning = this.countRunningTasks(a) > 0 ? 1 : 0;
        const bRunning = this.countRunningTasks(b) > 0 ? 1 : 0;
        if (aRunning !== bRunning) {
            return bRunning - aRunning;
        }
        const aUnread = this.countUnreadTasks(a) > 0 ? 1 : 0;
        const bUnread = this.countUnreadTasks(b) > 0 ? 1 : 0;
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

    protected createInboxProjectGroup(
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
            this.hubView = 'repos';
            this.projectsService.setHubView('repos');
            void this.openProjectDetail(project);
        });

        const parentIds = new Set<string>();
        for (const item of items) {
            if (item.kind === 'conversation' && item.summary.forkedFromId) {
                parentIds.add(item.summary.forkedFromId);
            }
        }

        const list = document.createElement('div');
        list.className = 'theia-mobile-projects-chats-list';
        const activeInfo = this.activeInfoForProject(project);
        for (const item of items) {
            if (item.kind === 'conversation') {
                const task = this.summaryToTaskView(item.summary);
                list.append(this.createTaskItem(project, task, activeInfo, item.summary, parentIds));
            } else {
                list.append(this.createInboxPullRequestItem(project, item.pullRequest, item.agentActivityLabel));
            }
        }

        section.append(head, list);
        return section;
    }

    protected createInboxPullRequestItem(
        project: MobileProjectEntry,
        pullRequest: QaapGithubPullRequestSummary,
        agentActivity?: string,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-task-row theia-mobile-projects-inbox-pr-row';

        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theia-mobile-projects-task-item theia-mobile-projects-inbox-pr-item';

        const icon = document.createElement('span');
        icon.className = 'theia-mobile-projects-task-dot codicon codicon-git-pull-request theia-mod-pr';
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
            this.delegate.onOpenPullRequest?.(pullRequest);
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

    protected createChatsEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-inbox';
        const title = document.createElement('strong');
        title.textContent = this.query
            ? nls.localize('qaap/mobileProjects/noInboxSearchResults', 'No matching inbox items')
            : nls.localize('qaap/mobileProjects/noInbox', 'Inbox is empty');
        const body = document.createElement('span');
        body.textContent = this.query
            ? nls.localize(
                'qaap/mobileProjects/noInboxSearchResultsBody',
                'Try a pull request title, author, branch, or agent message.',
            )
            : nls.localize(
                'qaap/mobileProjects/noInboxBody',
                'Open pull requests and agent threads from your connected repositories will show up here.',
            );
        empty.append(icon, title, body);
        return empty;
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
        const isExpanded = !this.homeMode && this.expandedId === project.id;
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

        const leading = this.homeMode ? this.createHomeRowAvatar(project) : glyph;
        if (this.homeMode) {
            for (const cls of glyph.classList) {
                if (cls !== 'theia-mobile-projects-row-glyph') {
                    leading.classList.add(cls);
                }
            }
            if (glyph.title) {
                leading.title = glyph.title;
            }
        }
        header.append(leading);

        const main = document.createElement('div');
        main.className = 'theia-mobile-projects-row-main';

        const nameRow = document.createElement('div');
        nameRow.className = 'theia-mobile-projects-row-name-row';
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-projects-row-chevron';
        chevron.textContent = '›';
        chevron.setAttribute('aria-hidden', 'true');
        nameRow.append(chevron);
        const nameGroup = document.createElement('span');
        nameGroup.className = 'theia-mobile-projects-row-name-group';
        const name = document.createElement('span');
        name.className = 'theia-mobile-projects-row-name';
        name.textContent = project.name;
        nameGroup.append(name);
        if (project.pinned) {
            const pin = document.createElement('span');
            pin.className = 'codicon codicon-pin theia-mobile-projects-row-pin';
            pin.setAttribute('aria-hidden', 'true');
            nameGroup.append(pin);
        }
        nameRow.append(nameGroup);
        if (this.homeMode) {
            const homeStatus = this.createHomeRowStatus(project, {
                unreadCount,
                running,
                runningCount: this.countRunningTasks(project),
                needsInput,
                failed,
                failedCount: this.countFailedTasks(project),
                needsInputCount: this.countNeedsInputTasks(project),
            });
            if (isExpanded && homeStatus) {
                homeStatus.classList.add('theia-mobile-projects-row-status-inline');
                nameRow.append(homeStatus);
            }
            const open = this.createWorkspaceOpenControl(project);
            open.classList.add('theia-mobile-projects-row-name-open');
            nameRow.append(open);
            main.append(nameRow);
            const showCurrentBadge = project.isCurrent;
            const showSubRow = (homeStatus && !isExpanded) || showCurrentBadge;
            if (showSubRow) {
                const subRow = document.createElement('div');
                subRow.className = 'theia-mobile-projects-row-sub';
                if (homeStatus && !isExpanded) {
                    subRow.append(homeStatus);
                }
                if (showCurrentBadge) {
                    const currentOpen = this.createCurrentOpenBadge();
                    subRow.append(currentOpen);
                }
                main.append(subRow);
            }
        } else {
            main.append(nameRow);
        }

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
            if (project.isCurrent && !this.homeMode) {
                const currentSep = document.createElement('span');
                currentSep.className = 'theia-mobile-projects-row-meta-sep';
                currentSep.textContent = '·';
                metaRow.append(currentSep, this.createCurrentOpenBadge());
            }
        } else if (doneCount > 0 || project.isCurrent) {
            const sep = document.createElement('span');
            sep.className = 'theia-mobile-projects-row-meta-sep';
            sep.textContent = '·';
            const cluster = document.createElement('span');
            cluster.className = 'theia-mobile-projects-row-meta-cluster';
            if (doneCount > 0) {
                const done = document.createElement('span');
                done.className = 'theia-mobile-projects-row-meta-done';
                done.textContent = doneCount === 1
                    ? nls.localize('qaap/mobileProjects/rowChat', '1 chat')
                    : nls.localize('qaap/mobileProjects/rowChatsMany', '{0} chats', String(doneCount));
                cluster.append(done);
            }
            if (project.isCurrent && !this.homeMode) {
                if (doneCount > 0) {
                    const innerSep = document.createElement('span');
                    innerSep.className = 'theia-mobile-projects-row-meta-sep';
                    innerSep.textContent = '·';
                    cluster.append(innerSep);
                }
                cluster.append(this.createCurrentOpenBadge());
            }
            metaRow.append(sep, cluster);
        }
        // Explicit "open in workspace" icon button on the meta row for non-home list layout.
        // Home mode always places it on the name row (collapsed and expanded).
        if (!this.homeMode) {
            metaRow.append(this.createWorkspaceOpenControl(project));
        }
        if (!this.homeMode || isExpanded) {
            main.append(metaRow);
        }
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

        const onRowActivate = (): void => {
            if (this.homeMode) {
                void this.openProjectDetail(project);
                return;
            }
            void this.toggleRowExpanded(project);
        };
        header.addEventListener('click', ev => {
            ev.stopPropagation();
            onRowActivate();
        });
        header.addEventListener('keydown', ev => {
            if (ev.key !== 'Enter' && ev.key !== ' ') {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            onRowActivate();
        });
        header.addEventListener('contextmenu', ev => {
            ev.preventDefault();
            onRowActivate();
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
        body.append(this.createTaskBlock(project, activeInfo));

        card.append(body, menu);
        return card;
    }

    protected async openProjectDetail(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        if (this.expandedId === project.id) {
            return;
        }
        this.expandedId = project.id;
        this.soloExpanded = true;
        this.disposeStickyComposerTools();
        this.stickyComposerContext = [];
        this.stickyComposerPinnedAgentId = undefined;
        this.stickyComposerModeId = undefined;
        await this.refreshChatServiceSessionSummaries();
        this.render();
        this.syncLandingHubListChrome();
        this.delegate.onProjectsChanged?.();
    }

    protected async toggleRowExpanded(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const wasExpanded = this.expandedId === project.id;
        this.expandedId = wasExpanded ? undefined : project.id;
        this.suppressCurrentAutoExpand = wasExpanded && project.isCurrent;
        // Hide the other rows while the user has a project expanded so the chat list isn't lost in
        // noise; when the user collapses it again the full list returns.
        this.soloExpanded = this.expandedId !== undefined;
        this.disposeStickyComposerTools();
        this.stickyComposerContext = [];
        this.stickyComposerPinnedAgentId = undefined;
        this.stickyComposerModeId = undefined;
        if (wasExpanded) {
            this.stickyComposerDraft = '';
        }
        await this.refreshChatServiceSessionSummaries();
        this.renderList();
    }

    protected createHomeRowAvatar(project: MobileProjectEntry): HTMLSpanElement {
        const avatar = document.createElement('span');
        avatar.className = 'theia-mobile-projects-row-avatar';
        avatar.textContent = mobileProjectInitials(project.name);
        avatar.style.setProperty('--qaap-mobile-project-accent', project.color);
        return avatar;
    }

    protected createHomeRowStatus(
        project: MobileProjectEntry,
        state: {
            unreadCount: number;
            running: boolean;
            runningCount: number;
            needsInput: boolean;
            needsInputCount: number;
            failed: boolean;
            failedCount: number;
        },
    ): HTMLElement | undefined {
        const line = document.createElement('div');
        line.className = 'theia-mobile-projects-row-status';
        if (state.unreadCount > 0) {
            line.classList.add('theia-mod-new');
            line.textContent = state.unreadCount === 1
                ? nls.localize('qaap/mobileProjects/rowNewOne', '1 new')
                : nls.localize('qaap/mobileProjects/rowNewMany', '{0} new', String(state.unreadCount));
            return line;
        }
        if (state.needsInput) {
            line.classList.add('theia-mod-needs-input');
            line.textContent = state.needsInputCount === 1
                ? nls.localize('qaap/mobileProjects/rowNeedsInputOne', 'Needs your input')
                : nls.localize('qaap/mobileProjects/rowNeedsInputMany', '{0} need your input', String(state.needsInputCount));
            return line;
        }
        if (state.failed) {
            line.classList.add('theia-mod-failed');
            line.textContent = state.failedCount === 1
                ? nls.localize('qaap/mobileProjects/rowFailedOne', '1 failed')
                : nls.localize('qaap/mobileProjects/rowFailedMany', '{0} failed', String(state.failedCount));
            return line;
        }
        if (state.running) {
            line.classList.add('theia-mod-running');
            line.textContent = state.runningCount === 1
                ? nls.localize('qaap/mobileProjects/rowRunning', '1 running')
                : nls.localize('qaap/mobileProjects/rowRunningMany', '{0} running', String(state.runningCount));
            return line;
        }
        return undefined;
    }

    protected createWorkspaceOpenControl(project: MobileProjectEntry): HTMLButtonElement {
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
        return openBtn;
    }

    protected createWorkspaceCloseControl(): HTMLButtonElement {
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-projects-row-current-close';
        const closeLabel = nls.localize('qaap/mobileProjects/closeWorkspace', 'Close workspace');
        close.setAttribute('aria-label', closeLabel);
        close.title = closeLabel;
        close.textContent = '×';
        close.addEventListener('click', ev => {
            ev.stopPropagation();
            void this.closeCurrentWorkspace();
        });
        close.addEventListener('keydown', ev => ev.stopPropagation());
        return close;
    }

    protected createCurrentOpenBadge(): HTMLSpanElement {
        // Status badge — purely informational. The "open in workspace" affordance lives in
        // the icon button on the meta row; tapping the badge itself no longer navigates.
        const current = document.createElement('span');
        current.className = 'theia-mobile-projects-row-current-open';
        const currentLabel = document.createElement('span');
        currentLabel.className = 'theia-mobile-projects-row-current-open-label';
        currentLabel.textContent = nls.localize('qaap/mobileProjects/ideOpen', 'IDE open');
        current.append(currentLabel, this.createWorkspaceCloseControl());
        return current;
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

    protected createTaskBlock(
        project: MobileProjectEntry,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
    ): HTMLElement {
        const block = document.createElement('div');
        block.className = 'theia-mobile-projects-tasks-block';
        const allConversations = this.conversationsForProject(project);
        const head = document.createElement('div');
        head.className = 'theia-mobile-projects-tasks-head';
        const headLabel = document.createElement('span');
        headLabel.textContent = nls.localize('qaap/mobileProjects/conversationsHeading', 'Recent chats');
        head.append(headLabel);

        if (allConversations.length > 0) {
            const count = document.createElement('span');
            count.className = 'theia-mobile-projects-tasks-count';
            count.textContent = String(allConversations.length);
            head.append(count);
        }
        block.append(head);

        if (allConversations.length === 0) {
            const fallbackTasks = this.fallbackTasksFromProject(project);
            if (fallbackTasks.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'theia-mobile-projects-tasks-empty';
                empty.textContent = nls.localize(
                    'qaap/mobileProjects/conversationsEmpty', 'No recent chats yet. Start one below.'
                );
                block.append(empty);
                return block;
            }
            const list = document.createElement('div');
            list.className = 'theia-mobile-projects-tasks-list';
            for (const task of fallbackTasks) {
                list.append(this.createTaskItem(project, task, activeInfo));
            }
            block.append(list);
            return block;
        }

        const showAll = this.expandedConversationProjectIds.has(project.id);
        const limit = MobileProjectsPanel.CONVERSATIONS_COLLAPSED_LIMIT;
        const visibleConversations = showAll
            ? allConversations
            : allConversations.slice(0, limit);
        const hiddenCount = allConversations.length - visibleConversations.length;
        const tasks = visibleConversations.map(c => this.summaryToTaskView(c));

        // Pre-compute the set of conversation ids that have at least one descendant fork, so each
        // row can decide which lineage glyph to render (parent / child / both / standalone).
        const parentIds = new Set<string>();
        for (const c of allConversations) {
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
                const summary = visibleConversations.find(c => c.id === task.id);
                section.append(this.createTaskItem(project, task, activeInfo, summary, parentIds));
            }
            list.append(section);
        }
        block.append(list);

        if (hiddenCount > 0) {
            const moreRow = document.createElement('div');
            moreRow.className = 'theia-mobile-projects-tasks-more-row';
            const moreBtn = document.createElement('button');
            moreBtn.type = 'button';
            moreBtn.className = 'theia-mobile-projects-tasks-more-btn';
            const icon = document.createElement('span');
            icon.className = 'codicon codicon-ellipsis';
            icon.setAttribute('aria-hidden', 'true');
            moreBtn.append(
                icon,
                document.createTextNode(
                    nls.localize('qaap/mobileProjects/conversationsMore', 'More ({0})', String(hiddenCount)),
                ),
            );
            moreBtn.addEventListener('click', ev => {
                ev.stopPropagation();
                this.expandedConversationProjectIds.add(project.id);
                this.renderList();
            });
            moreRow.append(moreBtn);
            block.append(moreRow);
        }

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
        if (summary && this.transcriptOpenSummaryId === summary.id) {
            row.classList.add('theia-mod-current');
        }

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
            if (isDone && summary && summary.messageCount > 0) {
                taskDot.className = 'theia-mobile-projects-task-dot theia-mod-complete codicon codicon-pass';
            } else if (isFailed) {
                taskDot.className = 'theia-mobile-projects-task-dot theia-mod-failed codicon codicon-error';
            } else if (isRunning) {
                this.renderConversationTurnProgress(taskDot, summary);
            } else if (needsInput) {
                taskDot.className = 'theia-mobile-projects-task-dot theia-mod-needs-input codicon codicon-warning';
            } else {
                taskDot.className = 'theia-mobile-projects-task-dot theia-mod-idle';
                taskDot.style.background = stateColor;
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
        taskSince.textContent = this.formatTaskSince(task, summary);
        if (isRunning && summary?.turnProgressTotal && summary.turnProgressCurrent !== undefined) {
            const progressCount = document.createElement('span');
            progressCount.className = 'theia-mobile-projects-task-progress-count';
            progressCount.textContent = `${summary.turnProgressCurrent}/${summary.turnProgressTotal}`;
            const progressLabel = nls.localize(
                'qaap/mobileProjects/taskProgressSteps',
                '{0} of {1} steps',
                String(summary.turnProgressCurrent),
                String(summary.turnProgressTotal),
            );
            progressCount.setAttribute('aria-label', progressLabel);
            progressCount.title = progressLabel;
            taskTitleRow.append(taskTitle, progressCount, taskSince);
        } else {
            taskTitleRow.append(taskTitle, taskSince);
        }
        taskBody.append(taskTitleRow);

        const footRow = document.createElement('div');
        footRow.className = 'theia-mobile-projects-task-foot';
        const agentLabel = this.resolveConversationAgentLabel(summary);
        const agentChip = document.createElement('span');
        agentChip.className = 'theia-mobile-projects-task-agent';
        agentChip.style.color = stateColor;
        agentChip.textContent = agentLabel;
        footRow.append(agentChip);
        if (summary?.linkedPullRequest?.number) {
            const prChip = document.createElement('span');
            prChip.className = 'theia-mobile-projects-task-agent theia-mod-linked-pr';
            prChip.textContent = nls.localize(
                'qaap/mobileProjects/inboxLinkedPr',
                'PR #{0}',
                String(summary.linkedPullRequest.number),
            );
            footRow.append(prChip);
        }
        this.appendConversationFootMetrics(footRow, summary, isRunning, stateColor);

        const showStateChip = !isRunning || !summary?.activityLabel;
        if (showStateChip) {
            this.appendTaskFootSeparator(footRow);
            const stateChip = document.createElement('span');
            stateChip.className = 'theia-mobile-projects-task-state';
            stateChip.style.color = stateColor;
            stateChip.textContent = this.taskStateLabel(task.state);
            footRow.append(stateChip);
        }

        if (summary && summary.messageCount > 0 && !this.hasConversationDiffStats(summary)) {
            this.appendTaskFootSeparator(footRow);
            const msgCount = document.createElement('span');
            msgCount.className = 'theia-mobile-projects-task-message-count';
            msgCount.textContent = summary.messageCount === 1
                ? nls.localize('qaap/mobileProjects/taskMessageOne', '1 message')
                : nls.localize('qaap/mobileProjects/taskMessageMany', '{0} messages', String(summary.messageCount));
            footRow.append(msgCount);
        }
        taskBody.append(footRow);

        item.append(taskDot, taskBody);
        item.addEventListener('click', ev => {
            ev.stopPropagation();
            void this.openTaskInAgent(project, task);
        });
        row.append(item);

        if (summary && this.isConversationUnread(summary)) {
            const unread = document.createElement('span');
            unread.className = 'theia-mobile-projects-task-unread';
            const unreadLabel = nls.localize('qaap/mobileProjects/unreadBadge', 'New agent reply');
            unread.setAttribute('aria-label', unreadLabel);
            unread.title = unreadLabel;
            row.append(unread);
        }

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
            if (isFailed && summary.source !== 'theia-chat') {
                const retryBtn = document.createElement('button');
                retryBtn.type = 'button';
                retryBtn.className = 'theia-mobile-projects-card-menu-btn theia-mobile-projects-conversation-retry-btn';
                const retryLabel = nls.localize('qaap/mobileProjects/retryChat', 'Retry last message');
                retryBtn.setAttribute('aria-label', retryLabel);
                retryBtn.title = retryLabel;
                const retryIcon = document.createElement('span');
                retryIcon.className = 'codicon codicon-debug-restart';
                retryIcon.setAttribute('aria-hidden', 'true');
                retryBtn.append(retryIcon);
                retryBtn.addEventListener('click', ev => {
                    ev.stopPropagation();
                    void this.onRetryConversation(project, summary);
                });
                row.append(retryBtn);
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

    protected renderConversationTurnProgress(
        host: HTMLElement,
        summary?: QaapAgentConversationSummaryDTO,
    ): void {
        const hasSteps = summary?.turnProgressTotal !== undefined
            && summary.turnProgressCurrent !== undefined
            && summary.turnProgressTotal > 0;
        host.className = 'theia-mobile-projects-task-progress';
        if (!hasSteps) {
            host.classList.add('theia-mod-indeterminate');
            host.setAttribute('aria-label', nls.localize('qaap/mobileProjects/taskProgressWorking', 'Agent working'));
            return;
        }
        const current = summary!.turnProgressCurrent!;
        const total = summary!.turnProgressTotal!;
        const ratio = conversationTurnProgressRatio(current, total);
        host.style.setProperty('--theia-mobile-projects-progress', String(ratio));
        host.setAttribute('aria-label', nls.localize(
            'qaap/mobileProjects/taskProgressSteps',
            '{0} of {1} steps',
            String(current),
            String(total),
        ));
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 22 22');
        svg.setAttribute('aria-hidden', 'true');
        const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        track.setAttribute('class', 'theia-mobile-projects-task-progress-track');
        track.setAttribute('cx', '11');
        track.setAttribute('cy', '11');
        track.setAttribute('r', '9');
        const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        fill.setAttribute('class', 'theia-mobile-projects-task-progress-fill');
        fill.setAttribute('cx', '11');
        fill.setAttribute('cy', '11');
        fill.setAttribute('r', '9');
        const circumference = 2 * Math.PI * 9;
        fill.style.strokeDasharray = `${circumference}`;
        fill.style.strokeDashoffset = `${circumference * (1 - ratio)}`;
        svg.append(track, fill);
        host.append(svg);
    }

    protected formatTaskSince(task: MobileProjectTaskView, summary?: QaapAgentConversationSummaryDTO): string {
        const anchor = task.state === 'running'
            ? (summary?.updatedAt ?? task.createdAt)
            : (task.finishedAt ?? summary?.updatedAt ?? task.createdAt);
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

    protected appendTaskFootSeparator(footRow: HTMLElement): void {
        const sep = document.createElement('span');
        sep.className = 'theia-mobile-projects-task-foot-sep';
        sep.textContent = '·';
        footRow.append(sep);
    }

    protected appendConversationFootMetrics(
        footRow: HTMLElement,
        summary: QaapAgentConversationSummaryDTO | undefined,
        isRunning: boolean,
        stateColor: string,
    ): void {
        if (!summary) {
            return;
        }
        if (isRunning && summary.activityLabel) {
            this.appendTaskFootSeparator(footRow);
            const activity = document.createElement('span');
            activity.className = 'theia-mobile-projects-task-activity';
            activity.style.color = stateColor;
            activity.textContent = this.localizeActivityLabel(summary.activityLabel);
            footRow.append(activity);
        }
        if (this.hasConversationDiffStats(summary)) {
            this.appendConversationDiffFoot(footRow, summary);
        }
        const ranLabel = this.formatConversationRunDuration(summary, isRunning);
        if (ranLabel) {
            this.appendTaskFootSeparator(footRow);
            const ran = document.createElement('span');
            ran.className = 'theia-mobile-projects-task-ran';
            ran.textContent = ranLabel;
            footRow.append(ran);
        }
    }

    protected localizeActivityLabel(label: string): string {
        switch (label) {
            case 'Searching':
                return nls.localize('qaap/mobileProjects/activitySearching', 'Searching');
            case 'Thinking':
                return nls.localize('qaap/mobileProjects/activityThinking', 'Thinking');
            case 'Reading files':
                return nls.localize('qaap/mobileProjects/activityReading', 'Reading files');
            case 'Running command':
                return nls.localize('qaap/mobileProjects/activityRunningCommand', 'Running command');
            case 'Editing':
                return nls.localize('qaap/mobileProjects/activityEditing', 'Editing');
            case 'Working':
                return nls.localize('qaap/mobileProjects/taskPreviewWorking', 'Working…');
            default:
                return label;
        }
    }

    protected hasConversationDiffStats(summary?: QaapAgentConversationSummaryDTO): boolean {
        if (!summary) {
            return false;
        }
        return (summary.linesAdded ?? 0) > 0 || (summary.linesRemoved ?? 0) > 0;
    }

    protected appendConversationDiffFoot(footRow: HTMLElement, summary: QaapAgentConversationSummaryDTO): void {
        const added = summary.linesAdded ?? 0;
        const removed = summary.linesRemoved ?? 0;
        this.appendTaskFootSeparator(footRow);
        const diff = document.createElement('span');
        diff.className = 'theia-mobile-projects-task-diff';
        const addedSpan = document.createElement('span');
        addedSpan.className = 'theia-mobile-projects-task-diff-added';
        addedSpan.textContent = `+${added}`;
        const removedSpan = document.createElement('span');
        removedSpan.className = 'theia-mobile-projects-task-diff-removed';
        removedSpan.textContent = `−${removed}`;
        diff.append(addedSpan, removedSpan);
        footRow.append(diff);
    }

    protected formatConversationRunDuration(
        summary: QaapAgentConversationSummaryDTO,
        isRunning: boolean,
    ): string | undefined {
        let durationMs: number | undefined;
        if (isRunning && summary.turnStartedAt) {
            durationMs = Math.max(0, Date.now() - summary.turnStartedAt);
        } else if (summary.lastTurnDurationMs) {
            durationMs = summary.lastTurnDurationMs;
        }
        if (durationMs === undefined || durationMs < 1000) {
            return undefined;
        }
        return nls.localize(
            'qaap/mobileProjects/ranFor',
            'Ran {0}',
            this.formatDurationShort(durationMs),
        );
    }

    protected formatDurationShort(durationMs: number): string {
        const minute = 60_000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (durationMs < minute) {
            return nls.localize(
                'qaap/mobileProjects/durationSeconds',
                '{0}s',
                String(Math.max(1, Math.round(durationMs / 1000))),
            );
        }
        if (durationMs < hour) {
            return nls.localize(
                'qaap/mobileProjects/durationMinutes',
                '{0}m',
                String(Math.max(1, Math.round(durationMs / minute))),
            );
        }
        if (durationMs < day) {
            return nls.localize(
                'qaap/mobileProjects/durationHours',
                '{0}h',
                String(Math.round(durationMs / hour)),
            );
        }
        return nls.localize(
            'qaap/mobileProjects/durationDays',
            '{0}d',
            String(Math.round(durationMs / day)),
        );
    }

    protected resolveConversationAgentLabel(summary?: QaapAgentConversationSummaryDTO): string {
        const agentId = summary?.agentId?.trim()
            || this.activeTasks?.getDefaultAgent()
            || SHELL_AGENT_ID;
        const fromList = this.activeTasks?.getAgents().find(a => a.id === agentId)?.label;
        if (fromList) {
            return fromList;
        }
        if (agentId === 'chat') {
            return nls.localize('qaap/mobileProjects/agentChat', 'Chat');
        }
        return agentId.startsWith('@') ? agentId : `@${agentId}`;
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

        if (summary.status === 'failed' && summary.source !== 'theia-chat') {
            this.appendCardMenuItem(menu, {
                label: nls.localize('qaap/mobileProjects/retryChat', 'Retry last message'),
                iconClass: 'codicon-debug-restart',
                onSelect: () => { void this.onRetryConversation(project, summary); },
            });
            const retrySep = document.createElement('div');
            retrySep.className = 'theia-mobile-projects-card-menu-separator';
            retrySep.setAttribute('role', 'separator');
            menu.append(retrySep);
        }

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

    protected async onRetryConversation(
        _project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeCardMenu();
        try {
            await retryConversation(summary.id);
        } catch (error) {
            this.messageService?.error(nls.localize(
                'qaap/mobileProjects/retryChatFailed',
                'Could not retry: {0}',
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
        this.stickyComposerDraft = draft ?? this.stickyComposerDraft;
        if (this.homeMode) {
            await this.openProjectDetail(project);
        } else {
            this.expandedId = project.id;
            this.soloExpanded = true;
            this.renderList();
        }
        window.setTimeout(() => {
            const input = this.stickyComposerHost.querySelector<HTMLInputElement>(
                '.theia-mobile-projects-sticky-composer-input',
            );
            input?.focus();
        }, 80);
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
            selectedAgentId?: string;
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
                if (summary.source === 'theia-chat') {
                    void this.openTheiaChatTranscriptSheet(project, summary);
                } else {
                    void this.openTranscriptSheet(project, summary);
                }
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
            selectedAgentId?: string;
            modeId?: string;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: ReturnType<AIChatInputWidget['getAllVariablesForRequest']>;
        },
    ): Promise<QaapAgentConversationSummaryDTO> {
        if (this.shouldUseTheiaCoder(draft, options.selectedAgentId)) {
            return this.createProjectTheiaChatSession(project, cwd, draft, options);
        }
        const agent = await this.selectBackendConversationAgent(cwd, draft, options.selectedAgentId);
        const message = applyBackendInteractionModeToPrompt(draft, options.modeId);
        const conversation = await createConversation({
            cwd,
            agent,
            title: draft,
            message,
        });
        const summary = conversationToSummary(conversation);
        this.conversations?.recordSnapshot(summary);
        return summary;
    }

    protected shouldUseTheiaCoder(content: string, selectedAgentId?: string): boolean {
        if (extractBackendAgentMention(content)) {
            return false;
        }
        return isTheiaCoderAgent(selectedAgentId) || isTheiaCoderMention(content);
    }

    protected async loadBackendAgentSnapshot(): Promise<QaapAgentTaskListSnapshot> {
        return this.activeTasks
            ? { agents: this.activeTasks.getAgents(), defaultAgent: this.activeTasks.getDefaultAgent(), agentConfigured: true }
            : fetchAgentTaskListAll();
    }

    protected async selectBackendConversationAgent(
        cwd: string,
        prompt: string,
        selectedAgentId?: string,
        conversationAgentId?: string,
    ): Promise<string> {
        const snapshot = await this.loadBackendAgentSnapshot();
        const resolved = resolveBackendAgentForTurn(prompt, snapshot.agents, {
            explicitAgentId: selectedAgentId,
            storedAgentId: readStoredAgent(cwd),
            defaultAgentId: snapshot.defaultAgent,
            conversationAgentId,
        });
        writeStoredAgent(cwd, resolved);
        return resolved;
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

    protected ensureAgentChatSession(cwd?: string): ChatSession {
        if (this.agentChatInputSession) {
            const pinned = this.resolvePinnedAgentForCwd(cwd);
            if (pinned) {
                this.agentChatInputSession.pinnedAgent = pinned;
            }
            return this.agentChatInputSession;
        }
        const pinned = this.resolvePinnedAgentForCwd(cwd);
        const session = this.chatService!.createSession(ChatAgentLocation.Panel, { focus: false }, pinned);
        this.agentChatInputSession = session;
        return session;
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

        const chatHost = document.createElement('div');
        chatHost.className = 'theia-mobile-agent-transcript-real-chat';
        this.renderTranscriptMessages(chatHost, this.summaryToTranscriptPlaceholder(summary));

        const chatInputHost = document.createElement('div');
        chatInputHost.className = 'theia-mobile-agent-transcript-chat-input';

        sheet.append(header, chatHost, chatInputHost);
        root.append(backdrop, sheet);
        document.body.append(root);
        this.transcriptSheet = root;
        this.transcriptChatHost = chatHost;
        this.transcriptOpenSummaryId = summary.id;
        this.transcriptLastFingerprint = undefined;
        if (this.visible) {
            this.renderList();
        }
        this.bindTranscriptSheetDismiss(close, backdrop);

        let refreshInFlight = false;
        const refresh = async (): Promise<void> => {
            if (refreshInFlight || !this.transcriptSheet || this.transcriptOpenSummaryId !== summary.id || !chatHost.isConnected) {
                return;
            }
            refreshInFlight = true;
            try {
                const full = await getConversation(summary.id);
                if (!this.transcriptSheet || this.transcriptOpenSummaryId !== summary.id || !chatHost.isConnected) {
                    return;
                }
                const fingerprint = this.conversationTranscriptFingerprint(full);
                if (fingerprint === this.transcriptLastFingerprint) {
                    return;
                }
                this.transcriptLastFingerprint = fingerprint;
                this.renderTranscriptMessages(chatHost, full);
                if (full.status === 'streaming' && this.conversations) {
                    this.setTranscriptLiveUpdates(this.conversations.onDidChange(() => {
                        if (this.shouldRefreshOpenTranscript(project, summary.id)) {
                            scheduleRefresh();
                        }
                    }));
                } else {
                    this.setTranscriptLiveUpdates(Disposable.NULL);
                }
            } catch (error) {
                if (!chatHost.isConnected) {
                    return;
                }
                const messageHost = this.resolveTranscriptMessageHost(chatHost);
                messageHost.replaceChildren();
                const err = document.createElement('div');
                err.className = 'theia-mobile-agent-transcript-error';
                err.textContent = error instanceof Error ? error.message : String(error);
                messageHost.append(err);
            } finally {
                refreshInFlight = false;
            }
        };
        const scheduleRefresh = (): void => {
            if (!this.transcriptSheet || this.transcriptOpenSummaryId !== summary.id) {
                return;
            }
            if (this.transcriptRefreshTimer !== undefined) {
                window.clearTimeout(this.transcriptRefreshTimer);
            }
            this.transcriptRefreshTimer = window.setTimeout(() => {
                this.transcriptRefreshTimer = undefined;
                void refresh();
            }, 450);
        };
        void refresh();

        this.transcriptComposerPinnedAgentId = migrateLegacyBackendAgentId(summary.agentId)
            ?? readStoredAgent(summary.cwd);
        void this.refreshTranscriptComposerAgents(project);
        this.mountTranscriptStickyComposer(chatInputHost, project, summary, chatHost);
    }

    protected setTranscriptLiveUpdates(disposable: Disposable): void {
        this.transcriptLiveUpdatesDispose.dispose();
        this.transcriptLiveUpdatesDispose = disposable;
    }

    protected bindTranscriptSheetDismiss(close: HTMLButtonElement, backdrop: HTMLElement): void {
        const dismiss = (ev?: Event): void => {
            ev?.preventDefault();
            ev?.stopPropagation();
            this.closeTranscriptSheet();
        };
        // Dismiss on click only — closing on pointerdown removes the overlay before the
        // synthesized click fires, so the tap can land on the workbench back/account controls.
        close.addEventListener('click', dismiss);
        backdrop.addEventListener('click', dismiss);
        const onKeyDown = (ev: KeyboardEvent): void => {
            if (ev.key === 'Escape') {
                dismiss(ev);
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        const previousDispose = this.transcriptSheetDispose;
        this.transcriptSheetDispose = Disposable.create(() => {
            previousDispose.dispose();
            close.removeEventListener('click', dismiss);
            backdrop.removeEventListener('click', dismiss);
            document.removeEventListener('keydown', onKeyDown, true);
        });
    }

    protected mountTranscriptStickyComposer(
        host: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        chatHost: HTMLElement,
    ): void {
        this.transcriptComposerHost = host;
        this.transcriptComposerProject = project;
        this.transcriptComposerSummary = summary;
        host.replaceChildren();
        const shell = document.createElement('div');
        shell.className = 'theia-mobile-projects-sticky-composer';
        const pinnedId = this.resolveTranscriptComposerPinnedAgentId(project, summary);
        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const modes = resolveStickyComposerModes(pinnedId, this.chatAgentService);
        this.transcriptComposerModeId = reconcileComposerModeId(
            this.transcriptComposerModeId,
            modes,
            cwd,
        );
        const column = this.buildStickyComposerColumn({
            project,
            getContext: () => this.transcriptComposerContext,
            clearContext: () => {
                this.transcriptComposerContext = [];
                this.remountTranscriptStickyComposer();
            },
            getDraft: () => this.transcriptComposerDraft,
            setDraft: value => { this.transcriptComposerDraft = value; },
            resolveAgentLabel: () => this.resolveTranscriptComposerAgentLabel(),
            modes,
            resolveModeLabel: () => resolveComposerModeLabel(modes, this.transcriptComposerModeId),
            onOpenModeSheet: modes.length > 1
                ? () => { this.openTranscriptComposerModeSheet(project, summary, modes); }
                : undefined,
            canSubmit: true,
            onAttach: () => { void this.onTranscriptComposerAttach(project); },
            onOpenAgentSheet: () => { this.openTranscriptComposerAgentSheet(project, summary); },
            onOpenToolsSheet: () => { void this.openTranscriptComposerToolsSheet(project, summary); },
            sendLabel: nls.localize('qaap/mobileProjects/transcriptSend', 'Send'),
            onSubmit: draft => {
                const resolvedPinnedId = this.resolveTranscriptComposerPinnedAgentId(project, summary);
                const selectedAgentId = resolveExplicitAgentForSubmit(draft, {
                    pinnedChatAgentId: resolvedPinnedId,
                }) ?? resolvedPinnedId;
                const widgetVars = this.transcriptComposerToolsWidget && !this.transcriptComposerToolsWidget.isDisposed
                    ? this.transcriptComposerToolsWidget.getAllVariablesForRequest()
                    : [];
                const variables = [...this.transcriptComposerContext, ...widgetVars];
                const capabilityOverrides = this.transcriptComposerToolsWidget?.getCapabilityOverridesForSubmit();
                const genericCapabilitySelections = this.transcriptComposerToolsWidget?.getGenericCapabilitySelectionsForSubmit();
                const modeId = this.transcriptComposerModeId;
                this.transcriptComposerContext = [];
                if (this.transcriptComposerToolsWidget && !this.transcriptComposerToolsWidget.isDisposed) {
                    this.transcriptComposerToolsWidget.clearPendingImageAttachments();
                }
                void (async () => {
                    try {
                        if (summary.source === 'theia-chat') {
                            await this.submitTranscriptViaTheiaChat(
                                project,
                                summary,
                                draft,
                                chatHost,
                                modeId,
                                capabilityOverrides,
                                genericCapabilitySelections,
                            );
                        } else {
                            await this.submitTranscriptViaBackendConversation(project, summary, draft, {
                                selectedAgentId,
                                modeId,
                                capabilityOverrides,
                                genericCapabilitySelections,
                                variables: variables.length > 0 ? variables : undefined,
                            });
                        }
                    } catch (error) {
                        const detail = error instanceof Error ? error.message : String(error);
                        this.messageService?.error(nls.localize(
                            'qaap/mobileProjects/transcriptSendFailed', 'Could not send: {0}', detail
                        ));
                    } finally {
                        this.remountTranscriptStickyComposer();
                    }
                })();
            },
            getMentionOptions: () => this.resolveComposerMentionOptions(this.transcriptComposerBackendAgents),
            getVariableOptions: this.getComposerVariables
                ? () => this.resolveComposerVariableOptions()
                : undefined,
        });
        shell.append(column);
        host.append(shell);
    }

    protected remountTranscriptStickyComposer(): void {
        const host = this.transcriptComposerHost;
        const project = this.transcriptComposerProject;
        const summary = this.transcriptComposerSummary;
        const chatHost = this.transcriptChatHost;
        if (!host?.isConnected || !project || !summary || !chatHost) {
            return;
        }
        this.mountTranscriptStickyComposer(host, project, summary, chatHost);
    }

    protected resolveTranscriptComposerPinnedAgentId(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): string {
        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const pinned = this.transcriptComposerPinnedAgentId
            ?? migrateLegacyBackendAgentId(summary.agentId)
            ?? readStoredAgent(cwd);
        if (pinned) {
            return pinned;
        }
        return this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID)
            ? THEIA_CODER_AGENT_ID
            : (this.transcriptComposerBackendAgents[0]?.id ?? QAIQ_AGENT_ID);
    }

    protected resolveTranscriptComposerAgentLabel(): string {
        const pinned = this.transcriptComposerPinnedAgentId;
        if (isTheiaCoderAgent(pinned)) {
            return this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID)?.name ?? 'Coder';
        }
        const fromList = this.transcriptComposerBackendAgents.find(a => a.id === pinned)?.label;
        if (fromList) {
            return fromList;
        }
        return this.resolveConversationAgentLabel(this.transcriptComposerSummary);
    }

    protected async refreshTranscriptComposerAgents(project: MobileProjectEntry): Promise<void> {
        const cwd = this.projectsService.getProjectCwd(project)
            ?? this.transcriptComposerSummary?.cwd
            ?? this.preparedCwdByProjectId.get(project.id);
        try {
            const snapshot = await this.loadBackendAgentSnapshot();
            const filteredAgents = this.filterSelectableComposerAgents(snapshot.agents);
            this.transcriptComposerBackendAgents = filteredAgents;
            const resolved = this.reconcileStickyComposerPinnedAgent(
                this.transcriptComposerPinnedAgentId ?? readStoredAgent(cwd),
                filteredAgents,
                snapshot.defaultAgent,
                cwd,
            );
            if (this.transcriptComposerPinnedAgentId !== resolved) {
                this.transcriptComposerPinnedAgentId = resolved;
                this.remountTranscriptStickyComposer();
            }
        } catch {
            this.transcriptComposerBackendAgents = this.filterSelectableComposerAgents(this.activeTasks?.getAgents() ?? []);
        }
    }

    protected async onTranscriptComposerAttach(project: MobileProjectEntry): Promise<void> {
        if (!this.pickContextVariable) {
            return;
        }
        const variable = await this.pickContextVariable();
        if (!variable) {
            return;
        }
        this.transcriptComposerContext.push(variable);
        this.remountTranscriptStickyComposer();
    }

    protected openTranscriptComposerAgentSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        this.closeTranscriptComposerSheets();
        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const sheet = document.createElement('div');
        sheet.className = 'theia-mobile-sticky-composer-sheet theia-mod-agent theia-mod-transcript-overlay';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeTranscriptComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickAgent', 'Choose agent');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileProjects/closeTranscript', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeTranscriptComposerSheets());
        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';

        const coder = this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID);
        if (coder) {
            list.append(this.createAgentSheetOption(
                coder.name,
                THEIA_CODER_AGENT_ID,
                cwd,
                this.transcriptComposerPinnedAgentId,
                id => {
                    this.transcriptComposerPinnedAgentId = id;
                    if (cwd) {
                        writeStoredAgent(cwd, id);
                    }
                    const modes = resolveStickyComposerModes(id, this.chatAgentService);
                    this.transcriptComposerModeId = reconcileComposerModeId(undefined, modes, cwd);
                    if (cwd && this.transcriptComposerModeId) {
                        writeStoredComposerMode(cwd, this.transcriptComposerModeId);
                    }
                    this.syncTranscriptToolsWidgetAgent(id);
                    void this.syncTranscriptToolsWidgetMode(this.transcriptComposerModeId);
                    this.closeTranscriptComposerSheets();
                    this.remountTranscriptStickyComposer();
                },
            ));
        }
        for (const agent of this.filterSelectableComposerAgents(this.transcriptComposerBackendAgents)) {
            list.append(this.createAgentSheetOption(
                agent.label,
                agent.id,
                cwd,
                this.transcriptComposerPinnedAgentId,
                id => {
                    this.transcriptComposerPinnedAgentId = id;
                    if (cwd) {
                        writeStoredAgent(cwd, id);
                    }
                    const modes = resolveStickyComposerModes(id, this.chatAgentService);
                    this.transcriptComposerModeId = reconcileComposerModeId(undefined, modes, cwd);
                    if (cwd && this.transcriptComposerModeId) {
                        writeStoredComposerMode(cwd, this.transcriptComposerModeId);
                    }
                    this.syncTranscriptToolsWidgetAgent(id);
                    void this.syncTranscriptToolsWidgetMode(this.transcriptComposerModeId);
                    this.closeTranscriptComposerSheets();
                    this.remountTranscriptStickyComposer();
                },
            ));
        }

        panel.append(header, list);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.transcriptComposerAgentSheet = sheet;
    }

    protected openTranscriptComposerModeSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        modes: readonly ChatMode[],
    ): void {
        this.closeTranscriptComposerSheets();
        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const sheet = document.createElement('div');
        sheet.className = 'theia-mobile-sticky-composer-sheet theia-mod-mode theia-mod-transcript-overlay';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeTranscriptComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickMode', 'Choose mode');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileProjects/closeTranscript', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeTranscriptComposerSheets());
        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';
        for (const mode of modes) {
            list.append(this.createModeSheetOption(
                mode.name,
                mode.id,
                this.transcriptComposerModeId,
                id => {
                    this.transcriptComposerModeId = id;
                    if (cwd) {
                        writeStoredComposerMode(cwd, id);
                    }
                    void this.syncTranscriptToolsWidgetMode(id);
                    this.closeTranscriptComposerSheets();
                    this.remountTranscriptStickyComposer();
                },
            ));
        }

        panel.append(header, list);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.transcriptComposerModeSheet = sheet;
    }

    protected async syncTranscriptToolsWidgetMode(modeId: string | undefined): Promise<void> {
        if (!modeId || !this.transcriptComposerToolsWidget || this.transcriptComposerToolsWidget.isDisposed) {
            return;
        }
        await this.transcriptComposerToolsWidget.applyComposerMode(modeId);
    }

    protected async openTranscriptComposerToolsSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        this.closeTranscriptComposerSheets();
        if (!this.createChatInputWidget || !this.chatService) {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.'),
                { duration: 2400 },
            );
            return;
        }
        const sheet = document.createElement('div');
        sheet.className = 'theia-mobile-sticky-composer-sheet theia-mod-tools theia-mod-transcript-overlay';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeTranscriptComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/stickyComposerTools', 'Tools & capabilities');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileProjects/closeTranscript', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeTranscriptComposerSheets());
        header.append(title, close);

        const host = document.createElement('div');
        host.className = 'theia-mobile-sticky-composer-tools-host';
        host.textContent = nls.localize('qaap/mobileProjects/agentInputLoading', 'Loading agent input…');

        const done = document.createElement('button');
        done.type = 'button';
        done.className = 'theia-mobile-sticky-composer-sheet-done';
        done.textContent = nls.localize('qaap/mobileProjects/stickyComposerToolsDone', 'Done');
        done.addEventListener('click', () => {
            void this.saveAndCloseTranscriptComposerToolsSheet();
        });

        panel.append(header, host, done);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.transcriptComposerToolsHost = host;

        const widget = await this.ensureTranscriptComposerToolsWidget(project, summary);
        if (!widget || !host.isConnected) {
            return;
        }
        if (widget.node.parentElement && widget.node.parentElement !== host) {
            LuminoWidget.detach(widget);
        }
        if (widget.node.parentElement !== host) {
            host.replaceChildren();
            LuminoWidget.attach(widget, host);
        }
        widget.node.classList.add(
            'chat-input-widget',
            'theia-mobile-projects-sticky-tools-input',
            'theia-mod-tools-only',
        );
        widget.show();
        widget.activate();
        widget.update();
        await widget.prepareToolsSheet();
        if (!widget.hasVisibleToolsContent()) {
            const empty = document.createElement('p');
            empty.className = 'theia-mobile-sticky-composer-tools-empty';
            empty.textContent = nls.localize(
                'qaap/mobileProjects/stickyComposerToolsEmpty',
                'No tools are configured for this agent. Use @mention in your message or check AI settings.',
            );
            host.prepend(empty);
        }
        widget.update();
    }

    protected async ensureTranscriptComposerToolsWidget(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<MobileProjectAIChatInputWidget | undefined> {
        if (this.transcriptComposerToolsWidget && !this.transcriptComposerToolsWidget.isDisposed) {
            this.syncTranscriptToolsWidgetAgent(this.resolveTranscriptComposerPinnedAgentId(project, summary));
            return this.transcriptComposerToolsWidget;
        }
        if (!this.createChatInputWidget || !this.chatService) {
            return undefined;
        }
        const uniqueId = `transcript-tools-${summary.id}-${++this.agentChatInputMountSeq}`;
        let widget: MobileProjectAIChatInputWidget;
        try {
            widget = await this.createChatInputWidget(uniqueId) as MobileProjectAIChatInputWidget;
        } catch (error) {
            console.error('[qaap-mobile-projects] transcript tools widget failed:', error);
            return undefined;
        }
        widget.id = `mobile-projects-transcript-tools-${uniqueId}`;
        const cwd = this.projectsService.getProjectCwd(project) ?? summary.cwd;
        const session = this.ensureAgentChatSession(cwd);
        widget.chatModel = session.model;
        this.syncTranscriptToolsWidgetAgent(this.resolveTranscriptComposerPinnedAgentId(project, summary));
        widget.setEnabled(true);
        widget.ensureStandaloneInputCallbacks();
        this.transcriptComposerToolsWidget = widget;
        return widget;
    }

    protected syncTranscriptToolsWidgetAgent(agentId: string): void {
        if (!this.transcriptComposerToolsWidget || this.transcriptComposerToolsWidget.isDisposed) {
            return;
        }
        const agent = isTheiaCoderAgent(agentId)
            ? this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID)
            : this.chatAgentForBackendId(agentId);
        if (agent) {
            this.transcriptComposerToolsWidget.pinnedAgent = agent;
            this.transcriptComposerToolsWidget.update();
        }
    }

    protected async saveAndCloseTranscriptComposerToolsSheet(): Promise<void> {
        const widget = this.transcriptComposerToolsWidget;
        if (widget && !widget.isDisposed) {
            await widget.saveToolsSheetSelectionsToSettings();
        }
        this.closeTranscriptComposerSheets();
        this.remountTranscriptStickyComposer();
    }

    protected closeTranscriptComposerSheets(): void {
        if (this.transcriptComposerAgentSheet) {
            this.transcriptComposerAgentSheet.remove();
            this.transcriptComposerAgentSheet = undefined;
        }
        if (this.transcriptComposerModeSheet) {
            this.transcriptComposerModeSheet.remove();
            this.transcriptComposerModeSheet = undefined;
        }
        if (this.transcriptComposerToolsWidget && !this.transcriptComposerToolsWidget.isDisposed) {
            if (this.transcriptComposerToolsWidget.node.isConnected) {
                LuminoWidget.detach(this.transcriptComposerToolsWidget);
            }
            this.transcriptComposerToolsWidget.stashToolsSheetPresentation();
        }
        if (this.transcriptComposerToolsHost) {
            const sheet = this.transcriptComposerToolsHost.closest('.theia-mobile-sticky-composer-sheet');
            sheet?.remove();
            this.transcriptComposerToolsHost = undefined;
        }
    }

    protected disposeTranscriptComposerTools(): void {
        this.closeTranscriptComposerSheets();
        if (this.transcriptComposerToolsWidget && !this.transcriptComposerToolsWidget.isDisposed) {
            this.transcriptComposerToolsWidget.dispose();
        }
        this.transcriptComposerToolsWidget = undefined;
    }

    protected attachTranscriptChatViewWidget(
        widget: MobileProjectChatViewWidget,
        chatHost: HTMLElement,
        session: ChatSession,
    ): boolean {
        if (session.model.getRequests().length === 0) {
            return false;
        }
        chatHost.classList.add('theia-mobile-agent-transcript-real-chat');
        chatHost.replaceChildren();
        widget.bindTranscriptSession(session);
        if (widget.node.parentElement && widget.node.parentElement !== chatHost) {
            LuminoWidget.detach(widget);
        }
        if (!widget.node.parentElement) {
            LuminoWidget.attach(widget, chatHost);
        }
        widget.show();
        widget.update();
        widget.activate();
        return true;
    }

    /** Lightweight placeholder until GET /agent-conversations/:id returns the full thread. */
    protected summaryToTranscriptPlaceholder(summary: QaapAgentConversationSummaryDTO): QaapAgentConversationDTO {
        const messages: QaapAgentConversationDTO['messages'] = [];
        if (summary.lastMessagePreview?.trim()) {
            messages.push({
                id: `${summary.id}:preview`,
                role: summary.lastMessageRole ?? 'user',
                content: summary.lastMessagePreview,
                createdAt: summary.updatedAt,
            });
        }
        return {
            id: summary.id,
            cwd: summary.cwd,
            agentId: summary.agentId,
            title: summary.title,
            status: summary.status,
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt,
            messages,
        };
    }

    /**
     * Scrollable message list inside {@link openTranscriptSheet}'s real-chat host. Keeps
     * `theia-mobile-agent-transcript-real-chat` on the outer host so flex layout does not collapse.
     */
    protected resolveTranscriptMessageHost(host: HTMLElement): HTMLElement {
        if (!host.classList.contains('theia-mobile-agent-transcript-real-chat')) {
            host.className = 'theia-mobile-agent-transcript';
            return host;
        }
        const existing = host.querySelector(':scope > .theia-mobile-agent-transcript');
        if (existing instanceof HTMLElement) {
            return existing;
        }
        const list = document.createElement('div');
        list.className = 'theia-mobile-agent-transcript';
        host.replaceChildren(list);
        return list;
    }

    /** Map a backend / storage agent id to a Theia {@link ChatAgent} for pinning in chat inputs. */
    protected chatAgentForBackendId(agentId: string | undefined): ChatAgent | undefined {
        const normalized = migrateLegacyBackendAgentId(agentId?.trim());
        if (!normalized || !this.chatAgentService) {
            return undefined;
        }
        if (isTheiaCoderAgent(normalized)) {
            return this.chatAgentService.getAgent(THEIA_CODER_AGENT_ID);
        }
        return this.chatAgentService.getAgent(normalized);
    }

    protected resolvePinnedAgentForCwd(cwd: string | undefined): ChatAgent | undefined {
        const stored = readStoredAgent(cwd);
        return this.chatAgentForBackendId(stored)
            ?? this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID);
    }

    protected inferBackendAgentIdFromChatSession(session: ChatSession): string | undefined {
        let lastMention: string | undefined;
        for (const request of session.model.getRequests()) {
            const mentioned = extractBackendAgentMention(request.request.text ?? '');
            if (mentioned) {
                lastMention = mentioned;
            }
        }
        if (lastMention) {
            return lastMention;
        }
        const pinned = migrateLegacyBackendAgentId(session.pinnedAgent?.id);
        if (pinned && pinned !== 'chat' && (normalizeBackendAgentId(pinned) || pinned === QAIQ_AGENT_ID)) {
            return pinned;
        }
        return undefined;
    }

    protected inferBackendAgentIdFromMessages(
        messages: ReadonlyArray<{ readonly content?: string }> | undefined,
    ): string | undefined {
        if (!messages?.length) {
            return undefined;
        }
        let last: string | undefined;
        for (const message of messages) {
            const mentioned = extractBackendAgentMention(message.content ?? '');
            if (mentioned) {
                last = mentioned;
            }
        }
        return last;
    }

    protected resolveBackendAgentIdForTranscript(
        summary: QaapAgentConversationSummaryDTO,
        session?: ChatSession,
        messages?: ReadonlyArray<{ readonly content?: string }>,
    ): string | undefined {
        if (session) {
            const fromSession = this.inferBackendAgentIdFromChatSession(session);
            if (fromSession) {
                return fromSession;
            }
        }
        const fromMessages = this.inferBackendAgentIdFromMessages(messages);
        if (fromMessages) {
            return fromMessages;
        }
        const fromTitle = extractBackendAgentMention(summary.title ?? '');
        if (fromTitle) {
            return fromTitle;
        }
        const fromSummary = migrateLegacyBackendAgentId(summary.agentId?.trim());
        if (fromSummary && fromSummary !== 'chat' && normalizeBackendAgentId(fromSummary)) {
            return fromSummary;
        }
        return readStoredAgent(summary.cwd);
    }

    protected resolveTranscriptPinnedAgent(
        summary: QaapAgentConversationSummaryDTO,
        session?: ChatSession,
        messages?: ReadonlyArray<{ readonly content?: string }>,
    ): ChatAgent | undefined {
        return this.chatAgentForBackendId(this.resolveBackendAgentIdForTranscript(summary, session, messages));
    }

    protected applyTranscriptPinnedAgent(
        summary: QaapAgentConversationSummaryDTO,
        session: ChatSession,
        inputWidget?: AIChatInputWidget,
        messages?: ReadonlyArray<{ readonly content?: string }>,
    ): ChatAgent | undefined {
        const agent = this.resolveTranscriptPinnedAgent(summary, session, messages);
        if (!agent) {
            return undefined;
        }
        session.pinnedAgent = agent;
        if (inputWidget) {
            inputWidget.pinnedAgent = agent;
        }
        if (summary.cwd) {
            writeStoredAgent(summary.cwd, agent.id);
        }
        return agent;
    }

    /** Ensure the outgoing Theia chat request targets the pinned or stored agent, not always Coder. */
    protected formatTheiaChatRequestText(content: string, pinnedAgentId?: string): string {
        if (extractBackendAgentMention(content) || isTheiaCoderMention(content)) {
            return content;
        }
        const agentId = migrateLegacyBackendAgentId(pinnedAgentId?.trim())
            ?? THEIA_CODER_AGENT_ID;
        return `@${agentId} ${content}`;
    }

    protected async submitTranscriptViaBackendConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        content: string,
        options: {
            selectedAgentId?: string;
            modeId?: string;
            capabilityOverrides?: Record<string, boolean>;
            genericCapabilitySelections?: GenericCapabilitySelections;
            variables?: AIVariableResolutionRequest[];
            widget?: AIChatInputWidget;
        } = {},
    ): Promise<void> {
        const agent = resolveExplicitAgentForSubmit(content, {
            pinnedChatAgentId: options.selectedAgentId ?? options.widget?.pinnedAgent?.id ?? summary.agentId,
        }) ?? options.selectedAgentId ?? summary.agentId;
        const outbound = applyBackendInteractionModeToPrompt(content, options.modeId);
        const base = await getConversation(summary.id);
        const optimistic: QaapAgentConversationDTO = {
            ...base,
            status: 'streaming',
            messages: [...base.messages, {
                id: `pending-user-${Date.now()}`,
                role: 'user',
                content: outbound,
                createdAt: Date.now(),
            }],
        };
        if (this.transcriptChatHost && this.transcriptOpenSummaryId === summary.id) {
            this.transcriptLastFingerprint = undefined;
            this.renderTranscriptMessages(this.transcriptChatHost, optimistic);
        }
        try {
            const updated = await postConversationMessage(summary.id, outbound, agent);
            const nextSummary = conversationToSummary(updated);
            this.conversations?.recordSnapshot(nextSummary);
            if (this.transcriptChatHost && this.transcriptOpenSummaryId === summary.id) {
                this.transcriptLastFingerprint = undefined;
                this.renderTranscriptMessages(this.transcriptChatHost, updated);
            }
            this.applyTaskStartedToProject(summary.cwd, content, summary.id);
        } catch (error) {
            if (this.transcriptChatHost && this.transcriptOpenSummaryId === summary.id) {
                this.transcriptLastFingerprint = undefined;
                this.renderTranscriptMessages(this.transcriptChatHost, base);
            }
            throw error;
        }
    }

    protected async createProjectTheiaChatSession(
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
        const coderAgent = this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID);
        const session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: false }, coderAgent);
        this.rememberChatSessionProject(session.id, project);
        this.trackChatServiceSessionModels();
        const summary = this.chatServiceSessionToSummary(session, project, cwd, draft, 'streaming');
        this.upsertProjectChatServiceSummary(project.id, summary);
        if (previousActiveSessionId && this.chatService.getSession(previousActiveSessionId)) {
            this.chatService.setActiveSession(previousActiveSessionId, { focus: false });
        }
        const pinnedId = readStoredAgent(cwd);
        const invocation = await this.chatService.sendRequest(session.id, {
            text: this.formatTheiaChatRequestText(draft, pinnedId),
            modeId: options.modeId,
            capabilityOverrides: options.capabilityOverrides,
            genericCapabilitySelections: options.genericCapabilitySelections,
            ...(options.variables && options.variables.length > 0 ? { variables: options.variables } : {}),
        });
        this.scheduleChatServiceRefresh();
        void invocation?.responseCompleted.finally(() => this.scheduleChatServiceRefresh());
        return summary;
    }

    protected async submitTranscriptViaTheiaChat(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        content: string,
        transcript: HTMLElement,
        modeId?: string,
        capabilityOverrides?: Record<string, boolean>,
        genericCapabilitySelections?: GenericCapabilitySelections,
        widget?: AIChatInputWidget,
    ): Promise<void> {
        if (!this.chatService) {
            throw new Error(nls.localize('qaap/mobileProjects/agentInputUnavailable', 'Agent input is unavailable.'));
        }
        let sessionId = this.transcriptTheiaSessionByConversationId.get(summary.id);
        let session = sessionId ? this.chatService.getSession(sessionId) : undefined;
        if (!session) {
            session = await this.getOrRestoreProjectChatSession(project, summary)
                ?? this.chatService.createSession(
                    ChatAgentLocation.Panel,
                    { focus: false },
                    this.resolveTranscriptPinnedAgent(summary),
                );
            this.transcriptTheiaSessionByConversationId.set(summary.id, session.id);
            sessionId = session.id;
        }
        this.applyTranscriptPinnedAgent(summary, session, widget);
        const base = summary.source === 'theia-chat'
            ? await this.conversations?.getTheiaConversation(summary.id)
            : await getConversation(summary.id);
        if (!base) {
            throw new Error(nls.localize('qaap/mobileProjects/transcriptUnavailable', 'This chat could not be loaded.'));
        }
        const userMessage = {
            id: `${session.id}:${Date.now()}:user`,
            role: 'user' as const,
            content,
            createdAt: Date.now(),
        };
        this.renderTranscriptMessages(transcript, {
            ...base,
            status: 'streaming',
            messages: [...base.messages, userMessage],
        });
        const invocation = await this.chatService.sendRequest(session.id, {
            text: this.formatTheiaChatRequestText(content, widget?.pinnedAgent?.id ?? session.pinnedAgent?.id),
            modeId,
            capabilityOverrides,
            genericCapabilitySelections,
        });
        if (!invocation) {
            throw new Error(nls.localize('qaap/mobileProjects/transcriptSendFailed', 'Could not send: {0}', 'no agent'));
        }
        await invocation.responseCompleted;
        const coderConversation = await this.getChatServiceConversation({ ...summary, sessionId: session.id });
        this.renderTranscriptMessages(transcript, {
            ...base,
            status: 'idle',
            messages: [
                ...base.messages,
                ...(coderConversation?.messages ?? []),
            ],
        });
        this.upsertProjectChatServiceSummary(project.id, this.chatServiceSessionToSummary(session, project, summary.cwd, summary.title, 'idle'));
    }

    protected async mountCoderChatView(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        host: HTMLElement,
    ): Promise<void> {
        try {
            if (!this.createChatViewWidget || !this.chatService) {
                throw new Error(nls.localize('qaap/mobileProjects/agentViewUnavailable', 'Agent chat is unavailable.'));
            }
            let sessionId = this.transcriptTheiaSessionByConversationId.get(summary.id);
            let session = sessionId ? this.chatService.getSession(sessionId) : undefined;
            if (!session) {
                const coderAgent = this.chatAgentService?.getAgent(THEIA_CODER_AGENT_ID);
                session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: false }, coderAgent);
                session.title = summary.title || project.name;
                this.transcriptTheiaSessionByConversationId.set(summary.id, session.id);
                sessionId = session.id;
                this.rememberChatSessionProject(session.id, project);
                this.trackChatServiceSessionModels();
            }
            const previousActiveSessionId = this.chatService.getActiveSession()?.id;
            this.chatService.setActiveSession(session.id, { focus: false });
            const uniqueId = `transcript-coder-${project.id}-${summary.id}-${++this.agentChatInputMountSeq}-${Date.now()}`;
            const widget = await this.createChatViewWidget(uniqueId) as MobileProjectChatViewWidget;
            if (!this.transcriptSheet || !host.isConnected) {
                widget.dispose();
                return;
            }
            if (this.attachTranscriptChatViewWidget(widget, host, session)) {
                this.transcriptChatViewWidget = widget;
            } else {
                widget.dispose();
            }
            const previousDispose = this.transcriptSheetDispose;
            this.transcriptSheetDispose = Disposable.create(() => {
                previousDispose.dispose();
                if (previousActiveSessionId && this.chatService?.getSession(previousActiveSessionId)) {
                    this.chatService.setActiveSession(previousActiveSessionId, { focus: false });
                }
            });
        } catch (error) {
            const messageHost = this.resolveTranscriptMessageHost(host);
            messageHost.replaceChildren();
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = error instanceof Error ? error.message : String(error);
            messageHost.append(err);
        }
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
        this.renderTranscriptMessages(chatHost, this.summaryToTranscriptPlaceholder(summary));

        sheet.append(header, chatHost);
        root.append(backdrop, sheet);
        document.body.append(root);
        this.transcriptSheet = root;

        const previousActiveSessionId = this.chatService?.getActiveSession()?.id;

        this.transcriptChatHost = chatHost;
        this.transcriptOpenSummaryId = summary.id;
        if (this.visible) {
            this.renderList();
        }
        this.bindTranscriptSheetDismiss(close, backdrop);
        try {
            if (!this.chatService || !summary.sessionId) {
                throw new Error(nls.localize('qaap/mobileProjects/agentViewUnavailable', 'Agent chat is unavailable.'));
            }
            const theiaConversation = summary.id.startsWith('theia-chat')
                ? await this.conversations?.getTheiaConversation(summary.id)
                : await this.getChatServiceConversation(summary);
            if (theiaConversation) {
                this.transcriptLastFingerprint = this.conversationTranscriptFingerprint(theiaConversation);
                this.renderTranscriptMessages(chatHost, theiaConversation);
            }
            this.transcriptSheetDispose = Disposable.create(() => {
                if (previousActiveSessionId && this.chatService?.getSession(previousActiveSessionId)) {
                    this.chatService.setActiveSession(previousActiveSessionId, { focus: false });
                }
            });
        } catch (error) {
            const messageHost = this.resolveTranscriptMessageHost(chatHost);
            messageHost.replaceChildren();
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = error instanceof Error ? error.message : String(error);
            messageHost.append(err);
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
        const existing = this.chatService.getSession(summary.sessionId);
        if (existing) {
            return existing;
        }
        if (summary.source === 'theia-chat' || summary.id.startsWith('theia-chat:')) {
            const fromProjects = await this.restoreTheiaChatSessionFromProjectsStorage(project, summary);
            if (fromProjects) {
                return fromProjects;
            }
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
            agentId: session.pinnedAgent?.id ?? summary.agentId,
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
        const session = restoredSession ?? this.ensureAgentChatSession(summary.cwd);
        widget.chatModel = session.model;
        const convMessages = summary.source === 'theia-chat'
            ? (await this.conversations?.getTheiaConversation(summary.id))?.messages
            : (await getConversation(summary.id).catch(() => undefined))?.messages;
        this.applyTranscriptPinnedAgent(summary, session, widget, convMessages);
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
        const messageHost = this.resolveTranscriptMessageHost(host);
        messageHost.replaceChildren();
        if (conv.messages.length === 0 && conv.status !== 'streaming') {
            const empty = document.createElement('div');
            empty.className = 'theia-mobile-agent-transcript-empty';
            empty.textContent = nls.localize('qaap/mobileProjects/transcriptEmpty', 'No messages yet.');
            messageHost.append(empty);
            return;
        }
        for (const msg of conv.messages) {
            if (msg.role === 'agent' && msg.segments && msg.segments.length > 0) {
                messageHost.append(this.createTranscriptAgentSegmentsRow(msg.segments, msg.error));
            } else {
                messageHost.append(this.createTranscriptMessageRow(msg.role, msg.content, msg.error));
            }
        }
        const last = conv.messages[conv.messages.length - 1];
        if (conv.status === 'streaming') {
            if (last?.role === 'agent') {
                messageHost.lastElementChild?.classList.add('theia-mod-streaming');
            } else {
                messageHost.append(this.createTranscriptMessageRow(
                    'agent',
                    nls.localize('qaap/mobileProjects/transcriptStreaming', 'Agent is working…'),
                    undefined,
                    true,
                ));
            }
        }
        messageHost.scrollTop = messageHost.scrollHeight;
    }

    protected createTranscriptAgentSegmentsRow(
        segments: QaapAgentMessageSegmentDTO[],
        error?: string,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-agent-transcript-msg theia-mod-agent';
        const roleEl = document.createElement('div');
        roleEl.className = 'theia-mobile-agent-transcript-role';
        roleEl.textContent = nls.localize('qaap/mobileProjects/transcriptAgent', 'Agent');
        row.append(roleEl);
        const body = document.createElement('div');
        body.className = 'theia-mobile-agent-transcript-segments';
        for (const segment of segments) {
            body.append(this.createTranscriptSegmentDetails(segment));
        }
        row.append(body);
        if (error) {
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = error;
            row.append(err);
        }
        return row;
    }

    protected createTranscriptSegmentDetails(segment: QaapAgentMessageSegmentDTO): HTMLElement {
        if (segment.type === 'thinking') {
            const details = document.createElement('details');
            details.className = 'theia-mobile-agent-transcript-details theia-mod-thinking';
            const summary = document.createElement('summary');
            summary.textContent = nls.localize('qaap/mobileProjects/transcriptThinking', 'Thinking');
            const pre = document.createElement('pre');
            pre.textContent = segment.content;
            details.append(summary, pre);
            return details;
        }
        if (segment.type === 'tool') {
            const details = document.createElement('details');
            details.className = 'theia-mobile-agent-transcript-details theia-mod-tool';
            const summary = document.createElement('summary');
            const status = segment.finished
                ? nls.localize('qaap/mobileProjects/transcriptToolDone', 'Tool')
                : nls.localize('qaap/mobileProjects/transcriptToolRunning', 'Tool (running)');
            summary.textContent = `${status}: ${segment.name}`;
            const args = document.createElement('pre');
            args.textContent = segment.args;
            details.append(summary, args);
            if (segment.result) {
                const result = document.createElement('pre');
                result.className = 'theia-mobile-agent-transcript-tool-result';
                result.textContent = segment.result;
                details.append(result);
            }
            return details;
        }
        const block = document.createElement('div');
        block.className = 'theia-mobile-agent-transcript-content';
        block.textContent = segment.content;
        return block;
    }

    /** Plain DOM fallback when {@link ChatViewWidget} is unavailable. */
    protected createTranscriptMessageRow(
        role: 'user' | 'agent',
        content: string,
        error?: string,
        placeholder?: boolean,
    ): HTMLElement {
        const row = document.createElement('div');
        row.className = `theia-mobile-agent-transcript-msg theia-mod-${role}`;
        const roleEl = document.createElement('div');
        roleEl.className = 'theia-mobile-agent-transcript-role';
        roleEl.textContent = role === 'user'
            ? nls.localize('qaap/mobileProjects/transcriptYou', 'You')
            : nls.localize('qaap/mobileProjects/transcriptAgent', 'Agent');
        const contentEl = document.createElement('div');
        contentEl.className = 'theia-mobile-agent-transcript-content';
        contentEl.textContent = placeholder
            ? nls.localize('qaap/mobileProjects/transcriptStreaming', 'Agent is working…')
            : content;
        row.append(roleEl, contentEl);
        if (error) {
            const err = document.createElement('div');
            err.className = 'theia-mobile-agent-transcript-error';
            err.textContent = error;
            row.append(err);
        }
        return row;
    }

    protected conversationTranscriptFingerprint(conv: QaapAgentConversationDTO): string {
        const last = conv.messages[conv.messages.length - 1];
        const segmentCount = last?.segments?.length ?? 0;
        const lastSegment = last?.segments?.[segmentCount - 1];
        const segmentTail = lastSegment && 'content' in lastSegment ? lastSegment.content.length : 0;
        return `${conv.status}|${conv.updatedAt}|${conv.messages.length}|${last?.id ?? ''}|${last?.content?.length ?? 0}|${segmentCount}|${segmentTail}`;
    }

    protected shouldRefreshOpenTranscript(project: MobileProjectEntry, conversationId: string): boolean {
        if (this.transcriptOpenSummaryId !== conversationId) {
            return false;
        }
        const latest = this.conversationsForProject(project).find(c => c.id === conversationId);
        return latest?.status === 'streaming';
    }

    protected closeTranscriptSheet(): void {
        this.closeTranscriptComposerSheets();
        this.disposeTranscriptComposerTools();
        this.transcriptComposerHost = undefined;
        this.transcriptComposerProject = undefined;
        this.transcriptComposerSummary = undefined;
        this.transcriptComposerContext = [];
        this.transcriptComposerPinnedAgentId = undefined;
        this.transcriptComposerModeId = undefined;
        this.transcriptComposerDraft = '';

        const sheet = this.transcriptSheet;
        this.transcriptSheet = undefined;
        this.transcriptOpenSummaryId = undefined;
        this.transcriptLastFingerprint = undefined;
        this.transcriptChatHost = undefined;
        if (this.visible) {
            this.renderList();
        }

        if (this.transcriptRefreshTimer !== undefined) {
            window.clearTimeout(this.transcriptRefreshTimer);
            this.transcriptRefreshTimer = undefined;
        }
        this.setTranscriptLiveUpdates(Disposable.NULL);
        this.transcriptSheetDispose.dispose();
        this.transcriptSheetDispose = Disposable.NULL;
        this.transcriptTheiaSessionByConversationId.clear();

        sheet?.remove();

        const inputWidget = this.transcriptChatInputWidget;
        const viewWidget = this.transcriptChatViewWidget;
        this.transcriptChatInputWidget = undefined;
        this.transcriptChatViewWidget = undefined;
        if (!inputWidget && !viewWidget) {
            return;
        }
        window.setTimeout(() => {
            if (inputWidget && !inputWidget.isDisposed) {
                inputWidget.dispose();
            }
            if (viewWidget && !viewWidget.isDisposed) {
                viewWidget.dispose();
            }
        }, 0);
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
