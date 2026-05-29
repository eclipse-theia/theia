// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { buildConversationListMetrics } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-conversation-list-metrics';
import type { QaapLinkedPullRequest } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';

/** HTTP base path for the persistent agent-conversation endpoints. */
export const QAAP_AGENT_CONVERSATION_API_PATH = '/qaap/api/agent-conversations';

export type QaapAgentConversationStatus =
    /** No turn is in flight; ready to accept the next user message. */
    | 'idle'
    /** A user message is being processed by the agent. */
    | 'streaming'
    /** Last agent turn failed (the conversation can still accept a follow-up message). */
    | 'failed';

export type QaapAgentMessageRole = 'user' | 'agent';

/** Structured blocks parsed from QAIQ {@code stream-json} output (thinking, tools, text). */
export type QaapAgentMessageSegment =
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

export interface QaapAgentMessage {
    readonly id: string;
    readonly role: QaapAgentMessageRole;
    readonly content: string;
    /** Present for agent turns driven by QAIQ stream-json. */
    readonly segments?: QaapAgentMessageSegment[];
    /** Epoch milliseconds. */
    readonly createdAt: number;
    /** When set on a user message, points at the agent-task spawned for that turn. */
    readonly taskId?: string;
    /** When the user message's task ended unsuccessfully — short reason for the UI. */
    readonly error?: string;
}

/** A persistent multi-turn thread with an agent, tied to a working directory. */
export interface QaapAgentConversation {
    readonly id: string;
    /** Absolute working directory the agent is invoked in. */
    readonly cwd: string;
    /** Agent id (e.g. `'claude'`, `'codex'`, `'shell'`). */
    readonly agentId: string;
    /** Best-effort title, derived from the first user message. */
    readonly title: string;
    readonly status: QaapAgentConversationStatus;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly messages: QaapAgentMessage[];
    /** User-flagged "high priority" — surfaces at the top of project lists. */
    readonly priority?: boolean;
    /** User-flagged "paused" — sinks to the bottom; active turn is cancelled when paused. */
    readonly paused?: boolean;
    /** Set on conversations created via {@link fork} — points at the parent's id. */
    readonly forkedFromId?: string;
    /**
     * Ground-truth git diff stats computed via `git diff --numstat` at turn completion.
     * These take priority over the text-parsed estimates in {@link buildConversationListMetrics}.
     */
    readonly gitDiffAdded?: number;
    readonly gitDiffRemoved?: number;
    /** When set, this thread is tied to a GitHub pull request (Work Hub inbox). */
    readonly linkedPullRequest?: QaapLinkedPullRequest;
}

/** Summary row used by list endpoints — omits messages to keep payloads small. */
export interface QaapAgentConversationSummary {
    readonly id: string;
    readonly cwd: string;
    readonly agentId: string;
    readonly title: string;
    readonly status: QaapAgentConversationStatus;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly messageCount: number;
    /** Excerpt of the most recent message — handy for list-view previews. */
    readonly lastMessagePreview?: string;
    /** Role of the most recent message, so the UI can render "you said…" vs. "agent replied…". */
    readonly lastMessageRole?: QaapAgentMessageRole;
    readonly priority?: boolean;
    readonly paused?: boolean;
    readonly forkedFromId?: string;
    /** In-flight tool/status label while {@link status} is `'streaming'`. */
    readonly activityLabel?: string;
    readonly linesAdded?: number;
    readonly linesRemoved?: number;
    /** Epoch ms when the current turn started (last user message). */
    readonly turnStartedAt?: number;
    readonly turnProgressCurrent?: number;
    readonly turnProgressTotal?: number;
    /** Duration of the last completed agent turn. */
    readonly lastTurnDurationMs?: number;
    readonly linkedPullRequest?: QaapLinkedPullRequest;
    /** Set when the thread ran `git` or is tied to a PR — used by the Work Hub inbox filter. */
    readonly hasGitOperation?: boolean;
}

/** Conversations bucketed by project working directory. */
export interface QaapAgentConversationCwdGroup {
    readonly cwd: string;
    readonly projectName: string;
    readonly streamingCount: number;
    readonly conversations: QaapAgentConversationSummary[];
}

export interface QaapAgentConversationListResponse {
    readonly conversations: QaapAgentConversationSummary[];
}

export interface QaapAgentConversationAllResponse {
    readonly groups: QaapAgentConversationCwdGroup[];
}

export interface QaapCreateAgentConversationRequest {
    readonly cwd: string;
    readonly agent?: string;
    readonly title?: string;
    /** Optional first user message; when present, the agent turn fires right after creation. */
    readonly message?: string;
}

export interface QaapPostAgentMessageRequest {
    readonly content: string;
    /** When set, overrides the conversation's stored agent for this turn (and updates it). */
    readonly agent?: string;
}

export interface QaapRenameAgentConversationRequest {
    readonly title: string;
}

/** PATCH body — any subset of these mutable flags can be updated in one call. */
export interface QaapUpdateAgentConversationRequest {
    readonly title?: string;
    readonly priority?: boolean;
    readonly paused?: boolean;
    readonly linkedPullRequest?: QaapLinkedPullRequest | null;
}

export interface QaapLinkConversationsByBranchRequest {
    readonly owner: string;
    readonly repo: string;
    readonly number: number;
    readonly branch: string;
    readonly title?: string;
}

/** Payload pushed over SSE when a conversation changes. */
export type QaapAgentConversationEvent =
    | { readonly type: 'created'; readonly conversation: QaapAgentConversationSummary }
    | { readonly type: 'updated'; readonly conversation: QaapAgentConversationSummary }
    | { readonly type: 'message'; readonly conversationId: string; readonly cwd: string; readonly message: QaapAgentMessage }
    | { readonly type: 'deleted'; readonly conversationId: string; readonly cwd: string };

export function toConversationSummary(conv: QaapAgentConversation): QaapAgentConversationSummary {
    const last = conv.messages[conv.messages.length - 1];
    const base: QaapAgentConversationSummary = {
        id: conv.id,
        cwd: conv.cwd,
        agentId: conv.agentId,
        title: conv.title,
        status: conv.status,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messageCount: conv.messages.length,
        lastMessagePreview: last ? excerpt(last.content) : undefined,
        lastMessageRole: last?.role,
        priority: conv.priority || undefined,
        paused: conv.paused || undefined,
        forkedFromId: conv.forkedFromId,
        linkedPullRequest: conv.linkedPullRequest,
    };
    const metrics = buildConversationListMetrics({ status: conv.status, messages: conv.messages });
    const hasGitOperation = metrics.hasGitOperation || conv.linkedPullRequest
        ? true
        : undefined;
    return {
        ...base,
        ...metrics,
        hasGitOperation,
        ...(conv.gitDiffAdded !== undefined ? { linesAdded: conv.gitDiffAdded } : {}),
        ...(conv.gitDiffRemoved !== undefined ? { linesRemoved: conv.gitDiffRemoved } : {}),
    };
}

function excerpt(text: string): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
}
