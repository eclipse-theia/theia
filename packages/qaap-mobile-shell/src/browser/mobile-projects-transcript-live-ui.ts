// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Event as TheiaEvent } from '@theia/core/lib/common/event';
import {
    conversationToSummary,
    getConversation,
    type QaapAgentConversationDTO,
    type QaapAgentConversationSummaryDTO,
    type QaapAgentMessageDTO,
} from '../common/qaap-agent-conversation-client';
import { conversationUsesInteractiveApprovals } from '../common/qaap-agent-interactive-approvals';
import {
    approveAgentRequest,
    fetchAgentApprovals,
    rejectAgentRequest,
} from '../common/qaap-agent-approval-client';
import { resolveMessagePreviewText } from '../common/qaap-agent-message-content';
import { excerptTranscriptThought } from '../common/qaap-agent-transcript-segments';
import { applyAgentMessageWireDelta } from '../common/qaap-agent-message-wire-delta';
import type { ConversationLiveMessageEvent } from './mobile-projects-conversations';
import {
    applyConversationMessageDelta,
    canApplySseMessageDelta,
    shouldSkipStreamingTranscriptRefetch,
} from '../common/qaap-transcript-sse-delta';
import { isPendingTranscriptToolSegment, resolveTranscriptInlineApproval } from '../common/qaap-transcript-approval-inline';
import {
    clearTranscriptPendingApprovalBar,
    mountTranscriptPendingApprovalBar,
    removeTranscriptPendingApprovalHosts,
} from './qaap-transcript-inline-approval-ui';
import {
    conversationAwaitingDevPreview,
    conversationMayAutoOpenTranscriptPreview,
    conversationRequestsDevPreview,
    conversationShouldKickoffDevPreviewBootstrap,
    conversationShouldWatchDevPreview,
    messageRequestsDevPreview,
    resolveReadyTranscriptPreviewUrlFromProbe,
} from '../common/qaap-transcript-preview-offer';
import { normalizePreviewUrlForSameOrigin } from '@theia/qaap-adapters/lib/browser/qaap-preview-url-utils';
import { probeQaapDevPreviewPort } from './qaap-dev-preview-client';
import { ensureTranscriptDevPreview } from './qaap-transcript-preview-bootstrap';
import type { QaapProjectBootstrapService } from './qaap-project-bootstrap-service';
import {
    buildConversationTranscriptFingerprint,
    mergeConversationTranscriptFingerprint,
    shouldForceTranscriptRenderOnStatusSettle,
} from '../common/qaap-transcript-incremental-update';
import { isTranscriptDocumentVisible } from '../common/qaap-transcript-document-visibility';
import { scheduleTranscriptIdleWork, type TranscriptIdleWorkHandle } from '../common/qaap-transcript-idle-scheduler';
import { resolveTranscriptStreamingCoalesceDelayMs } from '../common/qaap-transcript-streaming-coalesce';
import { isTranscriptScrollNearBottom } from '../common/qaap-transcript-user-scroll-pin';
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
import type { MobileProjectsTranscriptUi } from './mobile-projects-transcript-ui';
import type { MobileProjectsTranscriptStickyComposerUi } from './mobile-projects-transcript-sticky-composer-ui';
import type { MobileProjectsExecutionSurfaceTabsUi } from './mobile-projects-execution-surface-tabs-ui';
import type { MobileProjectsTranscriptHeaderUi } from './mobile-projects-transcript-header-ui';

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
    transcriptComposerHost: HTMLElement | undefined;
    transcriptComposerPrefsConvId: string | undefined;
    transcriptComposerSendRefresh: (() => void) | undefined;
    transcriptPreviewRequestPending: boolean;
    transcriptApprovalRefreshTimer: number | undefined;
    cachedAgentApprovals: import('../common/qaap-agent-approval-client').QaapAgentApprovalRequestDTO[];
    projectsService: MobileProjectsService;
    conversations: MobileProjectsConversations | undefined;
    transcriptMessagesUi: MobileProjectsTranscriptMessagesUi;
    transcriptUi: MobileProjectsTranscriptUi;
    transcriptStickyComposerUi: MobileProjectsTranscriptStickyComposerUi;
    transcriptHeaderUi: MobileProjectsTranscriptHeaderUi;
    executionSurfaceTabsUi: MobileProjectsExecutionSurfaceTabsUi;

    conversationsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    findConversationSummaryById(id: string): QaapAgentConversationSummaryDTO | undefined;
    readonly conversationsOnDidChange: TheiaEvent<void>;
    syncTranscriptPreviewFromConversation(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        conv: QaapAgentConversationDTO,
    ): Promise<void>;
    beginTranscriptDevPreviewRequest(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void;
    stageTranscriptPreviewReadyUrl(readyUrl: string): void;
    projectBootstrap?: QaapProjectBootstrapService;
    handleTranscriptStatusForAutoVerify(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
        status: QaapAgentConversationSummaryDTO['status'],
    ): void;
    isPendingNewChatSummary(summary: QaapAgentConversationSummaryDTO): boolean;
    ensureTranscriptConversationRefresh(): void;
    conversationIndexUi: import('./mobile-projects-conversation-index-ui').MobileProjectsConversationIndexUi;
    getChatServiceConversation(summary: QaapAgentConversationSummaryDTO): Promise<QaapAgentConversationDTO | undefined>;
}

/** Poll pending VPS tool approvals while an interactive agent turn is streaming. */
const TRANSCRIPT_APPROVAL_REFRESH_MS = 320;
/** Coalesce bursty SSE token deltas into one paint per frame on mobile. */
const TRANSCRIPT_SSE_COALESCE_RAF = true;
/** Debounce composer activity stack scans while the agent is still streaming. */
const TRANSCRIPT_COMPOSER_ACTIVITY_DEBOUNCE_MS = 450;
const TRANSCRIPT_PREVIEW_POLL_BASE_MS = 900;
const TRANSCRIPT_PREVIEW_POLL_MAX_MS = 5_000;

/** SSE-first live transcript watch, debounced refetch, and inline approval bar. */
export class MobileProjectsTranscriptLiveUi {

    protected transcriptLiveController: QaapTranscriptLiveController | undefined;
    /** Avoid remounting the sticky composer on every SSE patch once a turn looks visually idle. */
    protected transcriptTurnVisuallySettledActive = false;
    protected transcriptPreviewOfferTimer: number | undefined;
    protected transcriptPreviewOfferAnnouncedUrl: string | undefined;
    protected transcriptPreviewSettlePollUntil: number | undefined;
    protected transcriptDevPreviewBootstrapConversationId: string | undefined;
    protected bootstrapPreviewListenerInitialized = false;
    protected pendingSseRenderConv: QaapAgentConversationDTO | undefined;
    protected sseRenderRafId = 0;
    protected sseRenderTimer: number | undefined;
    protected lastMountedApprovalId: string | undefined;
    protected transcriptComposerActivityTimer: number | undefined;
    protected transcriptComposerActivityIdleHandle: TranscriptIdleWorkHandle | undefined;
    protected transcriptPreviewPollIntervalMs = TRANSCRIPT_PREVIEW_POLL_BASE_MS;
    protected transcriptPreviewPollMisses = 0;
    protected visibilityResumeListenerInstalled = false;

    constructor(protected readonly host: MobileProjectsTranscriptLiveHost) {
        this.ensureBootstrapPreviewListener();
        this.ensureVisibilityResumeListener();
    }

    protected ensureVisibilityResumeListener(): void {
        if (this.visibilityResumeListenerInstalled || typeof document === 'undefined') {
            return;
        }
        this.visibilityResumeListenerInstalled = true;
        document.addEventListener('visibilitychange', () => {
            if (!isTranscriptDocumentVisible()) {
                this.pauseTranscriptBackgroundRenders();
                return;
            }
            const conv = this.host.transcriptLastConv;
            if (!conv || !this.isActiveTranscriptConversation(conv.id)) {
                return;
            }
            if (conv.status === 'streaming') {
                this.scheduleTranscriptComposerActivityRefresh(conv);
                this.scheduleTranscriptPreviewOfferRefresh(conv, { restart: true });
                if (this.pendingSseRenderConv) {
                    this.schedulePendingSseRender();
                }
            }
        });
    }

    conversationTranscriptFingerprint(conv: QaapAgentConversationDTO): string {
        return buildConversationTranscriptFingerprint(conv);
    }

    handleTranscriptSseMessage(event: ConversationLiveMessageEvent): void {
        if (!this.isActiveTranscriptConversation(event.conversationId)) {
            return;
        }
        const message = this.resolveLiveSseMessage(event);
        if (!message) {
            return;
        }
        const base = this.host.transcriptLastConv;
        if (!canApplySseMessageDelta(base, event.conversationId, message)) {
            return;
        }
        const next = applyConversationMessageDelta(base, message);
        if (next === base) {
            return;
        }
        this.ensureTranscriptLiveController().markSseDeltaApplied();
        if (TRANSCRIPT_SSE_COALESCE_RAF) {
            this.pendingSseRenderConv = next;
            this.schedulePendingSseRender();
            return;
        }
        this.applyTranscriptSseRender(next, message);
    }

    protected resolveLiveSseMessage(event: ConversationLiveMessageEvent): QaapAgentMessageDTO | undefined {
        if (event.type === 'message') {
            return event.message;
        }
        const base = this.host.transcriptLastConv;
        if (!base) {
            return undefined;
        }
        if (event.delta.kind === 'message_start' || event.delta.kind === 'replace') {
            return event.delta.message;
        }
        const patched = applyAgentMessageWireDelta(base, event.delta);
        return patched;
    }

    protected pauseTranscriptBackgroundRenders(): void {
        if (this.sseRenderRafId) {
            cancelAnimationFrame(this.sseRenderRafId);
            this.sseRenderRafId = 0;
        }
        if (this.sseRenderTimer !== undefined) {
            window.clearTimeout(this.sseRenderTimer);
            this.sseRenderTimer = undefined;
        }
        this.transcriptComposerActivityIdleHandle?.cancel();
        this.transcriptComposerActivityIdleHandle = undefined;
    }

    protected schedulePendingSseRender(): void {
        if (!isTranscriptDocumentVisible()) {
            return;
        }
        const nearBottom = this.isActiveTranscriptNearBottom();
        const delayMs = resolveTranscriptStreamingCoalesceDelayMs(nearBottom);
        if (delayMs === 0) {
            if (this.sseRenderTimer !== undefined) {
                window.clearTimeout(this.sseRenderTimer);
                this.sseRenderTimer = undefined;
            }
            if (!this.sseRenderRafId) {
                this.sseRenderRafId = requestAnimationFrame(() => this.flushPendingSseRender());
            }
            return;
        }
        if (this.sseRenderRafId) {
            cancelAnimationFrame(this.sseRenderRafId);
            this.sseRenderRafId = 0;
        }
        if (this.sseRenderTimer === undefined) {
            this.sseRenderTimer = window.setTimeout(() => {
                this.sseRenderTimer = undefined;
                this.flushPendingSseRender();
            }, delayMs);
        }
    }

    protected isActiveTranscriptNearBottom(): boolean {
        const chatHost = this.resolveActiveTranscriptChatHost();
        if (!chatHost) {
            return true;
        }
        const list = this.host.transcriptUi.activeList;
        if (list?.active) {
            return list.isNearBottom();
        }
        const messageHost = this.host.transcriptMessagesUi.resolveTranscriptMessageHost(chatHost);
        return isTranscriptScrollNearBottom(
            messageHost.scrollTop,
            messageHost.clientHeight,
            messageHost.scrollHeight,
        );
    }

    protected flushPendingSseRender(): void {
        this.sseRenderRafId = 0;
        if (this.sseRenderTimer !== undefined) {
            window.clearTimeout(this.sseRenderTimer);
            this.sseRenderTimer = undefined;
        }
        if (!isTranscriptDocumentVisible()) {
            return;
        }
        const next = this.pendingSseRenderConv;
        if (!next) {
            return;
        }
        this.pendingSseRenderConv = undefined;
        const lastMessage = next.messages.at(-1);
        if (!lastMessage) {
            return;
        }
        this.applyTranscriptSseRender(next, lastMessage);
    }

    protected applyTranscriptSseRender(
        next: QaapAgentConversationDTO,
        eventMessage: QaapAgentMessageDTO,
    ): void {
        const chatHost = this.resolveActiveTranscriptChatHost();
        if (!chatHost) {
            return;
        }
        const prevConv = this.host.transcriptLastConv;
        this.host.transcriptMessagesUi.renderTranscriptMessages(chatHost, next);
        this.host.transcriptLastConv = next;
        this.host.transcriptLastFingerprint = mergeConversationTranscriptFingerprint(prevConv, next);
        if (conversationUsesInteractiveApprovals(next) && this.host.transcriptApprovalRefreshTimer === undefined) {
            this.syncTranscriptPendingApproval(next);
        }
        this.ensureTranscriptDevPreviewWatch(next);
        this.maybeSyncTranscriptVisuallySettledChrome(next);
        if (this.host.transcriptOpenSummary) {
            this.host.transcriptOpenSummary = {
                ...this.host.transcriptOpenSummary,
                status: next.status,
                updatedAt: next.updatedAt,
                lastMessageRole: eventMessage.role,
                lastMessagePreview: excerptTranscriptThought(
                    resolveMessagePreviewText(eventMessage),
                    160,
                ),
            };
        }
        if (next.status === 'streaming') {
            this.scheduleTranscriptComposerActivityRefresh(next);
        }
    }

    protected scheduleTranscriptComposerActivityRefresh(conv: QaapAgentConversationDTO): void {
        if (!isTranscriptDocumentVisible()) {
            return;
        }
        if (this.transcriptComposerActivityTimer !== undefined) {
            return;
        }
        this.transcriptComposerActivityTimer = window.setTimeout(() => {
            this.transcriptComposerActivityTimer = undefined;
            if (!isTranscriptDocumentVisible()) {
                return;
            }
            this.transcriptComposerActivityIdleHandle?.cancel();
            this.transcriptComposerActivityIdleHandle = scheduleTranscriptIdleWork(() => {
                this.transcriptComposerActivityIdleHandle = undefined;
                const latest = this.host.transcriptLastConv;
                if (latest?.id === conv.id) {
                    this.host.transcriptStickyComposerUi.refreshTranscriptComposerActivityIfNeeded(latest);
                }
            }, { when: isTranscriptDocumentVisible });
        }, TRANSCRIPT_COMPOSER_ACTIVITY_DEBOUNCE_MS);
    }

    stopTranscriptComposerActivityRefresh(): void {
        if (this.transcriptComposerActivityTimer !== undefined) {
            window.clearTimeout(this.transcriptComposerActivityTimer);
            this.transcriptComposerActivityTimer = undefined;
        }
        this.transcriptComposerActivityIdleHandle?.cancel();
        this.transcriptComposerActivityIdleHandle = undefined;
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
            this.host.transcriptHeaderUi.refreshTranscriptExecutionChrome();
        } else if (previousStatus === 'streaming') {
            this.host.transcriptStickyComposerUi.remountTranscriptStickyComposer();
            this.host.transcriptHeaderUi.refreshTranscriptExecutionChrome();
        } else {
            this.host.transcriptComposerSendRefresh?.();
            this.host.transcriptHeaderUi.refreshTranscriptExecutionChrome();
        }
        if (this.host.transcriptLastConv?.id === summary.id) {
            this.host.transcriptLastStatus = resolveTranscriptEffectiveStatus(this.host.transcriptLastConv);
        }
        const settled = this.host.transcriptOpenSummary;
        if (settled && this.host.transcriptHeaderUi.resolveActiveChatEffectiveStatus(settled) !== 'streaming') {
            void this.host.transcriptStickyComposerUi.flushTranscriptFollowUpQueue(project, settled);
        }
        void this.finalizeTranscriptDevPreviewAfterSettle();
    }

    ensureBootstrapPreviewListener(): void {
        if (this.bootstrapPreviewListenerInitialized || !this.host.projectBootstrap) {
            return;
        }
        this.bootstrapPreviewListenerInitialized = true;
        this.host.projectBootstrap.onStateChange(state => {
            const conv = this.host.transcriptLastConv;
            if (!conv || !this.host.transcriptOpenSummaryId || this.host.transcriptOpenSummaryId !== conv.id) {
                return;
            }
            if (!conversationShouldWatchDevPreview(conv, window.location.origin)) {
                return;
            }
            if (state.previewUrl && state.phase === 'running') {
                void this.openReadyTranscriptPreviewUrl(state.previewUrl, conv);
            }
        });
    }

    kickoffTranscriptDevPreviewBootstrap(conv: QaapAgentConversationDTO | undefined = this.host.transcriptLastConv): void {
        const bootstrap = this.host.projectBootstrap;
        if (!bootstrap || !conv || !conversationRequestsDevPreview(conv)
            || !conversationShouldKickoffDevPreviewBootstrap(conv)) {
            return;
        }
        if (this.transcriptDevPreviewBootstrapConversationId === conv.id) {
            return;
        }
        this.transcriptDevPreviewBootstrapConversationId = conv.id;
        void ensureTranscriptDevPreview(bootstrap).then(readyUrl => {
            if (!readyUrl || this.host.transcriptOpenSummaryId !== conv.id) {
                return;
            }
            void this.openReadyTranscriptPreviewUrl(readyUrl, conv);
        }).catch(() => undefined);
    }

    protected async openReadyTranscriptPreviewUrl(
        readyUrl: string,
        conv: QaapAgentConversationDTO | undefined = this.host.transcriptLastConv,
    ): Promise<void> {
        const normalized = normalizePreviewUrlForSameOrigin(readyUrl);
        if (this.transcriptPreviewOfferAnnouncedUrl === normalized) {
            return;
        }
        if (!conversationMayAutoOpenTranscriptPreview(conv)) {
            this.host.stageTranscriptPreviewReadyUrl(normalized);
            return;
        }
        const opened = await this.host.transcriptMessagesUi.openTranscriptPreviewUrlFromLink(normalized);
        if (opened) {
            this.transcriptPreviewOfferAnnouncedUrl = normalized;
        }
    }

    async finalizeTranscriptDevPreviewAfterSettle(): Promise<void> {
        const conv = this.host.transcriptLastConv;
        if (!conv || !conversationShouldWatchDevPreview(conv, window.location.origin)) {
            return;
        }
        this.transcriptPreviewSettlePollUntil = Date.now() + 45_000;
        this.kickoffTranscriptDevPreviewBootstrap(conv);
        await this.refreshTranscriptPreviewOffer(conv);
    }

    protected maybeActivateTranscriptDevPreview(conv: QaapAgentConversationDTO | undefined = this.host.transcriptLastConv): void {
        if (!conv) {
            return;
        }
        this.ensureTranscriptDevPreviewWatch(conv);
    }

    /** Start preview bootstrap/poll once — do not reset the poll timer on every SSE token. */
    protected ensureTranscriptDevPreviewWatch(
        conv: QaapAgentConversationDTO,
        options?: { readonly restartPreviewPoll?: boolean },
    ): void {
        if (conversationRequestsDevPreview(conv) || conversationAwaitingDevPreview(conv)) {
            this.kickoffTranscriptDevPreviewBootstrap(conv);
        }
        if (conversationShouldWatchDevPreview(conv, window.location.origin) || this.host.transcriptPreviewRequestPending) {
            this.scheduleTranscriptPreviewOfferRefresh(conv, { restart: options?.restartPreviewPoll });
        }
    }

    onTranscriptUserMessageSubmitted(content: string, conv: QaapAgentConversationDTO): void {
        this.transcriptPreviewSettlePollUntil = Date.now() + 120_000;
        this.transcriptDevPreviewBootstrapConversationId = undefined;
        this.transcriptPreviewOfferAnnouncedUrl = undefined;
        const project = this.host.transcriptOpenProject;
        const summary = this.host.transcriptOpenSummary;
        if (messageRequestsDevPreview(content) && project && summary) {
            this.host.transcriptPreviewRequestPending = true;
            this.host.beginTranscriptDevPreviewRequest(project, summary);
        }
        this.ensureTranscriptDevPreviewWatch(conv, { restartPreviewPoll: true });
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
            const becameVisuallySettled = !this.transcriptTurnVisuallySettledActive;
            if (becameVisuallySettled) {
                this.transcriptTurnVisuallySettledActive = true;
                const chatHost = this.resolveActiveTranscriptChatHost();
                if (chatHost) {
                    const messageHost = this.host.transcriptMessagesUi.resolveTranscriptMessageHost(chatHost);
                    this.host.transcriptMessagesUi.settleVisuallySettledAgentTranscript(messageHost, conv);
                }
            }
            this.host.transcriptComposerSendRefresh?.();
            this.host.transcriptHeaderUi.refreshTranscriptExecutionChrome();
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
        const summary = this.host.conversationIndexUi.conversationsForProject(project).find(c => c.id === summaryId)
            ?? this.host.transcriptOpenSummary;
        if (!summary) {
            return undefined;
        }
        return { project, summary, chatHost };
    }

    stopTranscriptLiveWatch(): void {
        this.transcriptTurnVisuallySettledActive = false;
        if (this.sseRenderRafId) {
            cancelAnimationFrame(this.sseRenderRafId);
            this.sseRenderRafId = 0;
        }
        if (this.sseRenderTimer !== undefined) {
            window.clearTimeout(this.sseRenderTimer);
            this.sseRenderTimer = undefined;
        }
        this.pendingSseRenderConv = undefined;
        this.lastMountedApprovalId = undefined;
        this.transcriptPreviewPollIntervalMs = TRANSCRIPT_PREVIEW_POLL_BASE_MS;
        this.transcriptPreviewPollMisses = 0;
        this.stopTranscriptComposerActivityRefresh();
        this.transcriptLiveController?.stopWatch();
        this.host.transcriptScheduleRefresh = undefined;
        this.stopTranscriptApprovalRefresh();
        this.stopTranscriptPreviewOfferRefresh();
    }

    stopTranscriptApprovalRefresh(): void {
        if (this.host.transcriptApprovalRefreshTimer !== undefined) {
            window.clearTimeout(this.host.transcriptApprovalRefreshTimer);
            this.host.transcriptApprovalRefreshTimer = undefined;
        }
    }

    scheduleTranscriptApprovalRefresh(): void {
        this.stopTranscriptApprovalRefresh();
        if (!this.host.transcriptOpenSummaryId || !this.host.transcriptLastConv
            || !conversationUsesInteractiveApprovals(this.host.transcriptLastConv)) {
            return;
        }
        this.host.transcriptApprovalRefreshTimer = window.setTimeout(() => {
            this.host.transcriptApprovalRefreshTimer = undefined;
            void this.refreshTranscriptApprovals();
        }, TRANSCRIPT_APPROVAL_REFRESH_MS);
    }

    async refreshTranscriptApprovals(): Promise<void> {
        if (!this.host.transcriptOpenSummaryId) {
            return;
        }
        try {
            this.host.cachedAgentApprovals = await fetchAgentApprovals(this.host.transcriptOpenProject
                ? this.host.projectsService.getProjectCwd(this.host.transcriptOpenProject)
                : this.host.transcriptOpenSummary?.cwd);
            if (this.host.transcriptLastConv) {
                this.syncTranscriptPendingApproval(this.host.transcriptLastConv);
            }
        } catch {
            /* best-effort */
        } finally {
            if (this.host.transcriptLastConv?.status === 'streaming'
                && conversationUsesInteractiveApprovals(this.host.transcriptLastConv)) {
                this.scheduleTranscriptApprovalRefresh();
            }
        }
    }

    ensureTranscriptLiveController(): QaapTranscriptLiveController {
        if (!this.transcriptLiveController) {
            this.transcriptLiveController = new QaapTranscriptLiveController({
                isDocumentVisible: () => isTranscriptDocumentVisible(),
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
        removeTranscriptPendingApprovalHosts(host);
        this.syncTranscriptPendingApproval(conv);
    }

    syncTranscriptPendingApproval(conv: QaapAgentConversationDTO): void {
        const chatHost = this.resolveActiveTranscriptChatHost();
        if (chatHost) {
            removeTranscriptPendingApprovalHosts(chatHost);
        }
        if (!conversationUsesInteractiveApprovals(conv)) {
            if (this.lastMountedApprovalId !== undefined) {
                clearTranscriptPendingApprovalBar(this.host.transcriptComposerHost);
                this.lastMountedApprovalId = undefined;
            }
            return;
        }
        const pending = resolveTranscriptInlineApproval(this.host.cachedAgentApprovals, conv.id);
        const showPending = !!pending
            && !(pending.kind === 'tool'
                && pending.toolUseId
                && this.hasVisiblePendingToolSegment(conv, pending.toolUseId));
        const pendingId = showPending ? pending!.id : undefined;
        if (pendingId === this.lastMountedApprovalId) {
            return;
        }
        this.lastMountedApprovalId = pendingId;
        mountTranscriptPendingApprovalBar(
            this.host.transcriptComposerHost,
            showPending ? pending : undefined,
            {
                onApprove: () => {
                    if (!pending) {
                        return;
                    }
                    void approveAgentRequest(pending.id).then(() => {
                        this.stopTranscriptApprovalRefresh();
                        void this.refreshTranscriptApprovals();
                        this.ensureTranscriptConversationRefresh();
                    });
                },
                onReject: () => {
                    if (!pending) {
                        return;
                    }
                    void rejectAgentRequest(pending.id).then(() => {
                        this.stopTranscriptApprovalRefresh();
                        void this.refreshTranscriptApprovals();
                        this.ensureTranscriptConversationRefresh();
                    });
                },
            },
        );
    }

    stopTranscriptPreviewOfferRefresh(): void {
        if (this.transcriptPreviewOfferTimer !== undefined) {
            window.clearTimeout(this.transcriptPreviewOfferTimer);
            this.transcriptPreviewOfferTimer = undefined;
        }
    }

    protected resolveTranscriptPreviewPollIntervalMs(): number {
        return Math.min(
            TRANSCRIPT_PREVIEW_POLL_MAX_MS,
            TRANSCRIPT_PREVIEW_POLL_BASE_MS + this.transcriptPreviewPollMisses * 400,
        );
    }

    scheduleTranscriptPreviewOfferRefresh(
        conv: QaapAgentConversationDTO | undefined = this.host.transcriptLastConv,
        options?: { readonly restart?: boolean },
    ): void {
        if (!options?.restart && this.transcriptPreviewOfferTimer !== undefined) {
            return;
        }
        this.stopTranscriptPreviewOfferRefresh();
        if (!this.host.transcriptOpenSummaryId || !conv || !isTranscriptDocumentVisible()) {
            return;
        }
        const shouldWatch = conversationShouldWatchDevPreview(conv, window.location.origin)
            || this.host.transcriptPreviewRequestPending;
        const settlePollActive = conv.status !== 'streaming'
            && shouldWatch
            && (this.transcriptPreviewSettlePollUntil ?? 0) > Date.now();
        if (conv.status !== 'streaming' && !settlePollActive) {
            return;
        }
        if (!shouldWatch) {
            return;
        }
        this.transcriptPreviewOfferTimer = window.setTimeout(() => {
            this.transcriptPreviewOfferTimer = undefined;
            void this.refreshTranscriptPreviewOffer(conv);
        }, this.transcriptPreviewPollIntervalMs);
    }

    async refreshTranscriptPreviewOffer(conv: QaapAgentConversationDTO | undefined = this.host.transcriptLastConv): Promise<void> {
        if (!conv || !this.host.transcriptOpenSummaryId || !isTranscriptDocumentVisible()) {
            return;
        }
        try {
            this.kickoffTranscriptDevPreviewBootstrap(conv);
            const readyUrl = await this.resolveReadyTranscriptPreviewUrl(conv);
            if (readyUrl) {
                this.transcriptPreviewPollMisses = 0;
                this.transcriptPreviewPollIntervalMs = TRANSCRIPT_PREVIEW_POLL_BASE_MS;
                await this.openReadyTranscriptPreviewUrl(readyUrl, conv);
                const project = this.host.transcriptOpenProject;
                if (project && project.previewUrl !== readyUrl) {
                    const updated = { ...project, previewUrl: readyUrl };
                    this.host.transcriptOpenProject = updated;
                    void this.host.projectsService.recordProjectPreviewUrl(updated, readyUrl).catch(() => undefined);
                }
            } else {
                this.transcriptPreviewPollMisses += 1;
                this.transcriptPreviewPollIntervalMs = this.resolveTranscriptPreviewPollIntervalMs();
            }
        } catch {
            /* best-effort */
        } finally {
            const shouldWatch = conversationShouldWatchDevPreview(conv, window.location.origin)
                || this.host.transcriptPreviewRequestPending;
            const keepPolling = conv.status === 'streaming'
                ? shouldWatch
                : shouldWatch && (this.transcriptPreviewSettlePollUntil ?? 0) > Date.now();
            if (keepPolling) {
                this.scheduleTranscriptPreviewOfferRefresh(conv);
            }
        }
    }

    protected async resolveReadyTranscriptPreviewUrl(conv: QaapAgentConversationDTO): Promise<string | undefined> {
        const readyUrl = await resolveReadyTranscriptPreviewUrlFromProbe(
            conv,
            port => probeQaapDevPreviewPort(port),
            window.location.origin,
        );
        return readyUrl ? normalizePreviewUrlForSameOrigin(readyUrl) : undefined;
    }

    renderTranscriptInlinePreviewOffer(_host: HTMLElement, _previewUrl: string): void {
        /* Preview opens in the Preview tab via refreshTranscriptPreviewOffer. */
    }

    protected hasVisiblePendingToolSegment(conv: QaapAgentConversationDTO, toolUseId: string): boolean {
        const agentMessage = [...conv.messages].reverse().find(message => message.role === 'agent');
        return !!agentMessage?.segments?.some(segment =>
            segment.type === 'tool'
            && segment.toolUseId === toolUseId
            && isPendingTranscriptToolSegment(segment),
        );
    }

    ensureTranscriptConversationRefresh(): void {
        const context = this.resolveTranscriptRefreshContext();
        if (!context || !this.isWatchingOpenTranscript(context.summary.id)) {
            return;
        }
        if (!this.host.transcriptScheduleRefresh) {
            this.scheduleTranscriptConversationRefresh(context.project, context.summary, context.chatHost);
            return;
        }
        const liveStatus = this.host.transcriptLastConv?.status ?? context.summary.status;
        if (liveStatus !== 'streaming') {
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

    async resolveOpenTranscriptConversation(
        summary: QaapAgentConversationSummaryDTO,
    ): Promise<QaapAgentConversationDTO | undefined> {
        if (summary.source === 'theia-chat' || summary.id.startsWith('theia-chat-service:')) {
            return this.host.getChatServiceConversation(summary);
        }
        try {
            return await getConversation(summary.id);
        } catch {
            if (summary.sessionId) {
                return this.host.getChatServiceConversation(summary);
            }
            return undefined;
        }
    }

    async refreshOpenTranscriptConversation(
        options?: QaapTranscriptLiveRefreshOptions,
    ): Promise<void> {
        const context = this.resolveTranscriptRefreshContext();
        if (!context) {
            return;
        }
        const { project: activeProject, summary: activeSummary, chatHost: activeChatHost } = context;
        if (this.host.transcriptHeaderUi.isPendingNewChatSummary(activeSummary)) {
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
            const full = await this.resolveOpenTranscriptConversation(activeSummary);
            if (!full) {
                throw new Error('Conversation not found');
            }
            if (!this.isActiveTranscriptConversation(activeSummary.id) || !activeChatHost.isConnected) {
                return;
            }
            const fingerprint = this.conversationTranscriptFingerprint(full);
            const fingerprintUnchanged = fingerprint === this.host.transcriptLastFingerprint;
            const forceStatusSettle = options?.forceStatusSettle
                || shouldForceTranscriptRenderOnStatusSettle(
                    this.host.transcriptLastConv,
                    full,
                    fingerprintUnchanged,
                );
            if (!fingerprintUnchanged || forceStatusSettle) {
                await this.host.syncTranscriptPreviewFromConversation(activeProject, activeSummary, full);
            }
            this.host.transcriptLastConv = full;
            this.host.transcriptOpenSummary = conversationToSummary(full);
            if (this.host.transcriptComposerSummary?.id === full.id
                && this.host.transcriptComposerPrefsConvId !== full.id) {
                this.host.transcriptStickyComposerUi.applyTranscriptComposerPrefsFromConversation(full, activeProject, activeSummary);
                this.host.transcriptComposerSendRefresh?.();
            }
            if (fingerprintUnchanged && !forceStatusSettle) {
                if (conversationUsesInteractiveApprovals(full)) {
                    this.syncTranscriptPendingApproval(full);
                }
                if (full.status !== 'streaming' && !this.host.transcriptPreviewRequestPending) {
                    this.host.transcriptLastSseDeltaAt = undefined;
                }
                return;
            }
            this.host.transcriptLastFingerprint = fingerprint;
            this.host.transcriptMessagesUi.renderTranscriptMessages(activeChatHost, full);
            if (conversationUsesInteractiveApprovals(full)) {
                this.syncTranscriptPendingApproval(full);
            }
            if (this.host.transcriptComposerSummary?.id === full.id) {
                this.host.transcriptStickyComposerUi.refreshTranscriptComposerActivityIfNeeded(full);
            }
            if (this.host.transcriptSheet) {
                const surfaceTab = this.host.executionSurfaceTabsUi.executionSurfaceTabForProject(activeProject);
                this.host.executionSurfaceTabsUi.showOnlyExecutionSurfaceTab(surfaceTab);
                this.host.executionSurfaceTabsUi.mountTranscriptSurfaceTab(activeProject, activeSummary, surfaceTab);
                this.host.executionSurfaceTabsUi.syncExecutionSurfaceChrome(activeProject);
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
                this.maybeActivateTranscriptDevPreview(full);
            } else if (conversationShouldWatchDevPreview(full, window.location.origin)) {
                void this.finalizeTranscriptDevPreviewAfterSettle();
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
