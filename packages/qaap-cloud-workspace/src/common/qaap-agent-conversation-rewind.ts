// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type {
    QaapAgentConversation,
    QaapAgentMessage,
    QaapConversationCheckpoint,
} from './qaap-agent-conversation';

export interface ConversationRewindPlan {
    readonly trimmedMessages: QaapAgentMessage[];
    readonly trimmedCheckpoints: QaapConversationCheckpoint[];
    readonly taskIdsToCancel: string[];
    readonly restoreCheckpoint?: QaapConversationCheckpoint;
}

/** Pure plan for truncating a conversation at a user message (used by the store rewind API). */
export function planConversationRewind(
    conv: Pick<QaapAgentConversation, 'messages' | 'checkpoints'>,
    messageId: string,
): ConversationRewindPlan {
    const index = conv.messages.findIndex(message => message.id === messageId);
    if (index < 0) {
        throw new Error('Message not found.');
    }
    const target = conv.messages[index];
    if (target.role !== 'user') {
        throw new Error('Only user messages can be rewound.');
    }
    const taskIdsToCancel = conv.messages
        .slice(index)
        .map(message => message.taskId)
        .filter((id): id is string => !!id);
    const trimmedMessages = conv.messages.slice(0, index);
    const remainingIds = new Set(trimmedMessages.map(message => message.id));
    const trimmedCheckpoints = (conv.checkpoints ?? []).filter(checkpoint => remainingIds.has(checkpoint.messageId));
    let priorUserId: string | undefined;
    for (let i = index - 1; i >= 0; i--) {
        if (conv.messages[i].role === 'user') {
            priorUserId = conv.messages[i].id;
            break;
        }
    }
    const restoreCheckpoint = priorUserId
        ? [...(conv.checkpoints ?? [])].reverse().find(checkpoint => checkpoint.messageId === priorUserId)
        : undefined;
    return {
        trimmedMessages,
        trimmedCheckpoints,
        taskIdsToCancel,
        restoreCheckpoint,
    };
}
