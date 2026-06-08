// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Event as TheiaEvent } from '@theia/core/lib/common/event';
import { nls } from '@theia/core/lib/common/nls';
import {
    conversationToSummary,
    getConversation,
    isConversationAutoApproveEnabled,
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
    type QaapAgentMessageDTO,
} from '../common/qaap-agent-conversation-client';
import {
    approveAgentRequest,
    fetchAgentApprovals,
    rejectAgentRequest,
} from '../common/qaap-agent-approval-client';
import { resolveMessagePreviewText } from '../common/qaap-agent-message-content';
import { excerptTranscriptThought } from '../common/qaap-agent-transcript-segments';
import {
    applyConversationMessageDelta,
    canApplySseMessageDelta,
    shouldSkipStreamingTranscriptRefetch,
} from '../common/qaap-transcript-sse-delta';
import { resolveTranscriptInlineApproval } from '../common/qaap-transcript-approval-inline';
import {
    buildConversationTranscriptFingerprint,
    shouldForceTranscriptRenderOnStatusSettle,
} from '../common/qaap-transcript-incremental-update';
import { resolveTranscriptEffectiveStatus, isConversationTurnVisuallySettled } from '../common/qaap-transcript-turn-status';
import {
    QaapTranscriptLiveController,
    type QaapTranscriptLiveRefreshOptions,
} from './qaap-transcript-live-controller';
import { MobileSnackbar } from './mobile-snackbar';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsTranscriptMessagesUi } from './mobile-projects-transcript-messages-ui';

/** Panel surface for SSE live watch, debounced refetch, and inline approval refresh. */
export interface MobileProjectsTranscriptLiveHost {
    transcriptOpenSummaryId: string | undefined;
    transcriptOpenSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptOpenProject: MobileProjectEntry | undefined;
    transcriptLastConv: QaapAgentConversationDTO | undefined;
    transcriptLastFingerprint: string | undefined;
    transcriptLastSseDeltaAt: number | undefined;
    transcriptLastStatus: QaapAgentConversationSummaryDTO['status'] | undefined;
    transcriptScheduleRefresh: (() => void) | undefined;
    transcriptSheet: HTMLElement | undefined;
    agentsHubInlineActive: boolean;
    transcriptChatHost: HTMLElement | undefined;
    agentsHubInlineChatHost: HTMLElement | undefined;
    transcriptComposerSummary: QaapAgentConversationSummaryDTO | undefined;
    transcriptComposerPrefsConvId: string | undefined;
    transcriptComposerSendRefresh: (() => void) | undefined;
    transcriptPreviewRequestPending: boolean;
    transcriptApprovalRefreshTimer: number | undefined;
    cachedAgentApprovals: import('../common/qaap-agent-approval-client').QaapAgentApprovalRequestDTO[];
    projectsService: MobileProjectsService;
    conversations: MobileProjectsConversations | undefined;
    transcriptMessagesUi: MobileProjectsTranscriptMessagesUi;

    conversationsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    findConversationSummaryById(id: string): QaapAgentConversationSummaryDTO | undefined;
    readonly conversationsOnDidChange: TheiaEvent<void>;
    remountTranscriptStickyComposer(): void;
    refreshTranscriptExecutionChrome(): void;
    flushTranscriptFollowUpQueue(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    syncTranscriptPreviewFromConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        conv: QaapAgentConversationDTO,
    ): Promise<void>;
    handleTranscriptStatusForAutoVerify(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        status: QaapAgentConversationSummaryDTO['status'],
    ): void;
    showOnlyExecutionSurfaceTab(tab: import('../common/qaap-execution-surface-tabs').ExecutionSurfaceTabId): void;
    mountTranscriptSurfaceTab(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        tab: import('../common/qaap-execution-surface-tabs').ExecutionSurfaceTabId,
    ): void;
    syncExecutionSurfaceChrome(project: MobileProjectEntry): void;
    executionSurfaceTabForProject(project: MobileProjectEntry): import('../common/qaap-execution-surface-tabs').ExecutionSurfaceTabId;
    applyTranscriptComposerPrefsFromConversation(
        conv: QaapAgentConversationDTO,
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): void;
    isPendingNewChatSummary(summary: QaapAgentConversationSummaryDTO): boolean;
    resolveActiveChatEffectiveStatus(summary?: QaapAgentConversationSummaryDTO): QaapAgentConversationSummaryDTO['status'];
    ensureTranscriptConversationRefresh(): void;
}

/** SSE-first live transcript watch, debounced refetch, and inline approval bar. */
export class MobileProjectsTranscriptLiveUi {

    protected transcriptLiveController: QaapTranscriptLiveController | undefined;
    /** Avoid remounting the sticky composer on every SSE patch once a turn looks visually idle. */
    protected transcriptTurnVisuallySettledActive = false;

    constructor(protected readonly host: MobileProjectsTranscriptLiveHost) { }

    conversationTranscriptFingerprint(conv: QaapAgentConversationDTO): string {
        return buildConversationTranscriptFingerprint(conv);
    }

    handleTranscriptSseMessage(event: {
        readonly conversationId: string;
        readonly message: QaapAgentMessageDTO;
    }): void {
        if (!this.isActiveTranscriptConversation(event.conversationId)) {
            return;
        }
        const base = this.host.transcriptLastConv;
        if (!canApplySseMessageDelta(base, event.conversationId, event.message)) {
            return;
        }
        const next = applyConversationMessageDelta(base, event.message);
        const chatHost = this.resolveActiveTranscriptChatHost();
        if (!chatHost) {
            return;
        }
        this.ensureTranscriptLiveController().markSseDeltaApplied();
        this.host.transcriptMessagesUi.renderTranscriptMessages(chatHost, next);
        this.host.transcriptLastFingerprint = this.conversationTranscriptFingerprint(next);
        if (!isConversationAutoApproveEnabled(conversationToSummary(next))) {
            this.renderTranscriptInlineApproval(chatHost, next);
        }
        if (this.host.transcriptOpenSummary) {
            this.host.transcriptOpenSummary = {
                ...this.host.transcriptOpenSummary,
                status: next.status,
                updatedAt: next.updatedAt,
                lastMessageRole: event.message.role,
                lastMessagePreview: excerptTranscriptThought(
                    resolveMessagePreviewText(event.message),
                    160,
                ),
            };
        }
    }

    /** Header, composer stop/queue controls, and follow-up drain after streaming → idle. */
    syncTranscriptConversationSettledChrome(): void {
        const project = this.host.transcriptOpenProject;
        const summary = this.host.transcriptOpenSummary;
        if (!project || !summary || !this.isActiveTranscriptConversation(summary.id)) {
            return;
        }
        if (this.host.transcriptLastConv?.id === summary.id) {
            const effectiveStatus = resolveTranscriptEffectiveStatus(this.host.transcriptLastConv);
            if (effectiveStatus !== 'streaming') {
                this.host.transcriptOpenSummary = {
                    ...summary,
                    status: effectiveStatus,
                    updatedAt: Math.max(summary.updatedAt, this.host.transcriptLastConv.updatedAt),
                };
            }
        }
        const backendStreaming = this.host.transcriptLastConv?.status === 'streaming';
        const previousStatus = this.host.transcriptLastStatus;
        if (backendStreaming) {
            this.host.transcriptComposerSendRefresh?.();
            this.host.refreshTranscriptExecutionChrome();
        } else if (previousStatus === 'streaming') {
            this.host.remountTranscriptStickyComposer();
            this.host.refreshTranscriptExecutionChrome();
        } else {
            this.host.transcriptComposerSendRefresh?.();
            this.host.refreshTranscriptExecutionChrome();
        }
        if (this.host.transcriptLastConv?.id === summary.id) {
            this.host.transcriptLastStatus = resolveTranscriptEffectiveStatus(this.host.transcriptLastConv);
        }
        const settled = this.host.transcriptOpenSummary;
        if (settled && this.host.resolveActiveChatEffectiveStatus(settled) !== 'streaming') {
            void this.host.flushTranscriptFollowUpQueue(project, settled);
        }
    }

    maybeSyncTranscriptVisuallySettledChrome(conv: QaapAgentConversationDTO): void {
        if (!this.isActiveTranscriptConversation(conv.id)) {
            this.transcriptTurnVisuallySettledActive = false;
            return;
        }
        if (conv.status === 'streaming') {
            if (conv.messages.at(-1)?.role !== 'agent' || !isConversationTurnVisuallySettled(conv)) {
                this.transcriptTurnVisuallySettledActive = false;
                return;
            }
            if (!this.transcriptTurnVisuallySettledActive) {
                this.transcriptTurnVisuallySettledActive = true;
            }
            this.host.transcriptComposerSendRefresh?.();
            this.host.refreshTranscriptExecutionChrome();
            return;
        }
        if (conv.messages.at(-1)?.role !== 'agent' || !isConversationTurnVisuallySettled(conv)) {
            this.transcriptTurnVisuallySettledActive = false;
            return;
        }
        if (this.transcriptTurnVisuallySettledActive) {
            return;
        }
        this.transcriptTurnVisuallySettledActive = true;
        this.syncTranscriptConversationSettledChrome();
    }

    isActiveTranscriptConversation(summaryId: string): boolean {
        return this.host.transcriptOpenSummaryId === summaryId
            && (this.host.transcriptSheet !== undefined || this.host.agentsHubInlineActive);
    }

    resolveActiveTranscriptChatHost(): HTMLElement | undefined {
        const host = this.host.agentsHubInlineChatHost ?? this.host.transcriptChatHost;
        return host?.isConnected ? host : undefined;
    }

    resolveTranscriptRefreshContext(): {
        project: MobileProjectEntry;
        summary: QaapAgentConversationSummaryDTO;
        chatHost: HTMLElement;
    } | undefined {
        const project = this.host.transcriptOpenProject;
        const summaryId = this.host.transcriptOpenSummaryId;
        const chatHost = this.resolveActiveTranscriptChatHost();
        if (!project || !summaryId || !chatHost) {
            return undefined;
        }
        const summary = this.host.conversationsForProject(project).find(c => c.id === summaryId)
            ?? this.host.transcriptOpenSummary;
        if (!summary) {
            return undefined;
        }
        return { project, summary, chatHost };
    }

    stopTranscriptLiveWatch(): void {
        this.transcriptTurnVisuallySettledActive = false;
        this.transcriptLiveController?.stopWatch();
        this.host.transcriptScheduleRefresh = undefined;
        this.stopTranscriptApprovalRefresh();
    }

    stopTranscriptApprovalRefresh(): void {
        if (this.host.transcriptApprovalRefreshTimer !== undefined) {
            window.clearTimeout(this.host.transcriptApprovalRefreshTimer);
            this.host.transcriptApprovalRefreshTimer = undefined;
        }
    }

    scheduleTranscriptApprovalRefresh(): void {
        this.stopTranscriptApprovalRefresh();
        if (!this.host.transcriptOpenSummaryId || !this.host.transcriptOpenSummary
            || isConversationAutoApproveEnabled(this.host.transcriptOpenSummary)) {
            return;
        }
        this.host.transcriptApprovalRefreshTimer = window.setTimeout(() => {
            this.host.transcriptApprovalRefreshTimer = undefined;
            void this.refreshTranscriptApprovals();
        }, 600);
    }

    async refreshTranscriptApprovals(): Promise<void> {
        if (!this.host.transcriptOpenSummaryId) {
            return;
        }
        try {
            this.host.cachedAgentApprovals = await fetchAgentApprovals(this.host.transcriptOpenProject
                ? this.host.projectsService.getProjectCwd(this.host.transcriptOpenProject)
                : this.host.transcriptOpenSummary?.cwd);
            const chatHost = this.resolveActiveTranscriptChatHost();
            if (chatHost && this.host.transcriptLastConv) {
                this.renderTranscriptInlineApproval(chatHost, this.host.transcriptLastConv);
            }
        } catch {
            /* best-effort */
        }
    }

    ensureTranscriptLiveController(): QaapTranscriptLiveController {
        if (!this.transcriptLiveController) {
            this.transcriptLiveController = new QaapTranscriptLiveController({
                isWatching: id => this.isWatchingOpenTranscript(id),
                getOpenSummary: () => this.host.transcriptOpenSummary,
                setOpenSummary: summary => { this.host.transcriptOpenSummary = summary; },
                getLastConv: () => this.host.transcriptLastConv,
                setLastConv: conv => { this.host.transcriptLastConv = conv; },
                getLastSseDeltaAt: () => this.host.transcriptLastSseDeltaAt,
                setLastSseDeltaAt: at => { this.host.transcriptLastSseDeltaAt = at; },
                findSummaryById: id => this.host.conversations?.findSummaryById(id),
                refreshConversation: options => this.refreshOpenTranscriptConversation(options),
                renderConversation: conv => {
                    const chatHost = this.resolveActiveTranscriptChatHost();
                    if (chatHost) {
                        this.host.transcriptMessagesUi.renderTranscriptMessages(chatHost, conv);
                    }
                },
                onApprovalRefresh: () => this.scheduleTranscriptApprovalRefresh(),
                onStatusSettled: () => this.syncTranscriptConversationSettledChrome(),
                conversationsOnDidChange: this.host.conversations?.onDidChange ?? TheiaEvent.None,
            });
        }
        return this.transcriptLiveController;
    }

    renderTranscriptInlineApproval(host: HTMLElement, conv: QaapAgentConversationDTO): void {
        host.querySelector('.theia-mobile-agent-transcript-inline-approval')?.remove();
        if (isConversationAutoApproveEnabled(conversationToSummary(conv))) {
            return;
        }
        const pending = resolveTranscriptInlineApproval(this.host.cachedAgentApprovals, conv.id);
        if (!pending || pending.kind === 'tool') {
            return;
        }
        const bar = document.createElement('div');
        bar.className = 'theia-mobile-agent-transcript-inline-approval';
        const title = document.createElement('div');
        title.className = 'theia-mobile-agent-transcript-inline-approval-title';
        title.textContent = pending.toolName
            ? nls.localize('qaap/mobileProjects/transcriptApprovalTool', 'Approve tool: {0}', pending.toolName)
            : nls.localize('qaap/mobileProjects/transcriptApprovalPending', 'Approval required');
        const summary = document.createElement('p');
        summary.className = 'theia-mobile-agent-transcript-inline-approval-summary';
        summary.textContent = pending.summary;
        const actions = document.createElement('div');
        actions.className = 'theia-mobile-agent-transcript-inline-approval-actions';
        const approve = document.createElement('button');
        approve.type = 'button';
        approve.className = 'theia-mobile-agent-transcript-inline-approval-approve';
        approve.textContent = nls.localize('qaap/mobileProjects/transcriptApprovalAllow', 'Allow');
        approve.addEventListener('click', () => {
            void approveAgentRequest(pending.id).then(() => this.ensureTranscriptConversationRefresh());
        });
        const reject = document.createElement('button');
        reject.type = 'button';
        reject.className = 'theia-mobile-agent-transcript-inline-approval-reject';
        reject.textContent = nls.localize('qaap/mobileProjects/transcriptApprovalDeny', 'Deny');
        reject.addEventListener('click', () => {
            void rejectAgentRequest(pending.id).then(() => this.ensureTranscriptConversationRefresh());
        });
        actions.append(approve, reject);
        bar.append(title, summary, actions);
        host.append(bar);
    }

    ensureTranscriptConversationRefresh(): void {
        const context = this.resolveTranscriptRefreshContext();
        if (!context || !this.isWatchingOpenTranscript(context.summary.id)) {
            return;
        }
        const liveStatus = this.host.transcriptLastConv?.status ?? context.summary.status;
        if (liveStatus !== 'streaming') {
            return;
        }
        if (!this.host.transcriptScheduleRefresh) {
            this.scheduleTranscriptConversationRefresh(context.project, context.summary, context.chatHost);
            return;
        }
        this.host.transcriptScheduleRefresh();
    }

    scheduleTranscriptConversationRefresh(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        _chatHost: HTMLElement,
    ): void {
        this.transcriptTurnVisuallySettledActive = false;
        const controller = this.ensureTranscriptLiveController();
        controller.watch(summary.id);
        this.host.transcriptScheduleRefresh = controller.onScheduleRefresh;
        this.scheduleTranscriptApprovalRefresh();
    }

    async refreshOpenTranscriptConversation(
        options?: QaapTranscriptLiveRefreshOptions,
    ): Promise<void> {
        const context = this.resolveTranscriptRefreshContext();
        if (!context) {
            return;
        }
        const { project: activeProject, summary: activeSummary, chatHost: activeChatHost } = context;
        if (this.host.isPendingNewChatSummary(activeSummary)) {
            return;
        }
        if (!this.isActiveTranscriptConversation(activeSummary.id)) {
            return;
        }
        if (shouldSkipStreamingTranscriptRefetch(this.host.transcriptLastConv, this.host.transcriptLastSseDeltaAt)
            && !options?.forceStatusSettle
            && !options?.forcePoll) {
            return;
        }
        try {
            const full = await getConversation(activeSummary.id);
            if (!this.isActiveTranscriptConversation(activeSummary.id) || !activeChatHost.isConnected) {
                return;
            }
            const fingerprint = this.conversationTranscriptFingerprint(full);
            await this.host.syncTranscriptPreviewFromConversation(activeProject, activeSummary, full);
            const fingerprintUnchanged = fingerprint === this.host.transcriptLastFingerprint;
            const forceStatusSettle = options?.forceStatusSettle
                || shouldForceTranscriptRenderOnStatusSettle(
                    this.host.transcriptLastConv,
                    full,
                    fingerprintUnchanged,
                );
            this.host.transcriptLastConv = full;
            this.host.transcriptOpenSummary = conversationToSummary(full);
            if (this.host.transcriptComposerSummary?.id === full.id
                && this.host.transcriptComposerPrefsConvId !== full.id) {
                this.host.applyTranscriptComposerPrefsFromConversation(full, activeProject, activeSummary);
                this.host.transcriptComposerSendRefresh?.();
            }
            if (fingerprintUnchanged && !forceStatusSettle) {
                if (full.status !== 'streaming' && !this.host.transcriptPreviewRequestPending) {
                    this.host.transcriptLastSseDeltaAt = undefined;
                }
                return;
            }
            this.host.transcriptLastFingerprint = fingerprint;
            this.host.transcriptMessagesUi.renderTranscriptMessages(activeChatHost, full);
            if (this.host.transcriptSheet) {
                const surfaceTab = this.host.executionSurfaceTabForProject(activeProject);
                this.host.showOnlyExecutionSurfaceTab(surfaceTab);
                this.host.mountTranscriptSurfaceTab(activeProject, activeSummary, surfaceTab);
                this.host.syncExecutionSurfaceChrome(activeProject);
            }
            this.host.handleTranscriptStatusForAutoVerify(activeProject, activeSummary, full.status);
            if (full.status !== 'streaming') {
                this.host.transcriptLastSseDeltaAt = undefined;
                this.syncTranscriptConversationSettledChrome();
            } else {
                this.host.transcriptLastStatus = full.status;
            }
            if (full.status === 'streaming') {
                this.scheduleTranscriptApprovalRefresh();
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn('[qaap] transcript refresh failed:', message);
            MobileSnackbar.show(message, { kind: 'warning', duration: 3200 });
        }
    }

    isWatchingOpenTranscript(conversationId: string): boolean {
        return this.host.transcriptOpenSummaryId === conversationId
            && this.isActiveTranscriptConversation(conversationId);
    }
}
