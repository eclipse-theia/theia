// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * HTTP helpers for the persistent VPS agent-conversation API.
 * Keep {@link QAAP_AGENT_CONVERSATION_API_PATH} in sync with `@theia/qaap-cloud-workspace`.
 */
export const QAAP_AGENT_CONVERSATION_API_PATH = '/qaap/api/agent-conversations';

export interface QaapAgentConversationSummaryDTO {
    readonly id: string;
    readonly source?: 'qaap-agent' | 'theia-chat';
    readonly cwd: string;
    readonly agentId: string;
    readonly title: string;
    readonly status: 'idle' | 'streaming' | 'failed';
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly messageCount: number;
    readonly lastMessagePreview?: string;
    readonly lastMessageRole?: 'user' | 'agent';
    readonly workspacePath?: string;
    readonly sessionId?: string;
}

export interface QaapAgentMessageDTO {
    readonly id: string;
    readonly role: 'user' | 'agent';
    readonly content: string;
    readonly createdAt: number;
    readonly taskId?: string;
    readonly error?: string;
}

/**
 * Full conversation document as returned by the GET/POST detail endpoints. It carries the live
 * message list but not the summary's denormalized preview/messageCount — call
 * {@link conversationToSummary} to get a {@link QaapAgentConversationSummaryDTO}.
 */
export interface QaapAgentConversationDTO {
    readonly id: string;
    readonly cwd: string;
    readonly agentId: string;
    readonly title: string;
    readonly status: 'idle' | 'streaming' | 'failed';
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly messages: QaapAgentMessageDTO[];
}

export function conversationToSummary(conv: QaapAgentConversationDTO): QaapAgentConversationSummaryDTO {
    const last = conv.messages[conv.messages.length - 1];
    const clean = last?.content?.replace(/\s+/g, ' ').trim();
    const preview = clean === undefined
        ? undefined
        : clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
    return {
        id: conv.id,
        cwd: conv.cwd,
        agentId: conv.agentId,
        title: conv.title,
        status: conv.status,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messageCount: conv.messages.length,
        lastMessagePreview: preview,
        lastMessageRole: last?.role,
    };
}

export interface QaapAgentConversationGroupDTO {
    readonly cwd: string;
    readonly projectName: string;
    readonly streamingCount: number;
    readonly conversations: QaapAgentConversationSummaryDTO[];
}

export interface QaapCreateConversationBody {
    readonly cwd: string;
    readonly agent?: string;
    readonly title?: string;
    readonly message?: string;
}

export async function listConversationsForCwd(cwd: string): Promise<QaapAgentConversationSummaryDTO[]> {
    const url = `${QAAP_AGENT_CONVERSATION_API_PATH}?cwd=${encodeURIComponent(cwd)}`;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    const body = await response.json() as { conversations?: QaapAgentConversationSummaryDTO[] };
    return body.conversations ?? [];
}

export async function listAllConversationGroups(): Promise<QaapAgentConversationGroupDTO[]> {
    const response = await fetch(`${QAAP_AGENT_CONVERSATION_API_PATH}/all`, { credentials: 'include' });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    const body = await response.json() as { groups?: QaapAgentConversationGroupDTO[] };
    return body.groups ?? [];
}

export async function getConversation(id: string): Promise<QaapAgentConversationDTO> {
    const response = await fetch(`${QAAP_AGENT_CONVERSATION_API_PATH}/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    return response.json() as Promise<QaapAgentConversationDTO>;
}

export async function createConversation(body: QaapCreateConversationBody): Promise<QaapAgentConversationDTO> {
    const response = await fetch(QAAP_AGENT_CONVERSATION_API_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error((await response.text()) || response.statusText);
    }
    return response.json() as Promise<QaapAgentConversationDTO>;
}

export async function postConversationMessage(id: string, content: string): Promise<QaapAgentConversationDTO> {
    const response = await fetch(`${QAAP_AGENT_CONVERSATION_API_PATH}/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    });
    if (!response.ok) {
        throw new Error((await response.text()) || response.statusText);
    }
    return response.json() as Promise<QaapAgentConversationDTO>;
}

export async function renameConversation(id: string, title: string): Promise<QaapAgentConversationDTO> {
    const response = await fetch(`${QAAP_AGENT_CONVERSATION_API_PATH}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    });
    if (!response.ok) {
        throw new Error((await response.text()) || response.statusText);
    }
    return response.json() as Promise<QaapAgentConversationDTO>;
}

export async function forkConversation(id: string): Promise<QaapAgentConversationDTO> {
    const response = await fetch(`${QAAP_AGENT_CONVERSATION_API_PATH}/${encodeURIComponent(id)}/fork`, {
        method: 'POST',
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error((await response.text()) || response.statusText);
    }
    return response.json() as Promise<QaapAgentConversationDTO>;
}

export async function cancelConversation(id: string): Promise<void> {
    const response = await fetch(`${QAAP_AGENT_CONVERSATION_API_PATH}/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
}

export async function deleteConversation(id: string): Promise<void> {
    const response = await fetch(`${QAAP_AGENT_CONVERSATION_API_PATH}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(response.statusText);
    }
}
