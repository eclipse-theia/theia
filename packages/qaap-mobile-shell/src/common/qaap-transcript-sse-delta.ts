// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversationDTO, QaapAgentMessageDTO } from './qaap-agent-conversation-client';
import { isOpencodeAgent, isQaiqAgent } from './qaap-agent-task-client';

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
    if (!conv || conv.id !== conversationId) {
        return false;
    }
    if (!isQaiqAgent(conv.agentId) && !isOpencodeAgent(conv.agentId)) {
        return false;
    }
    if (message.role === 'agent') {
        return !!message.segments?.length || !!message.content?.trim();
    }
    return true;
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
        status: 'streaming',
        updatedAt: Math.max(conv.updatedAt, message.createdAt),
    };
}
