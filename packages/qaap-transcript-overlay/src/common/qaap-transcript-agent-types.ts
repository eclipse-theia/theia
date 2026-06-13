// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { AIVariableResolutionRequest } from '@theia/ai-core';
import type { QaapLinkedPullRequest } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';

/** Structural copies of mobile-shell agent DTOs — keeps overlay independent of qaap-mobile-shell at compile time. */
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

export type QaapAgentApprovalPolicyId = 'request-approval' | 'approve-for-me' | 'full-access';

export interface QaapAgentToolApprovalRules {
    readonly shell?: boolean;
    readonly network?: boolean;
}

export interface StickyComposerContextEntry {
    readonly id: string;
    request: AIVariableResolutionRequest;
    localPreviewSrc?: string;
    pending?: boolean;
    displayName?: string;
}

export interface QaapAgentTaskAgentOption {
    readonly id: string;
    readonly label: string;
    readonly available: boolean;
}

export interface QaapQaiqModelOption {
    readonly provider: 'openai' | 'gemini' | 'ollama' | 'anthropic' | 'mistral';
    readonly vendor: string;
    readonly modelId: string;
    readonly label: string;
}

export interface QaapCreateAgentTaskQaiqModel {
    readonly provider: 'openai' | 'gemini' | 'ollama' | 'anthropic' | 'mistral';
    readonly vendor: string;
    readonly modelId: string;
}

export interface QaapAgentContextUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheCreationInputTokens?: number;
    readonly cacheReadInputTokens?: number;
}

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
    readonly priority?: boolean;
    readonly paused?: boolean;
    readonly autoApprove?: boolean;
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    /** @deprecated Use {@link agentModel}. */
    readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
    readonly interactionModeId?: string;
    readonly approvalPolicyId?: string;
    readonly forkedFromId?: string;
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
    readonly hasGitOperation?: boolean;
    readonly contextUsage?: QaapAgentContextUsage;
    readonly contextWindowSize?: number;
    readonly contextUsageEstimated?: boolean;
    readonly estimatedContextTokens?: number;
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
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
    readonly interactionModeId?: string;
    readonly approvalPolicyId?: string;
    readonly toolApprovalRules?: QaapAgentToolApprovalRules;
    readonly forkedFromId?: string;
    readonly parallelRunId?: string;
    readonly parallelBaseCwd?: string;
    readonly checkpoints?: QaapConversationCheckpointDTO[];
    readonly linkedPullRequest?: QaapLinkedPullRequest;
    readonly contextPreamble?: string;
    readonly contextUsage?: QaapAgentContextUsage;
    readonly contextWindowSize?: number;
    readonly contextUsageEstimated?: boolean;
}

export interface QaapGitHistoryCommit {
    hash: string;
    shortHash: string;
    subject: string;
    authorName: string;
    authorEmail?: string;
    authoredAt: string;
    refs: string[];
}
