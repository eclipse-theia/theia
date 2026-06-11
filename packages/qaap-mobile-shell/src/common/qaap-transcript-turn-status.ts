// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversationDTO, QaapAgentMessageDTO } from './qaap-agent-conversation-client';

/**
 * True when the visible agent turn looks complete (tools done, answer or edits shown) even if the
 * backend task is still attached — e.g. a dev server keeps the VPS process alive after the model
 * finished the turn.
 */
export function isConversationTurnVisuallySettled(conv: QaapAgentConversationDTO): boolean {
    if (conv.status !== 'streaming') {
        return conv.status === 'idle';
    }
    const last = conv.messages[conv.messages.length - 1];
    if (!last || last.role !== 'agent') {
        return false;
    }
    return isAgentMessageVisuallySettled(last);
}

export function isAgentMessageVisuallySettled(message: QaapAgentMessageDTO): boolean {
    if (message.role !== 'agent') {
        return false;
    }
    if (message.segments?.length) {
        const hasUnfinishedTool = message.segments.some(
            segment => segment.type === 'tool' && !segment.finished,
        );
        if (hasUnfinishedTool) {
            return false;
        }
        const hasFinishedTool = message.segments.some(
            segment => segment.type === 'tool' && segment.finished,
        );
        const hasText = message.segments.some(
            segment => segment.type === 'text' && !!segment.content?.trim(),
        );
        if (hasText || hasFinishedTool) {
            return true;
        }
        // Thinking-only snapshots are not a completed turn while the backend task is still running.
        return false;
    }
    return !!(message.content?.trim());
}

/** UI-facing status — maps visually settled streaming turns to idle for chrome/composer. */
export function resolveTranscriptEffectiveStatus(
    conv: QaapAgentConversationDTO,
): QaapAgentConversationDTO['status'] {
    if (conv.status !== 'streaming') {
        return conv.status;
    }
    return isConversationTurnVisuallySettled(conv) ? 'idle' : 'streaming';
}

/**
 * True when the last agent message should use live streaming markdown (plain/hybrid)
 * instead of full settled rendering.
 */
export function isTranscriptAgentTailStreaming(conv: QaapAgentConversationDTO): boolean {
    if (conv.status !== 'streaming' || isConversationTurnVisuallySettled(conv)) {
        return false;
    }
    const last = conv.messages[conv.messages.length - 1];
    return last?.role === 'agent';
}
