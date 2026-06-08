// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';
import {
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import type { ExecutionSurfaceTabId } from '../common/qaap-execution-surface-tabs';
import type { QaapGitHistoryCommit } from '../common/qaap-git-review';
import { setMobileActiveTranscriptChrome } from './mobile-projects-open';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsTranscriptUi } from './mobile-projects-transcript-ui';
import { TranscriptFollowUpQueue } from '../common/qaap-transcript-follow-up-queue';
import type { AIChatInputWidget } from '@theia/ai-chat-ui/lib/browser/chat-input-widget';
import type { MobileProjectChatViewWidget } from './mobile-project-ai-chat-input-widget';
import { disposeComposerContextEntries, type StickyComposerContextEntry } from '../common/qaap-composer-context-entry';

interface VerifyCheckResult {
    readonly check: { readonly label: string; readonly command: string };
    readonly state: string;
}

/** Panel surface for opening and closing the full-screen transcript sheet overlay. */
export interface MobileProjectsTranscriptSheetHost {
    replacingTranscriptSheet: boolean;
    transcriptSheet: HTMLElement | undefined;
    transcriptChatHost: HTMLElement | undefined;
    transcriptChatInputHost: HTMLElement | undefined;
    transcriptTabStrip: HTMLElement | undefined;
    transcriptPlanHost: HTMLElement | undefined;
    transcriptReviewHost: HTMLElement | undefined;
    transcriptPreviewHost: HTMLElement | undefined;
    transcriptFilesHost: HTMLElement | undefined;
    transcriptTerminalHost: HTMLElement | undefined;
    transcriptTerminalToolbar: HTMLElement | undefined;
    transcriptTerminalSlider: HTMLElement | undefined;
    transcriptTerminalDots: HTMLElement | undefined;
    verifyResults: VerifyCheckResult[];
    verifyChecksCwd: string | undefined;
    verifyChecksLoading: boolean;
    verifyRunning: boolean;
    verifyAutoAttempts: number;
    transcriptHistoryPanelOpen: boolean;
    transcriptHistoryCommits: QaapGitHistoryCommit[];
    transcriptHistoryBranch: string | undefined;
    transcriptHistoryQuery: string;
    transcriptHistoryRoot: string | undefined;
    transcriptHistoryLoading: boolean;
    transcriptLastStatus: string | undefined;
    transcriptOpenSummaryId: string | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptOpenProject: MobileProjectEntry | undefined;
    transcriptLastFingerprint: string | undefined;
    transcriptComposerPrefsConvId: string | undefined;
    transcriptComposerHost: HTMLElement | undefined;
    transcriptComposerMountKey: string | undefined;
    transcriptComposerProject: MobileProjectEntry | undefined;
    transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptComposerContext: StickyComposerContextEntry[];
    transcriptComposerPinnedAgentId: string | undefined;
    transcriptComposerModeId: string | undefined;
    transcriptComposerApprovalPolicyId: import('../common/qaap-sticky-composer-approval-policy').QaapAgentApprovalPolicyId | undefined;
    transcriptComposerDraft: string;
    transcriptComposerDraftPersistTimer: number | undefined;
    transcriptComposerPrefsPersistTimer: number | undefined;
    transcriptFollowUpFlushInFlight: boolean;
    transcriptFollowUpQueue: TranscriptFollowUpQueue;
    transcriptLastConv: QaapAgentConversationDTO | undefined;
    transcriptLastSseDeltaAt: number | undefined;
    transcriptHeaderSubtitle: HTMLElement | undefined;
    transcriptPreviewRequestRunning: boolean;
    transcriptPreviewRequestPending: boolean;
    transcriptChatInputWidget: AIChatInputWidget | undefined;
    transcriptChatViewWidget: MobileProjectChatViewWidget | undefined;
    transcriptSheetDispose: Disposable;
    transcriptUserScrollPinDispose: Disposable;
    transcriptTheiaSessionByConversationId: Map<string, string>;
    transcriptUi: MobileProjectsTranscriptUi;
    agentsHubInlineActive: boolean;
    visible: boolean;

    shouldUseAgentsHubLanding(): boolean;
    isProjectDetailView(): boolean;
    openAgentsHubInlineTranscript(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    onEnterActiveTranscript(): void;
    onExitActiveTranscript(): void;
    resolveTranscriptHeaderTitle(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): string;
    mountTranscriptExecutionHeader(
        header: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        titleText: string,
    ): { back: HTMLButtonElement; tabStrip: HTMLElement };
    renderTranscriptMessages(host: HTMLElement, conv: QaapAgentConversationDTO): void;
    renderHeader(): void;
    renderSubtitle(): void;
    renderList(): void;
    syncHeaderExecutionTabStrip(): void;
    scheduleTranscriptConversationRefresh(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        chatHost: HTMLElement,
    ): void;
    refreshTranscriptComposerAgents(project: MobileProjectEntry): Promise<void>;
    mountTranscriptStickyComposer(
        host: HTMLElement,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        chatHost: HTMLElement,
    ): void;
    showOnlyExecutionSurfaceTab(tab: ExecutionSurfaceTabId): void;
    mountTranscriptSurfaceTab(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        tab: ExecutionSurfaceTabId,
    ): void;
    closeExecutionTabOverflowMenu(): void;
    closeParallelSheet(): void;
    closeTranscriptComposerSheets(): void;
    closeAgentsHubSession(): void;
    teardownAgentsHubExecutionShell(): void;
    detachTranscriptReviewWidget(): void;
    disposeTranscriptEmbeddedPreview(): void;
    detachTranscriptWorkspaceSurfacesFromSheet(): void;
    stopTranscriptLiveWatch(): void;
    notifyWorkspaceHubBottomBarRefresh(): void;
    navigateExecutionSurfaceBack(project: MobileProjectEntry): boolean;
}

/** Full-screen transcript sheet overlay: open, dismiss bindings, and teardown. */
export class MobileProjectsTranscriptSheetUi {

    constructor(protected readonly host: MobileProjectsTranscriptSheetHost) { }

    createTranscriptSheetSurfaceHosts(): {
        planHost: HTMLElement;
        reviewHost: HTMLElement;
        previewHost: HTMLElement;
        filesHost: HTMLElement;
        terminalHost: HTMLElement;
    } {
        const planHost = document.createElement('div');
        planHost.className = 'theia-mobile-transcript-plan';
        planHost.hidden = true;
        const reviewHost = document.createElement('div');
        reviewHost.className = 'theia-mobile-transcript-review';
        reviewHost.hidden = true;
        const previewHost = document.createElement('div');
        previewHost.className = 'theia-mobile-transcript-preview';
        previewHost.hidden = true;
        const filesHost = document.createElement('div');
        filesHost.className = 'theia-mobile-transcript-files-host';
        filesHost.hidden = true;
        const terminalHost = document.createElement('div');
        terminalHost.className = 'theia-mobile-transcript-terminal-host';
        terminalHost.hidden = true;
        return { planHost, reviewHost, previewHost, filesHost, terminalHost };
    }

    async openTranscriptSheet(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<void> {
        if (this.host.shouldUseAgentsHubLanding() && !this.host.isProjectDetailView()) {
            await this.host.openAgentsHubInlineTranscript(project, summary);
            return;
        }
        this.host.replacingTranscriptSheet = true;
        this.closeTranscriptSheet();
        this.host.replacingTranscriptSheet = false;
        this.host.onEnterActiveTranscript();
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
        const headerTitle = this.host.resolveTranscriptHeaderTitle(project, summary);
        const { back, tabStrip } = this.host.mountTranscriptExecutionHeader(header, project, summary, headerTitle);

        const chatHost = document.createElement('div');
        chatHost.className = 'theia-mobile-agent-transcript-real-chat';
        chatHost.hidden = false;

        const chatInputHost = document.createElement('div');
        chatInputHost.className = 'theia-mobile-agent-transcript-chat-input';
        chatInputHost.hidden = false;

        const { planHost, reviewHost, previewHost, filesHost, terminalHost } = this.createTranscriptSheetSurfaceHosts();

        sheet.append(header, chatHost, planHost, reviewHost, previewHost, filesHost, terminalHost, chatInputHost);
        root.append(backdrop, sheet);
        document.body.append(root);
        this.host.transcriptSheet = root;
        this.host.transcriptChatHost = chatHost;
        this.host.transcriptChatInputHost = chatInputHost;
        this.host.transcriptTabStrip = tabStrip;
        this.host.transcriptPlanHost = planHost;
        this.host.transcriptReviewHost = reviewHost;
        this.host.transcriptPreviewHost = previewHost;
        this.host.transcriptFilesHost = filesHost;
        this.host.transcriptTerminalHost = terminalHost;
        this.host.transcriptTerminalToolbar = undefined;
        this.host.transcriptTerminalSlider = undefined;
        this.host.transcriptTerminalDots = undefined;
        this.host.verifyResults = [];
        this.host.verifyChecksCwd = undefined;
        this.host.verifyChecksLoading = false;
        this.host.verifyRunning = false;
        this.host.verifyAutoAttempts = 0;
        this.host.transcriptHistoryPanelOpen = false;
        this.host.transcriptHistoryCommits = [];
        this.host.transcriptHistoryBranch = undefined;
        this.host.transcriptHistoryQuery = '';
        this.host.transcriptHistoryRoot = undefined;
        this.host.transcriptHistoryLoading = false;
        this.host.transcriptLastStatus = summary.status;
        this.host.transcriptOpenSummaryId = summary.id;
        this.host.transcriptOpenSummary = summary;
        this.host.transcriptOpenProject = project;
        this.host.transcriptLastFingerprint = undefined;
        if (this.host.visible) {
            this.host.renderHeader();
            this.host.renderSubtitle();
            this.host.renderList();
            this.host.syncHeaderExecutionTabStrip();
        }
        this.bindTranscriptSheetDismiss(back, backdrop);

        this.host.scheduleTranscriptConversationRefresh(project, summary, chatHost);

        this.host.transcriptComposerPrefsConvId = undefined;
        void this.host.refreshTranscriptComposerAgents(project);
        this.host.mountTranscriptStickyComposer(chatInputHost, project, summary, chatHost);
        this.host.showOnlyExecutionSurfaceTab('messages');
        this.host.mountTranscriptSurfaceTab(project, summary, 'messages');
    }

    bindTranscriptSheetDismiss(back: HTMLButtonElement, backdrop: HTMLElement): void {
        const dismiss = (ev?: Event): void => {
            ev?.preventDefault();
            ev?.stopPropagation();
            const project = this.host.transcriptOpenProject;
            if (project && this.host.navigateExecutionSurfaceBack(project)) {
                return;
            }
            this.closeTranscriptSheet();
        };
        // Dismiss on click only — closing on pointerdown removes the overlay before the
        // synthesized click fires, so the tap can land on the workbench back/account controls.
        back.addEventListener('click', dismiss);
        backdrop.addEventListener('click', dismiss);
        const onKeyDown = (ev: KeyboardEvent): void => {
            if (ev.key === 'Escape') {
                dismiss(ev);
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        const previousDispose = this.host.transcriptSheetDispose;
        this.host.transcriptSheetDispose = Disposable.create(() => {
            previousDispose.dispose();
            back.removeEventListener('click', dismiss);
            backdrop.removeEventListener('click', dismiss);
            document.removeEventListener('keydown', onKeyDown, true);
        });
    }

    summaryToTranscriptPlaceholder(summary: QaapAgentConversationSummaryDTO): QaapAgentConversationDTO {
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

    closeTranscriptSheet(): void {
        this.host.closeExecutionTabOverflowMenu();
        this.host.closeParallelSheet();
        this.host.closeTranscriptComposerSheets();
        this.host.transcriptComposerHost = undefined;
        this.host.transcriptComposerMountKey = undefined;
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
        if (this.host.transcriptOpenSummaryId) {
            this.host.transcriptFollowUpQueue.clear(this.host.transcriptOpenSummaryId);
        }
        this.host.transcriptFollowUpFlushInFlight = false;

        const wasAgentsHubInline = this.host.agentsHubInlineActive;
        const preserveAgentsShell = wasAgentsHubInline && this.host.shouldUseAgentsHubLanding();
        if (preserveAgentsShell) {
            this.host.closeAgentsHubSession();
            if (!this.host.transcriptSheet) {
                return;
            }
        } else if (wasAgentsHubInline && !this.host.shouldUseAgentsHubLanding()) {
            this.host.teardownAgentsHubExecutionShell();
        }

        const sheet = this.host.transcriptSheet;
        const sheetWasOnBody = sheet?.parentElement === document.body;
        this.host.transcriptSheet = undefined;
        this.host.transcriptOpenSummaryId = undefined;
        this.host.transcriptOpenSummary = undefined;
        this.host.transcriptOpenProject = undefined;
        this.host.transcriptLastFingerprint = undefined;
        this.host.transcriptLastConv = undefined;
        this.host.transcriptLastSseDeltaAt = undefined;
        this.host.transcriptChatHost = undefined;
        this.host.transcriptChatInputHost = undefined;
        this.host.transcriptTabStrip = undefined;
        this.host.transcriptHeaderSubtitle = undefined;
        this.host.transcriptPlanHost = undefined;
        this.host.detachTranscriptReviewWidget();
        this.host.transcriptReviewHost = undefined;
        this.host.transcriptPreviewHost = undefined;
        this.host.disposeTranscriptEmbeddedPreview();
        this.host.detachTranscriptWorkspaceSurfacesFromSheet();
        this.host.transcriptFilesHost = undefined;
        this.host.transcriptTerminalHost = undefined;
        this.host.transcriptTerminalToolbar = undefined;
        this.host.transcriptTerminalSlider = undefined;
        this.host.transcriptTerminalDots = undefined;
        this.host.transcriptPreviewRequestRunning = false;
        this.host.transcriptPreviewRequestPending = false;
        this.host.verifyResults = [];
        this.host.verifyChecksCwd = undefined;
        this.host.verifyChecksLoading = false;
        this.host.verifyRunning = false;
        this.host.verifyAutoAttempts = 0;
        this.host.transcriptLastStatus = undefined;
        if (this.host.visible) {
            this.host.renderHeader();
            this.host.renderSubtitle();
            this.host.renderList();
        }

        this.host.stopTranscriptLiveWatch();
        this.host.transcriptUserScrollPinDispose.dispose();
        this.host.transcriptUserScrollPinDispose = Disposable.NULL;
        this.host.transcriptUi.disposeList();
        this.host.transcriptSheetDispose.dispose();
        this.host.transcriptSheetDispose = Disposable.NULL;
        this.host.transcriptTheiaSessionByConversationId.clear();

        sheet?.remove();
        if (sheetWasOnBody) {
            if (!this.host.replacingTranscriptSheet) {
                setMobileActiveTranscriptChrome(false);
                this.host.onExitActiveTranscript();
            }
            this.host.notifyWorkspaceHubBottomBarRefresh();
        } else if (wasAgentsHubInline && !this.host.replacingTranscriptSheet) {
            this.host.notifyWorkspaceHubBottomBarRefresh();
        }

        const inputWidget = this.host.transcriptChatInputWidget;
        const viewWidget = this.host.transcriptChatViewWidget;
        this.host.transcriptChatInputWidget = undefined;
        this.host.transcriptChatViewWidget = undefined;
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
}
