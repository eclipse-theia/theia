// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversationDTO, QaapAgentMessageDTO, QaapAgentConversationSummaryDTO } from './qaap-agent-conversation-client';

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

/** Merge one live SSE message into the in-memory conversation snapshot. */
export function applyConversationMessageDelta(
    conv: QaapAgentConversationDTO,
    message: QaapAgentMessageDTO,
): QaapAgentConversationDTO {
    const index = conv.messages.findIndex(entry => entry.id === message.id);
    const messages = index >= 0
        ? conv.messages.map((entry, i) => (i === index ? message : entry))
        : [...conv.messages, message];
    return {
        ...conv,
        messages,
        status: conv.status === 'streaming' ? 'streaming' : conv.status,
        updatedAt: Math.max(conv.updatedAt, message.createdAt),
    };
}
