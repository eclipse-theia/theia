// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversationSummaryDTO } from './qaap-agent-conversation-client';

/** Local Theia chat session projected into the Work Hub list model. */
export function isLocalChatSummary(
    summary: Pick<QaapAgentConversationSummaryDTO, 'source'>,
): boolean {
    return summary.source === 'theia-chat';
}

/** VPS-backed agent work (conversations API and derived task rows). */
export function isVpsTaskSummary(
    summary: Pick<QaapAgentConversationSummaryDTO, 'source'>,
): boolean {
    return !isLocalChatSummary(summary);
}

export function filterLocalChatSummaries<T extends QaapAgentConversationSummaryDTO>(
    summaries: readonly T[],
): T[] {
    return summaries.filter(isLocalChatSummary);
}

export function filterVpsTaskSummaries<T extends QaapAgentConversationSummaryDTO>(
    summaries: readonly T[],
): T[] {
    return summaries.filter(isVpsTaskSummary);
}

/** Legacy hub tab ids — map to current Tasks surface. */
export function normalizeWorkHubViewId(view: string): string {
    if (view === 'chats' || view === 'team') {
        return 'tasks';
    }
    return view;
}
