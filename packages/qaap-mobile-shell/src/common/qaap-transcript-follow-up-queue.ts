// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export interface TranscriptFollowUpEntry {
    readonly draft: string;
    readonly selectedAgentId?: string;
    readonly modeId?: string;
    readonly autoApprove?: boolean;
    readonly approvalPolicyId?: string;
}

export const MAX_TRANSCRIPT_FOLLOW_UP_QUEUE = 5;

export class TranscriptFollowUpQueue {
    protected readonly byConversation = new Map<string, TranscriptFollowUpEntry[]>();

    enqueue(conversationId: string, entry: TranscriptFollowUpEntry): boolean {
        const queue = this.byConversation.get(conversationId) ?? [];
        if (queue.length >= MAX_TRANSCRIPT_FOLLOW_UP_QUEUE) {
            return false;
        }
        queue.push(entry);
        this.byConversation.set(conversationId, queue);
        return true;
    }

    peek(conversationId: string): readonly TranscriptFollowUpEntry[] {
        return this.byConversation.get(conversationId) ?? [];
    }

    unshift(conversationId: string, entry: TranscriptFollowUpEntry): void {
        const queue = this.byConversation.get(conversationId) ?? [];
        queue.unshift(entry);
        this.byConversation.set(conversationId, queue);
    }

    shift(conversationId: string): TranscriptFollowUpEntry | undefined {
        const queue = this.byConversation.get(conversationId);
        if (!queue?.length) {
            return undefined;
        }
        const next = queue.shift();
        if (!queue.length) {
            this.byConversation.delete(conversationId);
        }
        return next;
    }

    clear(conversationId: string): void {
        this.byConversation.delete(conversationId);
    }

    size(conversationId: string): number {
        return this.byConversation.get(conversationId)?.length ?? 0;
    }
}
