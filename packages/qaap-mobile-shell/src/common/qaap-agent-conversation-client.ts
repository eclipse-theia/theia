// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapLinkedPullRequest } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import type { QaapCreateAgentTaskQaiqModel } from './qaap-agent-task-client';
import { buildConversationListMetrics } from './qaap-agent-conversation-list-metrics';
import { normalizeAgentMessageContentForDisplay } from './qaap-agent-message-content';

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
    /** User-flagged "high priority" — sorts at the top of the project list. */
    readonly priority?: boolean;
    /** User-flagged "paused" — sinks to the bottom and renders dimmed. */
    readonly paused?: boolean;
    /** When `false`, tool calls need manual CLI approval on the VPS. */
    readonly autoApprove?: boolean;
    /** Id of the parent conversation when this one was created via fork. */
    readonly forkedFromId?: string;
    /** Set on parallel-run variant conversations — groups them under {@link parallelBaseCwd}. */
    readonly parallelRunId?: string;
    readonly parallelBaseCwd?: string;
    readonly activityLabel?: string;
    readonly linesAdded?: number;
    readonly linesRemoved?: number;
    readonly turnStartedAt?: number;
    readonly turnProgressCurrent?: number;
    readonly turnProgressTotal?: number;
    readonly lastTurnDurationMs?: number;
    readonly linkedPullRequest?: QaapLinkedPullRequest;
    /** Set when the thread ran `git` or is tied to a PR — used by the Work Hub inbox filter. */
    readonly hasGitOperation?: boolean;
}

export type QaapAgentMessageSegmentDTO =
    | { readonly type: 'text'; readonly content: string }
    | { readonly type: 'thinking'; readonly content: string }
    | {
        readonly type: 'tool';
        readonly toolUseId: string;
        readonly name: string;
        readonly args: string;
        readonly finished: boolean;
        readonly result?: string;
    };

export interface QaapAgentMessageDTO {
    readonly id: string;
    readonly role: 'user' | 'agent';
    readonly content: string;
    readonly segments?: QaapAgentMessageSegmentDTO[];
    readonly createdAt: number;
    readonly taskId?: string;
    readonly error?: string;
}

/** A per-turn working-tree snapshot (Timeline / rollback). Mirrors the backend checkpoint. */
export interface QaapConversationCheckpointDTO {
    readonly id: string;
    readonly messageId: string;
    readonly label: string;
    readonly commit: string;
    readonly ref: string;
    readonly capturedAt: number;
    readonly added?: number;
    readonly removed?: number;
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
    readonly priority?: boolean;
    readonly paused?: boolean;
    readonly autoApprove?: boolean;
    readonly forkedFromId?: string;
    readonly parallelRunId?: string;
    readonly parallelBaseCwd?: string;
    readonly checkpoints?: QaapConversationCheckpointDTO[];
    readonly linkedPullRequest?: QaapLinkedPullRequest;
}

export function conversationToSummary(conv: QaapAgentConversationDTO): QaapAgentConversationSummaryDTO {
    const last = conv.messages[conv.messages.length - 1];
    const clean = last
        ? normalizeAgentMessageContentForDisplay(last.content).replace(/\s+/g, ' ').trim()
        : undefined;
    const preview = clean === undefined
        ? undefined
        : clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
    const metrics = buildConversationListMetrics({ status: conv.status, messages: conv.messages });
    const hasGitOperation = metrics.hasGitOperation || conv.linkedPullRequest
        ? true
        : undefined;
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
        priority: conv.priority,
        paused: conv.paused,
        autoApprove: conv.autoApprove === false ? false : undefined,
        forkedFromId: conv.forkedFromId,
        parallelRunId: conv.parallelRunId,
        parallelBaseCwd: conv.parallelBaseCwd,
        linkedPullRequest: conv.linkedPullRequest,
        ...metrics,
        hasGitOperation,
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
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    /** @deprecated Use {@link agentModel}. */
    readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
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

export async function restoreConversationCheckpoint(id: string, checkpointId: string): Promise<QaapAgentConversationDTO> {
    const response = await fetch(
        `${QAAP_AGENT_CONVERSATION_API_PATH}/${encodeURIComponent(id)}/checkpoints/${encodeURIComponent(checkpointId)}/restore`,
        { method: 'POST', credentials: 'include' },
    );
    if (!response.ok) {
        throw new Error((await response.text()) || response.statusText);
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

export async function postConversationMessage(
    id: string,
    content: string,
    agent?: string,
    agentModel?: QaapCreateAgentTaskQaiqModel,
): Promise<QaapAgentConversationDTO> {
    const response = await fetch(`${QAAP_AGENT_CONVERSATION_API_PATH}/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, agent, agentModel, qaiqModel: agentModel }),
    });
    if (!response.ok) {
        throw new Error((await response.text()) || response.statusText);
    }
    return response.json() as Promise<QaapAgentConversationDTO>;
}

export async function renameConversation(id: string, title: string): Promise<QaapAgentConversationDTO> {
    return updateConversation(id, { title });
}

export interface QaapUpdateConversationBody {
    readonly title?: string;
    readonly priority?: boolean;
    readonly paused?: boolean;
    readonly autoApprove?: boolean;
    readonly linkedPullRequest?: QaapLinkedPullRequest | null;
}

/** True when YOLO / auto-approve is enabled for a VPS agent conversation. */
export function isConversationAutoApproveEnabled(summary: { readonly autoApprove?: boolean }): boolean {
    return summary.autoApprove !== false;
}

export async function updateConversation(id: string, patch: QaapUpdateConversationBody): Promise<QaapAgentConversationDTO> {
    const response = await fetch(`${QAAP_AGENT_CONVERSATION_API_PATH}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
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

export async function retryConversation(id: string): Promise<QaapAgentConversationDTO> {
    const response = await fetch(`${QAAP_AGENT_CONVERSATION_API_PATH}/${encodeURIComponent(id)}/retry`, {
        method: 'POST',
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error((await response.text()) || response.statusText);
    }
    return response.json() as Promise<QaapAgentConversationDTO>;
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
