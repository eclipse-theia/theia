// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { QAAP_AGENT_CONVERSATION_API_PATH } from './qaap-agent-conversation';

/** WebSocket upgrade path for the live conversation feed. */
export const QAAP_AGENT_CONVERSATION_WS_PATH = `${QAAP_AGENT_CONVERSATION_API_PATH}/ws`;

/** Client → server control frames. */
export type QaapAgentConversationWsClientMessage =
    | { readonly op: 'cancel'; readonly conversationId: string }
    | { readonly op: 'ping' };

export function parseQaapAgentConversationWsClientMessage(
    raw: unknown,
): QaapAgentConversationWsClientMessage | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const message = raw as { op?: unknown; conversationId?: unknown };
    if (message.op === 'ping') {
        return { op: 'ping' };
    }
    if (message.op === 'cancel' && typeof message.conversationId === 'string' && message.conversationId.trim()) {
        return { op: 'cancel', conversationId: message.conversationId.trim() };
    }
    return undefined;
}
