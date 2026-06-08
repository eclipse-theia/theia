// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentApprovalRequestDTO } from './qaap-agent-approval-client';

/** Pending approval for the open QAIQ transcript (newest first). */
export function resolveTranscriptInlineApproval(
    approvals: readonly QaapAgentApprovalRequestDTO[],
    conversationId: string,
): QaapAgentApprovalRequestDTO | undefined {
    return approvals
        .filter(approval => approval.conversationId === conversationId)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
}
