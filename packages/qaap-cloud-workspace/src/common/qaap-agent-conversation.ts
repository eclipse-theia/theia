// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { buildConversationListMetrics } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-conversation-list-metrics';
import { resolveMessagePreviewText } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-message-content';
import {
    DEFAULT_QAAP_CONTEXT_WINDOW,
    estimateConversationTokensFromMessages,
    type QaapAgentContextUsage,
} from '@theia/qaap-mobile-shell/lib/common/qaap-agent-context-usage';
import type { QaapLinkedPullRequest } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import type { QaapCreateAgentTaskQaiqModel } from './qaap-agent-task';
import type { QaapParallelRunVariantStats } from './qaap-parallel-run';

/** HTTP base path for the persistent agent-conversation endpoints. */
export const QAAP_AGENT_CONVERSATION_API_PATH = '/qaap/api/agent-conversations';

/** Optional auto-approve scopes under the {@code approve-for-me} preset. File edits are always included. */
export interface QaapAgentToolApprovalRules {
    readonly shell?: boolean;
    readonly network?: boolean;
}

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

/** A working-tree snapshot anchored to a conversation turn (Timeline / rollback). */
export interface QaapConversationCheckpoint {
    readonly id: string;
    /** The user message id whose turn produced this snapshot. */
    readonly messageId: string;
    readonly label: string;
    /** Git commit object that captures the full working tree at capture time. */
    readonly commit: string;
    /** Ref keeping {@link commit} alive against GC (`refs/qaap/checkpoints/...`). */
    readonly ref: string;
    readonly capturedAt: number;
    readonly added?: number;
    readonly removed?: number;
}

/** A persistent multi-turn thread with an agent, tied to a working directory. */
export interface QaapAgentConversation {
    readonly id: string;
    /** Absolute working directory the agent is invoked in. */
    readonly cwd: string;
    /** Agent id (e.g. `'claude'`, `'codex'`, `'shell'`). */
    readonly agentId: string;
    /** Explicit model for this thread (user picker), not the global Settings alias. */
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    /** @deprecated Use {@link agentModel}. */
    readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
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
    /**
     * When `false`, agent turns require manual CLI approval (will hang unattended).
     * Omitted/`true` enables YOLO / auto-approve for background runs.
     */
    readonly autoApprove?: boolean;
    /** Resolved cross-project context (frontend PromptService), prepended to each agent turn's prompt. */
    readonly contextPreamble?: string;
    /** Last composer interaction mode (`agent`, `plan`, `ask`) — drives QAIQ CLI flags. */
    readonly interactionModeId?: string;
    /** Last composer approval preset — drives QAIQ permission mode when auto-approve is on. */
    readonly approvalPolicyId?: string;
    /** Optional scopes under {@code approve-for-me} (shell / network). Edits are always included. */
    readonly toolApprovalRules?: QaapAgentToolApprovalRules;
    /** Set on conversations created via {@link fork} — points at the parent's id. */
    readonly forkedFromId?: string;
    /** Set on variant conversations of a parallel run — groups them in the Chats inbox. */
    readonly parallelRunId?: string;
    /** Base repository root a parallel-run variant was derived from (its own cwd is a worktree). */
    readonly parallelBaseCwd?: string;
    /** Working-tree snapshots captured per turn — the Timeline / rollback feature. */
    readonly checkpoints?: QaapConversationCheckpoint[];
    /**
     * Ground-truth git diff stats computed via `git diff --numstat` at turn completion.
     * These take priority over the text-parsed estimates in {@link buildConversationListMetrics}.
     */
    readonly gitDiffAdded?: number;
    readonly gitDiffRemoved?: number;
    /** When set, this thread is tied to a GitHub pull request (Work Hub inbox). */
    readonly linkedPullRequest?: QaapLinkedPullRequest;
    /** Cumulative token usage when the agent CLI reports stream-json usage. */
    readonly contextUsage?: QaapAgentContextUsage;
    /** Denominator for the context meter (defaults to {@link DEFAULT_QAAP_CONTEXT_WINDOW}). */
    readonly contextWindowSize?: number;
    /** When true, {@link contextUsage} is absent and the UI may show a transcript-based estimate. */
    readonly contextUsageEstimated?: boolean;
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
    /** Present and `false` when the user disabled YOLO for this thread. */
    readonly autoApprove?: boolean;
    readonly forkedFromId?: string;
    /** Set on variant conversations of a parallel run — groups them in the Chats inbox. */
    readonly parallelRunId?: string;
    /** Base repository root a parallel-run variant was derived from. */
    readonly parallelBaseCwd?: string;
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
    readonly contextUsage?: QaapAgentContextUsage;
    readonly contextWindowSize?: number;
    readonly contextUsageEstimated?: boolean;
    /** Cached estimate for list rows when {@link contextUsageEstimated} is set. */
    readonly estimatedContextTokens?: number;
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
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    /** @deprecated Use {@link agentModel}. */
    readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
    /** Marks this conversation as a parallel-run variant (grouped under {@link parallelBaseCwd}). */
    readonly parallelRunId?: string;
    readonly parallelBaseCwd?: string;
    /** When `false`, tool calls need manual CLI approval on the VPS. */
    readonly autoApprove?: boolean;
    /** Resolved cross-project context (frontend PromptService), stored on the conversation. */
    readonly contextPreamble?: string;
    readonly interactionModeId?: string;
    readonly approvalPolicyId?: string;
    readonly toolApprovalRules?: QaapAgentToolApprovalRules;
}

export interface QaapPostAgentMessageRequest {
    readonly content: string;
    /** When set, overrides the conversation's stored agent for this turn (and updates it). */
    readonly agent?: string;
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    /** @deprecated Use {@link agentModel}. */
    readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
    /**
     * When set, applies the composer approval policy for this turn (`true` → YOLO / auto-approve CLI flags).
     */
    readonly autoApprove?: boolean;
    readonly interactionModeId?: string;
    readonly approvalPolicyId?: string;
    readonly toolApprovalRules?: QaapAgentToolApprovalRules;
}

export interface QaapRenameAgentConversationRequest {
    readonly title: string;
}

/** PATCH body — any subset of these mutable flags can be updated in one call. */
export interface QaapUpdateAgentConversationRequest {
    readonly title?: string;
    readonly priority?: boolean;
    readonly paused?: boolean;
    /** `true` clears an explicit opt-out; `false` requires manual tool approval on future turns. */
    readonly autoApprove?: boolean;
    readonly linkedPullRequest?: QaapLinkedPullRequest | null;
    /** Composer agent picker — overrides the thread default for future turns. */
    readonly agent?: string;
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    /** @deprecated Use {@link agentModel}. */
    readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
    readonly interactionModeId?: string;
    readonly approvalPolicyId?: string;
    readonly toolApprovalRules?: QaapAgentToolApprovalRules;
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
    | { readonly type: 'deleted'; readonly conversationId: string; readonly cwd: string }
    | { readonly type: 'parallel-run'; readonly runId: string; readonly variants: readonly QaapParallelRunVariantStats[] };

/** Status exposed to list rows — keeps `failed` when a user turn still carries an error. */
export function resolveEffectiveConversationStatus(conv: QaapAgentConversation): QaapAgentConversationStatus {
    if (conv.status === 'streaming') {
        return 'streaming';
    }
    if (conv.status === 'failed' || conv.messages.some(message => message.role === 'user' && message.error)) {
        return 'failed';
    }
    return conv.status;
}

export function toConversationSummary(conv: QaapAgentConversation): QaapAgentConversationSummary {
    const last = conv.messages[conv.messages.length - 1];
    const status = resolveEffectiveConversationStatus(conv);
    const base: QaapAgentConversationSummary = {
        id: conv.id,
        cwd: conv.cwd,
        agentId: conv.agentId,
        title: conv.title,
        status,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messageCount: conv.messages.length,
        lastMessagePreview: last ? excerpt(resolveMessagePreviewText(last)) : undefined,
        lastMessageRole: last?.role,
        priority: conv.priority || undefined,
        paused: conv.paused || undefined,
        autoApprove: conv.autoApprove === false ? false : undefined,
        forkedFromId: conv.forkedFromId,
        parallelRunId: conv.parallelRunId,
        parallelBaseCwd: conv.parallelBaseCwd,
        linkedPullRequest: conv.linkedPullRequest,
    };
    const metrics = buildConversationListMetrics({ status, messages: conv.messages });
    const hasGitOperation = metrics.hasGitOperation || conv.linkedPullRequest
        ? true
        : undefined;
    return {
        ...base,
        ...metrics,
        hasGitOperation,
        ...(conv.gitDiffAdded !== undefined ? { linesAdded: conv.gitDiffAdded } : {}),
        ...(conv.gitDiffRemoved !== undefined ? { linesRemoved: conv.gitDiffRemoved } : {}),
        ...(conv.contextUsage ? { contextUsage: conv.contextUsage } : {}),
        ...(conv.contextWindowSize ? { contextWindowSize: conv.contextWindowSize } : {}),
        ...(conv.contextUsageEstimated ? { contextUsageEstimated: true } : {}),
        ...(conv.contextUsageEstimated
            ? { estimatedContextTokens: estimateConversationTokensFromMessages(conv.messages, conv.contextPreamble) }
            : {}),
    };
}

export { DEFAULT_QAAP_CONTEXT_WINDOW };
export type { QaapAgentContextUsage };

function excerpt(text: string): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
}
