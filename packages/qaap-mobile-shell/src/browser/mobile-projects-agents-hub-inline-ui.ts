// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import {
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import {
    buildAgentsHubIdleConversationSummary,
    QAAP_AGENTS_HUB_LANDING_ENABLED,
} from '../common/qaap-agents-hub-landing';
import { attachTranscriptScrollToBottomButton } from './qaap-transcript-scroll-to-bottom';
import { attachTranscriptUserScrollPin } from './qaap-transcript-user-scroll-pin';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectsTranscriptUi } from './mobile-projects-transcript-ui';
import type { MobileProjectsTranscriptComposerUi } from './mobile-projects-transcript-composer-ui';
import type { MobileProjectsTranscriptHeaderUi } from './mobile-projects-transcript-header-ui';
import type { MobileProjectsTranscriptLiveUi } from './mobile-projects-transcript-live-ui';
import type { MobileProjectsTranscriptMessagesUi } from './mobile-projects-transcript-messages-ui';
import type { MobileProjectsTranscriptSheetUi } from './mobile-projects-transcript-sheet-ui';
import type { MobileProjectsExecutionSurfaceTabsUi } from './mobile-projects-execution-surface-tabs-ui';
import { disposeComposerContextEntries, type StickyComposerContextEntry } from '../common/qaap-composer-context-entry';

/** Panel surface for the Agents Hub inline execution shell (tasks landing). */
export interface MobileProjectsAgentsHubInlineHost {
    homeMode: boolean;
    hubView: import('./mobile-projects-types').MobileProjectsHubView;
    visible: boolean;
    scroll: HTMLElement;
    root: HTMLElement;
    projects: MobileProjectEntry[];
    agentsHubLegacyInbox: boolean;
    agentsHubSelectedProjectId: string | undefined;
    agentsHubShellActive: boolean;
    agentsHubInlineActive: boolean;
    agentsHubInlineChatHost: HTMLElement | undefined;
    agentsHubInlineTranscriptRoot: HTMLElement | undefined;
    agentsHubInlineExecutionRoot: HTMLElement | undefined;
    agentsHubInlineTabStrip: HTMLElement | undefined;
    replacingTranscriptSheet: boolean;
    transcriptOpenSummaryId: string | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptOpenProject: MobileProjectEntry | undefined;
    transcriptSheet: HTMLElement | undefined;
    transcriptTabStrip: HTMLElement | undefined;
    sessionsSidebar: { isVisible(): boolean; refreshList(): void } | undefined;
    transcriptLastStatus: QaapAgentConversationSummaryDTO['status'] | undefined;
    transcriptLastFingerprint: string | undefined;
    transcriptLastConv: QaapAgentConversationDTO | undefined;
    transcriptLastSseDeltaAt: number | undefined;
    transcriptChatHost: HTMLElement | undefined;
    transcriptPlanHost: HTMLElement | undefined;
    transcriptReviewHost: HTMLElement | undefined;
    transcriptPreviewHost: HTMLElement | undefined;
    transcriptFilesHost: HTMLElement | undefined;
    transcriptTerminalHost: HTMLElement | undefined;
    transcriptComposerHost: HTMLElement | undefined;
    transcriptComposerProject: MobileProjectEntry | undefined;
    transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptComposerMountKey: string | undefined;
    transcriptComposerContext: StickyComposerContextEntry[];
    transcriptComposerPinnedAgentId: string | undefined;
    transcriptComposerModeId: string | undefined;
    transcriptComposerApprovalPolicyId: import('../common/qaap-sticky-composer-approval-policy').QaapAgentApprovalPolicyId | undefined;
    transcriptComposerPrefsConvId: string | undefined;
    transcriptComposerDraft: string;
    transcriptComposerDraftPersistTimer: number | undefined;
    transcriptComposerPrefsPersistTimer: number | undefined;
    transcriptUserScrollPinDispose: Disposable;
    transcriptTheiaSessionByConversationId: Map<string, string>;
    transcriptUi: MobileProjectsTranscriptUi;
    headerExecutionTabsHost: HTMLElement;
    preparedCwdByProjectId: Map<string, string>;
    projectsService: MobileProjectsService;

    transcriptSheetUi: MobileProjectsTranscriptSheetUi;
    executionSurfaceTabsUi: MobileProjectsExecutionSurfaceTabsUi;
    transcriptComposerUi: MobileProjectsTranscriptComposerUi;
    transcriptHeaderUi: MobileProjectsTranscriptHeaderUi;
    transcriptLiveUi: MobileProjectsTranscriptLiveUi;
    transcriptMessagesUi: MobileProjectsTranscriptMessagesUi;
    renderHeader(): void;
    renderSubtitle(): void;
    renderList(): void;
    stickyComposerRenderUi: import('./mobile-projects-sticky-composer-render-ui').MobileProjectsStickyComposerRenderUi;
    detachTranscriptReviewWidget(): void;
    disposeTranscriptEmbeddedPreview(): void;
    notifyWorkspaceHubBottomBarRefresh(): void;
    resolveHomePinnedProject(): MobileProjectEntry | undefined;
    updateTasksAttentionChrome(): void;
    conversationsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    conversationIndexUi: import('./mobile-projects-conversation-index-ui').MobileProjectsConversationIndexUi
}

/** Agents Hub inline transcript shell: open/close session, execution surfaces, idle chat. */
export class MobileProjectsAgentsHubInlineUi {

    constructor(protected readonly host: MobileProjectsAgentsHubInlineHost) { }

    shouldPreserveAgentsHubInlineTranscriptShell(): boolean {
        return this.host.hubView === 'tasks'
            && this.shouldUseAgentsHubLanding()
            && this.host.agentsHubInlineActive
            && !!this.host.transcriptOpenSummaryId
            && !!this.host.agentsHubInlineExecutionRoot?.isConnected
            && this.host.agentsHubInlineExecutionRoot.parentElement === this.host.scroll;
    }

    /** SSE ticks while a transcript is open should not rebuild the whole Work Hub list. */
    shouldSkipFullRenderListOnConversationTick(): boolean {
        return this.host.hubView === 'tasks'
            && this.shouldUseAgentsHubLanding()
            && !!this.host.transcriptOpenSummaryId
            && (this.host.agentsHubInlineActive || !!this.host.transcriptSheet);
    }

    refreshWorkHubConversationChrome(): void {
        if (this.host.sessionsSidebar?.isVisible()) {
            this.host.sessionsSidebar.refreshList();
        }
        const project = this.resolveAgentsHubShellProject();
        const summary = this.host.transcriptOpenSummary;
        if (project && summary && this.host.agentsHubInlineActive) {
            const latest = this.host.conversationIndexUi.conversationsForProject(project).find(c => c.id === summary.id) ?? summary;
            const headerChanged = latest.status !== summary.status
                || latest.title !== summary.title
                || latest.updatedAt !== summary.updatedAt
                || !!latest.priority !== !!summary.priority;
            this.host.transcriptOpenSummary = latest;
            if (headerChanged) {
                this.syncAgentsHubInlineExecutionHeader(project, latest);
            }
        }
        this.host.updateTasksAttentionChrome();
        this.host.transcriptHeaderUi.refreshTranscriptExecutionChrome();
    }

    shouldUseAgentsHubLanding(): boolean {
        return QAAP_AGENTS_HUB_LANDING_ENABLED
            && this.host.homeMode
            && this.host.hubView === 'tasks'
            && !this.host.agentsHubLegacyInbox;
    }

    resolveAgentsHubShellProject(): MobileProjectEntry | undefined {
        if (this.host.agentsHubInlineActive && this.host.transcriptOpenProject) {
            return this.host.transcriptOpenProject;
        }
        if (this.host.agentsHubSelectedProjectId) {
            const selected = this.host.projects.find(project => project.id === this.host.agentsHubSelectedProjectId);
            if (selected) {
                return selected;
            }
        }
        return this.host.transcriptOpenProject ?? this.host.resolveHomePinnedProject();
    }

    resolveAgentsHubShellSummary(project: MobileProjectEntry): QaapAgentConversationSummaryDTO {
        if (this.host.transcriptOpenSummary) {
            return this.host.transcriptOpenSummary;
        }
        const cwd = this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id) ?? project.name;
        return buildAgentsHubIdleConversationSummary(cwd);
    }

    renderAgentsHubExecutionShell(): void {
        const project = this.resolveAgentsHubShellProject();
        if (!project) {
            this.host.agentsHubShellActive = false;
            const note = document.createElement('div');
            note.className = 'theia-mobile-agent-transcript-empty theia-mod-no-project';
            const title = document.createElement('div');
            title.className = 'theia-mobile-agent-transcript-empty-title';
            title.textContent = nls.localize(
                'qaap/mobileProjects/stickyComposerNoProject',
                'Add or open a repository first.',
            );
            note.append(title);
            this.host.scroll.append(note);
            this.host.updateTasksAttentionChrome();
            this.host.renderSubtitle();
            return;
        }
        const summary = this.resolveAgentsHubShellSummary(project);
        this.host.agentsHubShellActive = true;
        if (
            this.host.agentsHubInlineExecutionRoot?.isConnected
            && this.host.agentsHubInlineChatHost?.isConnected
        ) {
            const liveTranscriptOpen = this.host.agentsHubInlineActive && !!this.host.transcriptOpenSummaryId;
            if (!liveTranscriptOpen) {
                this.renderAgentsHubShellChat(this.host.agentsHubInlineChatHost, project, summary);
            }
            this.syncAgentsHubInlineExecutionHeader(project, summary);
            this.host.updateTasksAttentionChrome();
            this.host.renderSubtitle();
            void this.host.transcriptComposerUi.refreshTranscriptComposerAgents(project);
            this.host.stickyComposerRenderUi.renderStickyComposer();
            if (liveTranscriptOpen) {
                this.host.transcriptLiveUi.ensureTranscriptConversationRefresh();
            }
            return;
        }
        const executionRoot = document.createElement('div');
        executionRoot.className = 'theia-mobile-agents-hub-inline-execution';
        this.host.agentsHubInlineExecutionRoot = executionRoot;

        if (!this.host.transcriptPlanHost) {
            const surfaces = this.host.transcriptSheetUi.createTranscriptSheetSurfaceHosts();
            this.host.transcriptPlanHost = surfaces.planHost;
            this.host.transcriptReviewHost = surfaces.reviewHost;
            this.host.transcriptPreviewHost = surfaces.previewHost;
            this.host.transcriptFilesHost = surfaces.filesHost;
            this.host.transcriptTerminalHost = surfaces.terminalHost;
        }
        executionRoot.append(
            this.host.transcriptPlanHost!,
            this.host.transcriptReviewHost!,
            this.host.transcriptPreviewHost!,
            this.host.transcriptFilesHost!,
            this.host.transcriptTerminalHost!,
        );

        const transcriptRoot = document.createElement('div');
        transcriptRoot.className = 'theia-mobile-agents-hub-inline-transcript';
        this.host.agentsHubInlineTranscriptRoot = transcriptRoot;
        const chatHost = document.createElement('div');
        chatHost.className = 'theia-mobile-agent-transcript-real-chat';
        this.host.agentsHubInlineChatHost = chatHost;
        this.host.transcriptChatHost = chatHost;
        if (!(this.host.agentsHubInlineActive && this.host.transcriptOpenSummaryId)) {
            this.renderAgentsHubShellChat(chatHost, project, summary);
        }
        transcriptRoot.append(chatHost);
        executionRoot.append(transcriptRoot);
        this.host.scroll.append(executionRoot);

        this.host.transcriptUserScrollPinDispose.dispose();
        this.host.transcriptUserScrollPinDispose = new DisposableCollection(
            attachTranscriptUserScrollPin(chatHost),
            attachTranscriptScrollToBottomButton(chatHost),
        );
        this.host.updateTasksAttentionChrome();
        this.host.renderSubtitle();
        this.syncAgentsHubInlineExecutionHeader(project, summary);
        void this.host.transcriptComposerUi.refreshTranscriptComposerAgents(project);
        this.host.stickyComposerRenderUi.renderStickyComposer();
        if (this.host.agentsHubInlineActive && this.host.transcriptOpenSummaryId) {
            this.host.transcriptLiveUi.ensureTranscriptConversationRefresh();
        }
    }

    /** Same transcript host for idle and active sessions; idle shows starter chips in the scroll area. */
    renderAgentsHubShellChat(
        chatHost: HTMLElement,
        _project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        const activeSummary = this.host.agentsHubInlineActive && this.host.transcriptOpenSummary
            ? this.host.transcriptOpenSummary
            : summary;
        const conv = this.host.agentsHubInlineActive
            && this.host.transcriptLastConv
            && this.host.transcriptLastConv.id === activeSummary.id
            ? this.host.transcriptLastConv
            : this.host.transcriptSheetUi.summaryToTranscriptPlaceholder(activeSummary);
        this.host.transcriptMessagesUi.renderTranscriptMessages(chatHost, conv);
    }

    renderAgentsHubIdleSubmitOptimistic(
        chatHost: HTMLElement,
        summary: QaapAgentConversationSummaryDTO,
        draft: string,
        agentId: string,
    ): void {
        const outbound = draft.trim();
        if (!outbound) {
            return;
        }
        this.host.transcriptMessagesUi.renderTranscriptMessages(chatHost, {
            id: summary.id,
            cwd: summary.cwd,
            agentId,
            title: outbound.slice(0, 120),
            status: 'streaming',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [{
                id: `pending-user-${Date.now()}`,
                role: 'user',
                content: outbound,
                createdAt: Date.now(),
            }],
        });
    }

    syncAgentsHubInlineExecutionHeader(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void {
        const activeTab = this.host.executionSurfaceTabsUi.executionSurfaceTabForProject(project);
        const existingStrip = this.host.agentsHubInlineTabStrip;
        if (existingStrip?.isConnected && this.host.transcriptOpenSummaryId === summary.id) {
            this.host.executionSurfaceTabsUi.refreshExecutionSurfaceTabStripState(existingStrip, activeTab);
            this.host.executionSurfaceTabsUi.showOnlyExecutionSurfaceTab(activeTab);
            if (activeTab !== 'messages') {
                this.host.executionSurfaceTabsUi.mountTranscriptSurfaceTab(project, summary, activeTab);
            }
            this.host.executionSurfaceTabsUi.syncExecutionSurfaceChrome(project);
            this.host.root.classList.add('theia-mod-agents-hub-inline-active');
            this.host.root.classList.add('theia-mod-agents-hub-shell-active');
            return;
        }
        const tabStrip = this.host.executionSurfaceTabsUi.buildTranscriptTabStrip(project, summary);
        this.host.headerExecutionTabsHost.hidden = false;
        this.host.headerExecutionTabsHost.replaceChildren(tabStrip);
        this.host.agentsHubInlineTabStrip = tabStrip;
        this.host.transcriptTabStrip = tabStrip;
        this.host.executionSurfaceTabsUi.refreshExecutionSurfaceTabStripState(tabStrip, activeTab);
        this.host.executionSurfaceTabsUi.showOnlyExecutionSurfaceTab(activeTab);
        this.host.executionSurfaceTabsUi.mountTranscriptSurfaceTab(project, summary, activeTab);
        this.host.executionSurfaceTabsUi.syncExecutionSurfaceChrome(project);
        this.host.root.classList.add('theia-mod-agents-hub-inline-active');
        this.host.root.classList.add('theia-mod-agents-hub-shell-active');
    }

    teardownAgentsHubExecutionShell(): void {
        this.host.agentsHubShellActive = false;
        this.host.agentsHubInlineActive = false;
        this.clearAgentsHubInlineExecutionChrome();
        this.host.agentsHubInlineChatHost = undefined;
        this.host.agentsHubInlineTranscriptRoot = undefined;
        this.host.transcriptChatHost = undefined;
        this.host.transcriptPlanHost?.remove();
        this.host.transcriptPlanHost = undefined;
        this.host.detachTranscriptReviewWidget();
        this.host.transcriptReviewHost = undefined;
        this.host.transcriptPreviewHost = undefined;
        this.host.disposeTranscriptEmbeddedPreview();
        this.host.transcriptFilesHost = undefined;
        this.host.transcriptTerminalHost = undefined;
        this.host.transcriptUserScrollPinDispose.dispose();
        this.host.transcriptUserScrollPinDispose = Disposable.NULL;
    }

    clearAgentsHubInlineExecutionChrome(): void {
        this.host.root.classList.remove('theia-mod-agents-hub-inline-active');
        this.host.root.classList.remove('theia-mod-agents-hub-shell-active');
        this.host.agentsHubInlineExecutionRoot = undefined;
        this.host.agentsHubInlineTabStrip = undefined;
        this.host.agentsHubInlineTranscriptRoot = undefined;
        this.host.headerExecutionTabsHost.hidden = true;
        this.host.headerExecutionTabsHost.replaceChildren();
        if (this.host.transcriptPlanHost) {
            this.host.transcriptPlanHost.remove();
            this.host.transcriptReviewHost?.remove();
            this.host.transcriptPreviewHost?.remove();
            this.host.transcriptFilesHost?.remove();
            this.host.transcriptTerminalHost?.remove();
        }
        this.host.transcriptPlanHost = undefined;
        this.host.transcriptReviewHost = undefined;
        this.host.transcriptPreviewHost = undefined;
        this.host.transcriptFilesHost = undefined;
        this.host.transcriptTerminalHost = undefined;
    }

    async openAgentsHubInlineTranscript(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        if (this.host.agentsHubInlineActive) {
            this.host.replacingTranscriptSheet = true;
            this.closeAgentsHubSession();
            this.host.replacingTranscriptSheet = false;
        } else {
            this.host.replacingTranscriptSheet = true;
            this.host.transcriptSheetUi.closeTranscriptSheet();
            this.host.replacingTranscriptSheet = false;
        }
        this.host.agentsHubShellActive = true;
        this.host.agentsHubInlineActive = true;
        this.host.transcriptLastStatus = summary.status;
        this.host.transcriptOpenSummaryId = summary.id;
        this.host.transcriptOpenSummary = summary;
        this.host.transcriptOpenProject = project;
        this.host.transcriptComposerSummary = summary;
        this.host.transcriptLastFingerprint = undefined;
        if (this.host.visible) {
            this.host.renderHeader();
            this.host.renderSubtitle();
        }
        this.host.transcriptComposerPrefsConvId = undefined;
        this.host.transcriptComposerMountKey = undefined;
        void this.host.transcriptComposerUi.refreshTranscriptComposerAgents(project);
        this.host.executionSurfaceTabsUi.setExecutionSurfaceTab(project, 'messages');
        const connectedChatHost = this.host.agentsHubInlineChatHost;
        if (this.host.agentsHubInlineExecutionRoot?.isConnected && connectedChatHost?.isConnected) {
            this.host.transcriptLiveUi.stopTranscriptLiveWatch();
            this.host.transcriptLastConv = undefined;
            this.host.transcriptLastFingerprint = undefined;
            this.host.transcriptLastSseDeltaAt = undefined;
            this.syncAgentsHubInlineExecutionHeader(project, summary);
            this.host.executionSurfaceTabsUi.showOnlyExecutionSurfaceTab('messages');
            this.renderAgentsHubShellChat(connectedChatHost, project, summary);
            this.host.stickyComposerRenderUi.renderStickyComposer();
            this.host.transcriptLiveUi.scheduleTranscriptConversationRefresh(project, summary, connectedChatHost);
            await this.host.transcriptLiveUi.refreshOpenTranscriptConversation({ forcePoll: true });
            return;
        }
        if (!this.host.agentsHubInlineExecutionRoot?.isConnected) {
            if (this.host.visible) {
                this.host.renderList();
            } else {
                this.renderAgentsHubExecutionShell();
            }
        }
        const chatHost = this.host.agentsHubInlineChatHost;
        this.host.executionSurfaceTabsUi.showOnlyExecutionSurfaceTab('messages');
        this.host.executionSurfaceTabsUi.mountTranscriptSurfaceTab(project, summary, 'messages');
        this.host.stickyComposerRenderUi.renderStickyComposer();
        if (chatHost) {
            this.renderAgentsHubShellChat(chatHost, project, summary);
            this.host.transcriptLiveUi.scheduleTranscriptConversationRefresh(project, summary, chatHost);
            await this.host.transcriptLiveUi.refreshOpenTranscriptConversation({ forcePoll: true });
        }
    }

    closeAgentsHubSession(): void {
        this.host.executionSurfaceTabsUi.closeExecutionTabOverflowMenu();
        this.host.transcriptComposerUi.closeTranscriptComposerSheets();
        this.host.transcriptComposerHost = undefined;
        this.host.transcriptComposerProject = undefined;
        this.host.transcriptComposerSummary = undefined;
        disposeComposerContextEntries(this.host.transcriptComposerContext);
        this.host.transcriptComposerContext = [];
        this.host.transcriptComposerPinnedAgentId = undefined;
        this.host.transcriptComposerModeId = undefined;
        this.host.transcriptComposerApprovalPolicyId = undefined;
        this.host.transcriptComposerPrefsConvId = undefined;
        this.host.transcriptComposerDraft = '';
        if (this.host.transcriptComposerDraftPersistTimer !== undefined) {
            window.clearTimeout(this.host.transcriptComposerDraftPersistTimer);
            this.host.transcriptComposerDraftPersistTimer = undefined;
        }
        if (this.host.transcriptComposerPrefsPersistTimer !== undefined) {
            window.clearTimeout(this.host.transcriptComposerPrefsPersistTimer);
            this.host.transcriptComposerPrefsPersistTimer = undefined;
        }
        this.host.agentsHubInlineActive = false;
        this.host.transcriptOpenSummaryId = undefined;
        this.host.transcriptOpenSummary = undefined;
        this.host.transcriptOpenProject = undefined;
        this.host.transcriptLastFingerprint = undefined;
        this.host.transcriptLastConv = undefined;
        this.host.transcriptLastStatus = undefined;
        this.host.transcriptComposerMountKey = undefined;
        this.host.transcriptUi.disposeList();
        this.host.transcriptTheiaSessionByConversationId.clear();
        this.host.transcriptLiveUi.stopTranscriptLiveWatch();
        const chatHost = this.host.agentsHubInlineChatHost;
        const project = this.resolveAgentsHubShellProject();
        if (chatHost && project && this.host.agentsHubShellActive) {
            this.renderAgentsHubShellChat(chatHost, project, this.resolveAgentsHubShellSummary(project));
        } else if (chatHost) {
            chatHost.replaceChildren();
        }
        if (this.host.visible) {
            this.host.renderHeader();
            this.host.renderSubtitle();
            this.host.renderList();
        }
        if (!this.host.replacingTranscriptSheet) {
            this.host.notifyWorkspaceHubBottomBarRefresh();
        }
    }
}
