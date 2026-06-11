// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type {
    QaapAgentConversationDTO,
    QaapAgentConversationSummaryDTO,
    QaapAgentMessageDTO,
} from './qaap-transcript-agent-types';
import { fingerprintAgentSegments } from './qaap-transcript-incremental-update';

export interface QaapTranscriptSseMessageEvent {
    readonly conversationId: string;
    readonly cwd: string;
    readonly message: QaapAgentMessageDTO;
}

/** Whether an SSE message payload can be merged into the open transcript without a refetch. */
export function canApplySseMessageDelta(
    conv: QaapAgentConversationDTO | undefined,
    conversationId: string,
    message: QaapAgentMessageDTO,
): conv is QaapAgentConversationDTO {
    if (!conv || conv.id !== conversationId || conv.status !== 'streaming') {
        return false;
    }
    if (message.role === 'agent') {
        return !!message.segments?.length || !!message.content?.trim();
    }
    return !!message.content?.trim();
}

/** Apply summary fields from an SSE `updated` event without refetching messages. */
export function applyConversationSummaryDelta(
    conv: QaapAgentConversationDTO,
    summary: QaapAgentConversationSummaryDTO,
): QaapAgentConversationDTO {
    return {
        ...conv,
        status: summary.status,
        updatedAt: Math.max(conv.updatedAt, summary.updatedAt),
        title: summary.title,
        ...(summary.autoApprove === false ? { autoApprove: false } : {}),
        ...(summary.linesAdded !== undefined ? { gitDiffAdded: summary.linesAdded } : {}),
        ...(summary.linesRemoved !== undefined ? { gitDiffRemoved: summary.linesRemoved } : {}),
        ...(summary.contextUsage ? { contextUsage: summary.contextUsage } : {}),
        ...(summary.contextWindowSize ? { contextWindowSize: summary.contextWindowSize } : {}),
        ...(summary.contextUsageEstimated ? { contextUsageEstimated: true } : {}),
    };
}

/** Skip a debounced GET while SSE message deltas are still arriving. */
export function shouldSkipStreamingTranscriptRefetch(
    conv: QaapAgentConversationDTO | undefined,
    lastSseDeltaAt: number | undefined,
    graceMs = 12_000,
): boolean {
    if (!conv || conv.status !== 'streaming') {
        return false;
    }
    return lastSseDeltaAt !== undefined && Date.now() - lastSseDeltaAt < graceMs;
}

function agentMessageSnapshotFingerprint(message: QaapAgentMessageDTO): string {
    return `${message.content ?? ''}|${fingerprintAgentSegments(message.segments ?? [])}`;
}

/** True when an SSE payload would change the in-memory agent/user row. */
export function agentMessageDeltaChanged(
    previous: QaapAgentMessageDTO,
    incoming: QaapAgentMessageDTO,
): boolean {
    if (previous.id !== incoming.id || previous.role !== incoming.role) {
        return true;
    }
    return agentMessageSnapshotFingerprint(previous) !== agentMessageSnapshotFingerprint(incoming);
}

/** Merge one live SSE message into the in-memory conversation snapshot. */
export function applyConversationMessageDelta(
    conv: QaapAgentConversationDTO,
    message: QaapAgentMessageDTO,
): QaapAgentConversationDTO {
    const index = conv.messages.findIndex(entry => entry.id === message.id);
    if (index >= 0) {
        const previous = conv.messages[index];
        if (previous && !agentMessageDeltaChanged(previous, message)) {
            return conv;
        }
    }
    const updatedAt = Math.max(conv.updatedAt, message.createdAt);
    let messages: QaapAgentMessageDTO[];
    if (index >= 0) {
        if (index === conv.messages.length - 1) {
            messages = conv.messages.slice(0, index).concat(message);
        } else {
            messages = conv.messages.map((entry, i) => (i === index ? message : entry));
        }
    } else {
        const last = conv.messages[conv.messages.length - 1];
        if (
            message.role === 'user'
            && last?.role === 'user'
            && last.id.startsWith('pending-user-')
        ) {
            messages = conv.messages.slice(0, -1).concat(message);
        } else {
            messages = conv.messages.concat(message);
        }
    }
    return {
        ...conv,
        messages,
        status: conv.status === 'streaming' ? 'streaming' : conv.status,
        updatedAt,
    };
}
