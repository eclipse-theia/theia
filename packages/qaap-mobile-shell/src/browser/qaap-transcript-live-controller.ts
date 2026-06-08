// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';
import { Event } from '@theia/core/lib/common/event';
import type { QaapAgentConversationDTO, QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import {
    applyConversationSummaryDelta,
    shouldSkipStreamingTranscriptRefetch,
} from '../common/qaap-transcript-sse-delta';
import { buildConversationTranscriptFingerprint } from '../common/qaap-transcript-incremental-update';

export interface QaapTranscriptLiveRefreshOptions {
    readonly forceStatusSettle?: boolean;
}

export interface QaapTranscriptLiveControllerDeps {
    readonly isWatching: (conversationId: string) => boolean;
    readonly getOpenSummary: () => QaapAgentConversationSummaryDTO | undefined;
    readonly setOpenSummary: (summary: QaapAgentConversationSummaryDTO) => void;
    readonly getLastConv: () => QaapAgentConversationDTO | undefined;
    readonly setLastConv: (conv: QaapAgentConversationDTO | undefined) => void;
    readonly getLastSseDeltaAt: () => number | undefined;
    readonly setLastSseDeltaAt: (at: number | undefined) => void;
    readonly findSummaryById: (conversationId: string) => QaapAgentConversationSummaryDTO | undefined;
    readonly refreshConversation: (options?: QaapTranscriptLiveRefreshOptions) => Promise<void>;
    readonly renderConversation: (conv: QaapAgentConversationDTO) => void;
    readonly onApprovalRefresh: () => void;
    readonly onStatusSettled?: () => void;
    readonly conversationsOnDidChange: Event<void>;
}

const REFRESH_DEBOUNCE_MS = 450;

/**
 * SSE-first live transcript coordinator — no interval polling. Message chunks are merged in the
 * panel via {@link applyConversationMessageDelta}; this class debounces refetches and applies
 * lightweight summary updates from SSE `updated` events.
 */
export class QaapTranscriptLiveController implements Disposable {

    protected refreshTimer: number | undefined;
    protected refreshInFlight = false;
    protected pendingForceSettle = false;
    protected scheduleRefresh: (() => void) | undefined;
    protected watchedConversationId: string | undefined;
    protected liveUpdatesDispose: Disposable = Disposable.NULL;

    constructor(protected readonly deps: QaapTranscriptLiveControllerDeps) { }

    get onScheduleRefresh(): (() => void) | undefined {
        return this.scheduleRefresh;
    }

    watch(conversationId: string): void {
        this.watchedConversationId = conversationId;
        this.clearRefreshTimer();
        const scheduleRefresh = (): void => {
            if (!this.deps.isWatching(conversationId)) {
                return;
            }
            this.clearRefreshTimer();
            this.refreshTimer = window.setTimeout(() => {
                this.refreshTimer = undefined;
                void this.refreshNow();
            }, REFRESH_DEBOUNCE_MS);
        };
        this.scheduleRefresh = scheduleRefresh;
        this.liveUpdatesDispose.dispose();
        this.liveUpdatesDispose = this.deps.conversationsOnDidChange(() => {
            if (!this.deps.isWatching(conversationId)) {
                this.stopWatch();
                return;
            }
            const summary = this.deps.findSummaryById(conversationId);
            if (summary) {
                this.handleSummaryUpdated(summary);
            }
            const last = this.deps.getLastConv();
            if (last?.status === 'streaming') {
                scheduleRefresh();
            }
        });
        void this.refreshNow();
    }

    stopWatch(): void {
        this.watchedConversationId = undefined;
        this.scheduleRefresh = undefined;
        this.clearRefreshTimer();
        this.liveUpdatesDispose.dispose();
        this.liveUpdatesDispose = Disposable.NULL;
    }

    dispose(): void {
        this.stopWatch();
    }

    markSseDeltaApplied(): void {
        this.deps.setLastSseDeltaAt(Date.now());
    }

    handleSummaryUpdated(summary: QaapAgentConversationSummaryDTO): void {
        if (!this.deps.isWatching(summary.id)) {
            return;
        }
        const last = this.deps.getLastConv();
        if (!last || last.id !== summary.id) {
            return;
        }
        const wasStreaming = last.status === 'streaming';
        const next = applyConversationSummaryDelta(last, summary);
        this.deps.setLastConv(next);
        this.deps.setOpenSummary(summary);
        if (wasStreaming && next.status !== 'streaming') {
            this.deps.setLastSseDeltaAt(undefined);
            this.deps.onApprovalRefresh();
            this.deps.onStatusSettled?.();
            void this.refreshNow({ forceStatusSettle: true });
            return;
        }
        if (next.status === 'streaming' && shouldSkipStreamingTranscriptRefetch(next, this.deps.getLastSseDeltaAt())) {
            const previousFingerprint = buildConversationTranscriptFingerprint(last);
            const nextFingerprint = buildConversationTranscriptFingerprint(next);
            if (previousFingerprint !== nextFingerprint) {
                this.deps.renderConversation(next);
            }
        }
    }

    async refreshNow(options?: QaapTranscriptLiveRefreshOptions): Promise<void> {
        const conversationId = this.watchedConversationId;
        if (!conversationId || !this.deps.isWatching(conversationId)) {
            return;
        }
        if (this.refreshInFlight) {
            if (options?.forceStatusSettle) {
                this.pendingForceSettle = true;
            }
            return;
        }
        const last = this.deps.getLastConv();
        if (shouldSkipStreamingTranscriptRefetch(last, this.deps.getLastSseDeltaAt()) && !options?.forceStatusSettle) {
            return;
        }
        this.refreshInFlight = true;
        try {
            await this.deps.refreshConversation(options);
        } finally {
            this.refreshInFlight = false;
            if (this.pendingForceSettle) {
                this.pendingForceSettle = false;
                void this.refreshNow({ forceStatusSettle: true });
            }
        }
    }

    protected clearRefreshTimer(): void {
        if (this.refreshTimer !== undefined) {
            window.clearTimeout(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    }
}
