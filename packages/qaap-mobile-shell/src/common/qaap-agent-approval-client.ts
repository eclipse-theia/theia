// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const QAAP_AGENT_APPROVAL_API_PATH = '/qaap/api/agent-approvals';

export type QaapAgentApprovalKind = 'tool' | 'prompt';

export interface QaapAgentApprovalRequestDTO {
    readonly id: string;
    readonly conversationId: string;
    readonly taskId?: string;
    readonly cwd: string;
    readonly agentId: string;
    readonly conversationTitle: string;
    readonly kind: QaapAgentApprovalKind;
    readonly toolName?: string;
    readonly toolUseId?: string;
    readonly summary: string;
    readonly detail?: string;
    readonly createdAt: number;
}

export interface QaapAgentApprovalListResponseDTO {
    readonly approvals: QaapAgentApprovalRequestDTO[];
}

export interface QaapAgentApprovalActionResponseDTO {
    readonly ok: boolean;
    readonly error?: string;
}

export async function fetchAgentApprovals(cwd?: string): Promise<QaapAgentApprovalRequestDTO[]> {
    const query = cwd?.trim() ? `?cwd=${encodeURIComponent(cwd)}` : '';
    const response = await fetch(`${QAAP_AGENT_APPROVAL_API_PATH}${query}`, { credentials: 'include' });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    const body = await response.json() as QaapAgentApprovalListResponseDTO;
    return body.approvals ?? [];
}

export async function approveAgentRequest(id: string): Promise<QaapAgentApprovalActionResponseDTO> {
    const response = await fetch(`${QAAP_AGENT_APPROVAL_API_PATH}/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        credentials: 'include',
    });
    const body = await response.json() as QaapAgentApprovalActionResponseDTO;
    if (!response.ok && !body.error) {
        throw new Error(response.statusText);
    }
    return body;
}

export async function rejectAgentRequest(id: string): Promise<QaapAgentApprovalActionResponseDTO> {
    const response = await fetch(`${QAAP_AGENT_APPROVAL_API_PATH}/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
        credentials: 'include',
    });
    const body = await response.json() as QaapAgentApprovalActionResponseDTO;
    if (!response.ok && !body.error) {
        throw new Error(response.statusText);
    }
    return body;
}
