// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { usesInteractiveAgentApprovals } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-interactive-approvals';
import type { QaapAgentConversation, QaapAgentMessageSegment } from './qaap-agent-conversation';
import type { QaapQaiqPendingControlRequest } from './qaap-qaiq-stdio-approvals';

/** HTTP base path for pending VPS tool / permission approvals. */
export const QAAP_AGENT_APPROVAL_API_PATH = '/qaap/api/agent-approvals';

export type QaapAgentApprovalKind = 'tool' | 'prompt';

export interface QaapAgentApprovalRequest {
    readonly id: string;
    readonly conversationId: string;
    readonly taskId?: string;
    readonly cwd: string;
    readonly agentId: string;
    readonly conversationTitle: string;
    readonly kind: QaapAgentApprovalKind;
    readonly toolName?: string;
    readonly toolUseId?: string;
    /** Short human label, e.g. "Edit src/config/env.ts". */
    readonly summary: string;
    /** Optional monospace detail (tool args or log excerpt). */
    readonly detail?: string;
    readonly createdAt: number;
}

export interface QaapAgentApprovalListResponse {
    readonly approvals: QaapAgentApprovalRequest[];
}

export interface QaapAgentApprovalActionResponse {
    readonly ok: boolean;
    readonly error?: string;
}

export function buildToolApprovalId(conversationId: string, toolUseId: string): string {
    return `${conversationId}:tool:${toolUseId}`;
}

export function buildPromptApprovalId(conversationId: string, taskId: string): string {
    return `${conversationId}:prompt:${taskId}`;
}

export function summarizeToolApproval(toolName: string, args: string): { summary: string; detail?: string } {
    const trimmedArgs = args.trim();
    let summary = toolName;
    try {
        const parsed = JSON.parse(trimmedArgs) as Record<string, unknown>;
        const path = typeof parsed.file_path === 'string'
            ? parsed.file_path
            : typeof parsed.path === 'string'
                ? parsed.path
                : typeof parsed.command === 'string'
                    ? parsed.command
                    : undefined;
        if (path) {
            summary = `${toolName} · ${path}`;
        }
    } catch {
        if (trimmedArgs.length > 0 && trimmedArgs.length <= 120) {
            summary = `${toolName} · ${trimmedArgs}`;
        }
    }
    return {
        summary,
        detail: trimmedArgs.length > 120 ? trimmedArgs.slice(0, 240) : trimmedArgs || undefined,
    };
}

/** Manual approvals apply when the run can pause for tool permission prompts. */
export function usesInteractiveApprovals(conv: QaapAgentConversation): boolean {
    return usesInteractiveAgentApprovals({
        approvalPolicyId: conv.approvalPolicyId,
        autoApprove: conv.autoApprove === false ? false : undefined,
        toolApprovalRules: conv.toolApprovalRules,
        cwd: conv.cwd,
    });
}

export function buildControlRequestApproval(
    conv: QaapAgentConversation,
    taskId: string,
    request: QaapQaiqPendingControlRequest,
): QaapAgentApprovalRequest {
    const toolUseId = request.toolUseId ?? request.requestId;
    const toolName = request.toolName ?? 'Tool';
    const args = request.toolInput ? JSON.stringify(request.toolInput) : '';
    const { summary, detail } = summarizeToolApproval(toolName, args);
    return {
        id: buildToolApprovalId(conv.id, toolUseId),
        conversationId: conv.id,
        taskId,
        cwd: conv.cwd,
        agentId: conv.agentId,
        conversationTitle: conv.title,
        kind: 'tool',
        toolName,
        toolUseId,
        summary,
        detail,
        createdAt: Date.now(),
    };
}

export function extractPendingToolApprovals(
    conv: QaapAgentConversation,
    taskId: string | undefined,
): QaapAgentApprovalRequest[] {
    if (!usesInteractiveApprovals(conv) || conv.status !== 'streaming') {
        return [];
    }
    const agentMessage = [...conv.messages].reverse().find(message => message.role === 'agent');
    if (!agentMessage?.segments?.length) {
        return [];
    }
    const pending: QaapAgentApprovalRequest[] = [];
    for (const segment of agentMessage.segments) {
        if (!isPendingToolSegment(segment)) {
            continue;
        }
        const { summary, detail } = summarizeToolApproval(segment.name, segment.args);
        pending.push({
            id: buildToolApprovalId(conv.id, segment.toolUseId),
            conversationId: conv.id,
            taskId,
            cwd: conv.cwd,
            agentId: conv.agentId,
            conversationTitle: conv.title,
            kind: 'tool',
            toolName: segment.name,
            toolUseId: segment.toolUseId,
            summary,
            detail,
            createdAt: agentMessage.createdAt,
        });
    }
    return pending;
}

function isPendingToolSegment(segment: QaapAgentMessageSegment): segment is Extract<QaapAgentMessageSegment, { type: 'tool' }> {
    return segment.type === 'tool' && !segment.finished;
}

const LOG_APPROVAL_PATTERNS: readonly RegExp[] = [
    /Do you want to (?:allow|approve|proceed)/i,
    /Allow (?:this )?(?:tool|action|edit|command)/i,
    /Press .* to approve/i,
    /waiting for (?:your )?approval/i,
    /permission prompt/i,
];

export function detectLogApprovalPrompt(logTail: string): { summary: string; detail: string } | undefined {
    const lines = logTail.trim().split('\n').map(line => line.trim()).filter(Boolean);
    const tail = lines.slice(-8);
    for (let i = tail.length - 1; i >= 0; i--) {
        const line = tail[i];
        if (!LOG_APPROVAL_PATTERNS.some(pattern => pattern.test(line))) {
            continue;
        }
        const detail = tail.slice(Math.max(0, i - 1), i + 2).join('\n');
        return {
            summary: line.length > 96 ? `${line.slice(0, 93)}…` : line,
            detail,
        };
    }
    return undefined;
}

export function extractPendingPromptApproval(
    conv: QaapAgentConversation,
    taskId: string | undefined,
    logTail: string | undefined,
): QaapAgentApprovalRequest | undefined {
    if (!usesInteractiveApprovals(conv) || conv.status !== 'streaming' || !taskId || !logTail?.trim()) {
        return undefined;
    }
    const detected = detectLogApprovalPrompt(logTail);
    if (!detected) {
        return undefined;
    }
    return {
        id: buildPromptApprovalId(conv.id, taskId),
        conversationId: conv.id,
        taskId,
        cwd: conv.cwd,
        agentId: conv.agentId,
        conversationTitle: conv.title,
        kind: 'prompt',
        summary: detected.summary,
        detail: detected.detail,
        createdAt: Date.now(),
    };
}
