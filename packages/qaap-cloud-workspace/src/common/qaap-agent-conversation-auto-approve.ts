// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversation } from './qaap-agent-conversation';
import { resolveConversationAutoApprove } from './qaap-agent-auto-approve';

/**
 * Merge composer / per-message auto-approve into the conversation before spawning a task.
 * `true` clears an explicit opt-out; `false` requires manual CLI approval on this turn.
 */
export function patchConversationAutoApprove(
    conv: Pick<QaapAgentConversation, 'autoApprove'>,
    override?: boolean,
): Pick<QaapAgentConversation, 'autoApprove'> {
    if (override === false) {
        return { autoApprove: false };
    }
    if (override === true) {
        return { autoApprove: undefined };
    }
    return { autoApprove: conv.autoApprove };
}

/** Whether the upcoming task should inject CLI auto-approve (YOLO) flags. */
export function conversationTurnUsesAutoApprove(
    conv: Pick<QaapAgentConversation, 'autoApprove'>,
): boolean {
    return resolveConversationAutoApprove(conv.autoApprove === false ? false : undefined);
}
