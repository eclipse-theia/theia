// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentApprovalRequestDTO } from './qaap-agent-approval-client';
import type { QaapAgentMessageSegmentDTO } from './qaap-agent-conversation-client';

/** Pending approval for the open QAIQ transcript (newest first). */
export function resolveTranscriptInlineApproval(
    approvals: readonly QaapAgentApprovalRequestDTO[],
    conversationId: string,
): QaapAgentApprovalRequestDTO | undefined {
    return approvals
        .filter(approval => approval.conversationId === conversationId)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
}

/** Stable id shared with the VPS approval store (`conversationId:tool:toolUseId`). */
export function buildTranscriptToolApprovalId(conversationId: string, toolUseId: string): string {
    return `${conversationId}:tool:${toolUseId}`;
}

/** The actual pending approval for one tool call, if the backend reported one. */
export function findTranscriptToolApproval(
    approvals: readonly QaapAgentApprovalRequestDTO[],
    conversationId: string,
    toolUseId: string,
): QaapAgentApprovalRequestDTO | undefined {
    return approvals.find(approval =>
        approval.kind === 'tool'
        && approval.conversationId === conversationId
        && approval.toolUseId === toolUseId,
    );
}

export function isPendingTranscriptToolSegment(
    segment: QaapAgentMessageSegmentDTO,
): segment is Extract<QaapAgentMessageSegmentDTO, { type: 'tool' }> {
    return segment.type === 'tool' && !segment.finished;
}
