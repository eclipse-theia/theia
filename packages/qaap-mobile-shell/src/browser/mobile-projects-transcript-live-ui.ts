// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Event as TheiaEvent } from '@theia/core/lib/common/event';
import { nls } from '@theia/core/lib/common/nls';
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
import {
    applyConversationMessageDelta,
    canApplySseMessageDelta,
    shouldSkipStreamingTranscriptRefetch,
} from '../common/qaap-transcript-sse-delta';
import { isPendingTranscriptToolSegment, resolveTranscriptInlineApproval } from '../common/qaap-transcript-approval-inline';
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
    transcriptComposerPrefsConvId: string | undefined;
    transcriptComposerSendRefresh: (() => void) | undefined;
    transcriptPreviewRequestPending: boolean;
    transcriptApprovalRefreshTimer: number | undefined;
    cachedAgentApprovals: import('../common/qaap-agent-approval-client').QaapAgentApprovalRequestDTO[];
    projectsService: MobileProjectsService;
    conversations: MobileProjectsConversations | undefined;
    transcriptMessagesUi: MobileProjectsTranscriptMessagesUi;
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

    constructor(protected readonly host: MobileProjectsTranscriptLiveHost) {
        this.ensureBootstrapPreviewListener();
    }

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
        if (conversationUsesInteractiveApprovals(next)) {
            this.renderTranscriptInlineApproval(chatHost, next);
        }
        this.scheduleTranscriptPreviewOfferRefresh(next);
        this.maybeActivateTranscriptDevPreview(next);
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
        if (next.status === 'streaming') {
            this.host.transcriptStickyComposerUi.refreshTranscriptComposerActivityIfNeeded(next);
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
        if (conversationRequestsDevPreview(conv) || conversationAwaitingDevPreview(conv)) {
            this.kickoffTranscriptDevPreviewBootstrap(conv);
        }
        if (conversationShouldWatchDevPreview(conv, window.location.origin) || this.host.transcriptPreviewRequestPending) {
            this.scheduleTranscriptPreviewOfferRefresh(conv);
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
        this.maybeActivateTranscriptDevPreview(conv);
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
                this.host.transcriptMessagesUi.renderTranscriptMessages(chatHost, this.host.transcriptLastConv);
                this.renderTranscriptInlineApproval(chatHost, this.host.transcriptLastConv);
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
        if (!conversationUsesInteractiveApprovals(conv)) {
            return;
        }
        const pending = resolveTranscriptInlineApproval(this.host.cachedAgentApprovals, conv.id);
        if (!pending) {
            return;
        }
        if (pending.kind === 'tool' && pending.toolUseId && this.hasVisiblePendingToolSegment(conv, pending.toolUseId)) {
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

    stopTranscriptPreviewOfferRefresh(): void {
        if (this.transcriptPreviewOfferTimer !== undefined) {
            window.clearTimeout(this.transcriptPreviewOfferTimer);
            this.transcriptPreviewOfferTimer = undefined;
        }
    }

    scheduleTranscriptPreviewOfferRefresh(conv: QaapAgentConversationDTO | undefined = this.host.transcriptLastConv): void {
        this.stopTranscriptPreviewOfferRefresh();
        if (!this.host.transcriptOpenSummaryId || !conv) {
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
        }, 900);
    }

    async refreshTranscriptPreviewOffer(conv: QaapAgentConversationDTO | undefined = this.host.transcriptLastConv): Promise<void> {
        if (!conv || !this.host.transcriptOpenSummaryId) {
            return;
        }
        try {
            this.kickoffTranscriptDevPreviewBootstrap(conv);
            const readyUrl = await this.resolveReadyTranscriptPreviewUrl(conv);
            if (readyUrl) {
                await this.openReadyTranscriptPreviewUrl(readyUrl, conv);
                const project = this.host.transcriptOpenProject;
                if (project && project.previewUrl !== readyUrl) {
                    const updated = { ...project, previewUrl: readyUrl };
                    this.host.transcriptOpenProject = updated;
                    void this.host.projectsService.recordProjectPreviewUrl(updated, readyUrl).catch(() => undefined);
                }
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
                this.host.transcriptStickyComposerUi.applyTranscriptComposerPrefsFromConversation(full, activeProject, activeSummary);
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
