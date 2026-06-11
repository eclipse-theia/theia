// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversationEvent } from './qaap-agent-conversation';

/** Coalesce bursty transcript SSE frames to ~40 fps server-side. */
export const QAAP_CONVERSATION_SSE_BATCH_MS = 24;

function messageEventKey(event: Extract<QaapAgentConversationEvent, { type: 'message' }>): string {
    return `${event.conversationId}\0${event.message.id}`;
}

function messageDeltaEventKey(event: Extract<QaapAgentConversationEvent, { type: 'message_delta' }>): string {
    return `${event.conversationId}\0${event.messageId}`;
}

/**
 * Batches high-frequency `message` / `message_delta` / streaming `updated` events while keeping
 * lifecycle transitions immediate.
 */
export class QaapAgentConversationSseBatcher {

    protected flushTimer: ReturnType<typeof setTimeout> | undefined;
    protected readonly pendingMessages = new Map<string, QaapAgentConversationEvent>();
    protected readonly pendingMessageDeltas = new Map<string, QaapAgentConversationEvent>();
    protected readonly pendingUpdated = new Map<string, QaapAgentConversationEvent>();

    constructor(
        protected readonly emit: (event: QaapAgentConversationEvent) => void,
        protected readonly batchMs = QAAP_CONVERSATION_SSE_BATCH_MS,
    ) { }

    enqueue(event: QaapAgentConversationEvent): void {
        if (this.shouldEmitImmediately(event)) {
            this.flush();
            this.emit(event);
            return;
        }
        if (event.type === 'message') {
            if (event.message.role === 'user') {
                this.flush();
                this.emit(event);
                return;
            }
            this.pendingMessages.set(messageEventKey(event), event);
            this.scheduleFlush();
            return;
        }
        if (event.type === 'message_delta') {
            this.pendingMessageDeltas.set(messageDeltaEventKey(event), event);
            this.scheduleFlush();
            return;
        }
        if (event.type === 'updated') {
            this.pendingUpdated.set(event.conversation.id, event);
            this.scheduleFlush();
            return;
        }
        this.flush();
        this.emit(event);
    }

    flush(): void {
        this.clearTimer();
        for (const event of this.pendingMessages.values()) {
            this.emit(event);
        }
        this.pendingMessages.clear();
        for (const event of this.pendingMessageDeltas.values()) {
            this.emit(event);
        }
        this.pendingMessageDeltas.clear();
        for (const event of this.pendingUpdated.values()) {
            this.emit(event);
        }
        this.pendingUpdated.clear();
    }

    dispose(): void {
        this.flush();
    }

    protected shouldEmitImmediately(event: QaapAgentConversationEvent): boolean {
        if (event.type === 'created' || event.type === 'deleted' || event.type === 'parallel-run') {
            return true;
        }
        if (event.type === 'updated' && event.conversation.status !== 'streaming') {
            return true;
        }
        if (event.type === 'message' || event.type === 'message_delta') {
            return false;
        }
        return false;
    }

    protected scheduleFlush(): void {
        if (this.flushTimer !== undefined) {
            return;
        }
        this.flushTimer = setTimeout(() => {
            this.flushTimer = undefined;
            this.flush();
        }, this.batchMs);
    }

    protected clearTimer(): void {
        if (this.flushTimer !== undefined) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
    }
}
