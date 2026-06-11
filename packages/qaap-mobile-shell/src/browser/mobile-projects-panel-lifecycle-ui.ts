// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { ChatService } from '@theia/ai-chat';
import { dismissQaapAccountMenu } from './qaap-workbench-account-menu';
import { renderQaapAccountAvatarVisual } from './qaap-account-avatar-visual';
import {
    hasMobileProjectsLeftLanding,
    setMobileLandingHubListChrome,
    setMobileWorkHubComposerHeaderChrome,
} from './mobile-projects-open';
import type { QaapComposerSurface } from '../common/qaap-composer-surface';
import type { QaapAgentConversationDTO } from '../common/qaap-agent-conversation-client';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import type { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry, MobileProjectFilter, MobileProjectsHubView } from './mobile-projects-types';
import type { MobileOpenRepositoryDialog } from './mobile-open-repository-dialog';
import type { MobileWorkHubInboxStream } from './mobile-work-hub-inbox-stream';
import type { MobileWorkHubSessionsSidebar } from './mobile-work-hub-sessions-sidebar';
import type { TranscriptWorkspaceSurfacesCache } from './qaap-transcript-workspace-surfaces-cache';
import type { MobileProjectsTranscriptComposerUi } from './mobile-projects-transcript-composer-ui';
import type { MobileProjectsTranscriptLiveUi } from './mobile-projects-transcript-live-ui';
import type { MobileProjectsTranscriptSheetUi } from './mobile-projects-transcript-sheet-ui';

/** Panel surface for show/hide/dispose and live subscription wiring. */
export interface MobileProjectsPanelLifecycleHost {
    visible: boolean;
    homeMode: boolean;
    hubView: MobileProjectsHubView;
    tasksHubSurface: QaapComposerSurface;
    filter: MobileProjectFilter;
    projects: MobileProjectEntry[];
    transcriptSheet: HTMLElement | undefined;
    transcriptChatHost: HTMLElement | undefined;
    transcriptLastConv: QaapAgentConversationDTO | undefined;
    agentsHubInlineActive: boolean;
    transcriptOpenSummaryId: string | undefined;
    tasksFirstLoadPending: boolean;
    tasksFirstLoadFallback: number | undefined;
    inboxPullRequests: QaapGithubPullRequestSummary[];
    inboxPullRequestsLoaded: boolean;
    routinesRefreshTimer: number | undefined;
    chatServiceRefreshHandle: number | undefined;
    chatSessionModelDisposables: Map<string, Disposable>;
    chatSessionProjectIds: Map<string, string>;
    sessionsSidebar: MobileWorkHubSessionsSidebar | undefined;
    stickyComposerFabLiftObserver: ResizeObserver | undefined;
    openRepoDialog: MobileOpenRepositoryDialog | undefined;
    root: HTMLElement;
    accountAvatar: HTMLElement;
    accountBtn: HTMLButtonElement;
    dragDismissDispose: Disposable;
    pullToRefreshDispose: Disposable;
    activeTasksDispose: Disposable;
    conversationsDispose: Disposable;
    inboxStreamDispose: Disposable;
    chatServiceDispose: Disposable;
    transcriptWorkspaceSurfaces: TranscriptWorkspaceSurfacesCache;
    onDocumentPointerDown: (ev: PointerEvent) => void;
    onAuthSessionChanged: () => void;
    onAccountClick: () => void;
    activeTasks: MobileProjectsActiveTasks | undefined;
    conversations: MobileProjectsConversations | undefined;
    inboxStream: MobileWorkHubInboxStream | undefined;
    chatService: ChatService | undefined;
    projectsService: MobileProjectsService;
    delegate: { onDismiss(): void };
    transcriptComposerUi: MobileProjectsTranscriptComposerUi;
    transcriptLiveUi: MobileProjectsTranscriptLiveUi;
    transcriptSheetUi: MobileProjectsTranscriptSheetUi;

    closeRoutineEditor(): void;
    closeCardMenu(): void;
    stickyComposerSheetsUi: import('./mobile-projects-sticky-composer-sheets-ui').MobileProjectsStickyComposerSheetsUi;
    workHubSearchUi: import('./mobile-projects-work-hub-search-ui').MobileProjectsWorkHubSearchUi;
    chatServiceSummariesUi: import('./mobile-projects-chat-service-summaries-ui').MobileProjectsChatServiceSummariesUi;
    disposeTranscriptTerminalSlides(): void;
    detachDiffReviewWidget(): void;
    ensureOverlayUi(): { team: { renderTeamSection(host: HTMLElement, conv: QaapAgentConversationDTO): void }; parallel: { applyParallelRunStats(runId: string, variants: unknown): void } };
    hubQueryUi: import('./mobile-projects-hub-query-ui').MobileProjectsHubQueryUi;
    refreshDiffHubView(): Promise<void>;
    refreshTasksHubApprovals(forceRender?: boolean): void;
    refreshInboxPullRequests(projects?: MobileProjectEntry[], force?: boolean): Promise<void>;
    refreshHomeHubData(forceRender: boolean): void;
    render(): void;
    renderList(): void;
    renderSubtitle(): void;
    renderFilters(): void;
    stickyComposerRenderUi: import('./mobile-projects-sticky-composer-render-ui').MobileProjectsStickyComposerRenderUi;
    syncLandingHubListChrome(): void;
    markTasksFirstLoadComplete(render: boolean): void;
    shouldSkipFullRenderListOnConversationTick(): boolean;
    refreshWorkHubConversationChrome(): void;
    mergeInboxPullRequests(polled: QaapGithubPullRequestSummary[]): QaapGithubPullRequestSummary[];
    updateTasksAttentionChrome(): void;
    cardMenuUi: import('./mobile-projects-card-menu-ui').MobileProjectsCardMenuUi;
}

export class MobileProjectsPanelLifecycleUi {
    constructor(protected readonly host: MobileProjectsPanelLifecycleHost) { }

    updateAccountAvatar(): void {
        renderQaapAccountAvatarVisual(this.host.accountAvatar, { titleTarget: this.host.accountBtn });
    }

    dispose(): void {
        dismissQaapAccountMenu();
        window.clearTimeout(this.host.routinesRefreshTimer);
        window.clearTimeout(this.host.tasksFirstLoadFallback);
        this.host.closeRoutineEditor();
        window.removeEventListener('qaap-auth-session-changed', this.host.onAuthSessionChanged);
        this.host.accountBtn.removeEventListener('click', this.host.onAccountClick);
        this.host.cardMenuUi.closeCardMenu();
        this.host.stickyComposerSheetsUi.closeStickyComposerSheets();
        this.host.transcriptComposerUi.closeTranscriptComposerSheets();
        this.host.dragDismissDispose.dispose();
        this.host.dragDismissDispose = Disposable.NULL;
        this.host.pullToRefreshDispose.dispose();
        this.host.pullToRefreshDispose = Disposable.NULL;
        this.host.activeTasksDispose.dispose();
        this.host.activeTasksDispose = Disposable.NULL;
        this.host.conversationsDispose.dispose();
        this.host.conversationsDispose = Disposable.NULL;
        this.host.inboxStreamDispose.dispose();
        this.host.inboxStreamDispose = Disposable.NULL;
        this.host.chatServiceDispose.dispose();
        this.host.chatServiceDispose = Disposable.NULL;
        this.disposeChatSessionModelListeners();
        this.host.transcriptSheetUi.closeTranscriptSheet();
        if (this.host.sessionsSidebar) {
            this.host.sessionsSidebar.hide();
            this.host.sessionsSidebar.node.remove();
            this.host.sessionsSidebar = undefined;
        }
        this.host.disposeTranscriptTerminalSlides();
        this.host.transcriptWorkspaceSurfaces.disposeAll();
        this.host.stickyComposerFabLiftObserver?.disconnect();
        this.host.stickyComposerFabLiftObserver = undefined;
        this.host.detachDiffReviewWidget();
        setMobileLandingHubListChrome(false);
        setMobileWorkHubComposerHeaderChrome(false);
    }

    async show(options?: { preferredHubView?: MobileProjectsHubView }): Promise<void> {
        this.host.projects = await this.host.projectsService.loadProjects();
        await this.host.conversations?.refreshTheiaChatSessionsForProjects(this.host.projects);
        await this.host.chatServiceSummariesUi.refreshChatServiceSessionSummaries();
        this.host.filter = this.host.projectsService.getFilter();
        this.host.tasksHubSurface = 'task';
        if (options?.preferredHubView !== undefined) {
            this.host.hubView = this.host.hubQueryUi.redirectHubView(options.preferredHubView);
            this.host.projectsService.setHubView(this.host.hubView);
        } else if (!this.host.visible) {
            const storedHubView = this.host.projectsService.getHubView();
            if (this.host.homeMode && !hasMobileProjectsLeftLanding()) {
                this.host.hubView = storedHubView === 'home' ? 'tasks' : this.host.hubQueryUi.redirectHubView(storedHubView);
                this.host.projectsService.setHubView(this.host.hubView);
            } else {
                this.host.hubView = this.host.hubQueryUi.redirectHubView(storedHubView);
            }
        }
        this.host.render();
        if (this.host.hubView === 'diff') {
            void this.host.refreshDiffHubView();
        }
        if (this.host.hubView === 'tasks') {
            this.host.conversations?.start();
            this.host.activeTasks?.start();
            this.host.refreshTasksHubApprovals(false);
        }
        if (this.host.hubView === 'review') {
            this.host.conversations?.start();
            this.host.inboxStream?.start();
            this.subscribeToInboxStream();
            void this.host.refreshInboxPullRequests(undefined, true);
        }
        if (this.host.hubView === 'home') {
            this.host.refreshHomeHubData(false);
        }
        this.host.visible = true;
        this.host.root.hidden = false;
        this.host.root.setAttribute('aria-hidden', 'false');
        this.host.root.classList.add('theia-mod-visible');
        document.addEventListener('pointerdown', this.host.onDocumentPointerDown, true);
        this.updateAccountAvatar();
        this.subscribeToActiveTasks();
        this.host.syncLandingHubListChrome();
    }

    hide(): void {
        if (!this.host.visible) {
            return;
        }
        this.host.cardMenuUi.closeCardMenu();
        dismissQaapAccountMenu();
        this.host.workHubSearchUi.closeWorkHubSearchQuickPick();
        this.host.openRepoDialog?.hide();
        document.removeEventListener('pointerdown', this.host.onDocumentPointerDown, true);
        this.host.activeTasksDispose.dispose();
        this.host.activeTasksDispose = Disposable.NULL;
        this.host.conversationsDispose.dispose();
        this.host.conversationsDispose = Disposable.NULL;
        this.host.inboxStreamDispose.dispose();
        this.host.inboxStreamDispose = Disposable.NULL;
        this.host.chatServiceDispose.dispose();
        this.host.chatServiceDispose = Disposable.NULL;
        this.disposeChatSessionModelListeners();
        this.host.transcriptSheetUi.closeTranscriptSheet();
        this.host.visible = false;
        this.host.root.hidden = true;
        this.host.root.setAttribute('aria-hidden', 'true');
        this.host.root.classList.remove('theia-mod-visible');
        this.host.syncLandingHubListChrome();
        setMobileWorkHubComposerHeaderChrome(false);
    }

    dismissPanelIfSheet(): void {
        if (this.host.homeMode) {
            return;
        }
        this.hide();
        this.host.delegate.onDismiss();
    }

    subscribeToActiveTasks(): void {
        this.host.activeTasksDispose.dispose();
        this.host.conversationsDispose.dispose();
        this.host.chatServiceDispose.dispose();
        if (this.host.activeTasks) {
            this.host.activeTasksDispose = this.host.activeTasks.onDidChange(() => {
                if (this.host.visible && this.host.transcriptSheet && this.host.transcriptChatHost && this.host.transcriptLastConv) {
                    this.host.ensureOverlayUi().team.renderTeamSection(this.host.transcriptChatHost, this.host.transcriptLastConv);
                }
                if (this.host.visible && this.host.hubQueryUi.isTasksHubView()) {
                    this.host.renderList();
                } else if (this.host.visible && !this.host.transcriptSheet) {
                    void this.applyActiveTasksRefresh();
                }
            });
        }
        if (this.host.conversations) {
            this.host.conversations.warmLiveTransport();
            if (this.host.tasksFirstLoadPending && this.host.tasksFirstLoadFallback === undefined) {
                this.host.tasksFirstLoadFallback = window.setTimeout(() => this.host.markTasksFirstLoadComplete(true), 5000);
            }
            const conversationUpdates = new DisposableCollection(
                this.host.conversations.onDidChange(() => {
                    this.host.markTasksFirstLoadComplete(false);
                    if (this.host.visible && this.host.hubQueryUi.isTasksHubView()) {
                        if (this.host.shouldSkipFullRenderListOnConversationTick()) {
                            this.host.refreshWorkHubConversationChrome();
                            this.host.transcriptLiveUi.ensureTranscriptConversationRefresh();
                            return;
                        }
                        this.host.renderList();
                        if (this.host.agentsHubInlineActive && this.host.transcriptOpenSummaryId) {
                            this.host.transcriptLiveUi.ensureTranscriptConversationRefresh();
                        }
                    } else if (this.host.visible && !this.host.transcriptSheet) {
                        void this.applyActiveTasksRefresh();
                    }
                }),
                this.host.conversations.onDidReceiveMessage(payload => {
                    this.host.transcriptLiveUi.handleTranscriptSseMessage(payload);
                }),
                this.host.conversations.onDidReceiveParallelRun(payload => {
                    this.host.ensureOverlayUi().parallel.applyParallelRunStats(payload.runId, payload.variants);
                }),
            );
            this.host.conversationsDispose = conversationUpdates;
        }
        this.subscribeToChatServiceSessions();
        this.subscribeToInboxStream();
    }

    subscribeToInboxStream(): void {
        this.host.inboxStreamDispose.dispose();
        if (!this.host.inboxStream) {
            this.host.inboxStreamDispose = Disposable.NULL;
            return;
        }
        this.host.inboxStreamDispose = this.host.inboxStream.onDidChange(() => {
            if (!this.host.visible || this.host.hubView !== 'review' || this.host.transcriptSheet) {
                return;
            }
            this.host.inboxPullRequests = this.host.mergeInboxPullRequests(this.host.inboxPullRequests);
            this.host.inboxPullRequestsLoaded = true;
            this.host.renderList();
        });
    }

    subscribeToChatServiceSessions(): void {
        if (!this.host.chatService) {
            this.host.chatServiceDispose = Disposable.NULL;
            return;
        }
        const disposables = new DisposableCollection();
        disposables.push(this.host.chatService.onSessionEvent(() => {
            this.trackChatServiceSessionModels();
            this.scheduleChatServiceRefresh();
        }));
        this.host.chatServiceDispose = disposables;
        this.trackChatServiceSessionModels();
    }

    trackChatServiceSessionModels(): void {
        if (!this.host.chatService) {
            return;
        }
        const liveIds = new Set(this.host.chatService.getSessions().map(session => session.id));
        for (const [sessionId, disposable] of [...this.host.chatSessionModelDisposables]) {
            if (!liveIds.has(sessionId)) {
                disposable.dispose();
                this.host.chatSessionModelDisposables.delete(sessionId);
                this.host.chatSessionProjectIds.delete(sessionId);
            }
        }
        for (const session of this.host.chatService.getSessions()) {
            if (this.host.chatSessionModelDisposables.has(session.id)) {
                continue;
            }
            this.host.chatSessionModelDisposables.set(session.id, session.model.onDidChange(() => {
                this.scheduleChatServiceRefresh();
            }));
        }
    }

    disposeChatSessionModelListeners(): void {
        if (this.host.chatServiceRefreshHandle !== undefined) {
            window.clearTimeout(this.host.chatServiceRefreshHandle);
            this.host.chatServiceRefreshHandle = undefined;
        }
        for (const disposable of this.host.chatSessionModelDisposables.values()) {
            disposable.dispose();
        }
        this.host.chatSessionModelDisposables.clear();
    }

    scheduleChatServiceRefresh(): void {
        if (this.host.transcriptSheet || !this.host.visible || this.host.chatServiceRefreshHandle !== undefined) {
            return;
        }
        this.host.chatServiceRefreshHandle = window.setTimeout(() => {
            this.host.chatServiceRefreshHandle = undefined;
            void this.applyActiveTasksRefresh();
        }, 120);
    }

    scheduleChatHubListRefreshAfterSummaries(): void {
        void this.host.chatServiceSummariesUi.refreshChatServiceSessionSummaries().then(() => {
            if (this.host.hubView === 'chat' && this.host.visible) {
                this.host.renderList();
                this.host.renderSubtitle();
            }
        });
    }

    async applyActiveTasksRefresh(): Promise<void> {
        if (this.host.transcriptSheet) {
            return;
        }
        try {
            this.host.projects = await this.host.projectsService.loadProjects();
            await this.host.conversations?.refreshTheiaChatSessionsForProjects(this.host.projects);
            await this.host.chatServiceSummariesUi.refreshChatServiceSessionSummaries();
            this.host.renderSubtitle();
            this.host.renderFilters();
            this.host.renderList();
            this.host.stickyComposerRenderUi.renderStickyComposer();
        } catch {
            /* a transient load failure must not break the live view */
        }
    }
}
