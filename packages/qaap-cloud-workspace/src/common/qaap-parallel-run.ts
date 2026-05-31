// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** HTTP base path for the parallel-runs API (variants in isolated git worktrees). */
export const QAAP_PARALLEL_RUN_API_PATH = '/qaap/api/parallel-runs';

export type QaapParallelVariantState = 'running' | 'idle' | 'failed';

/** One agent variant of a parallel run, living in its own git worktree + branch. */
export interface QaapParallelRunVariant {
    readonly id: string;
    readonly agentId: string;
    readonly worktreePath: string;
    readonly branch: string;
    readonly conversationId: string;
    state: QaapParallelVariantState;
    /** Working-tree diff stats for the variant (added/deleted lines, changed files). */
    adds: number;
    dels: number;
    fileCount: number;
}

export interface QaapParallelRun {
    readonly id: string;
    /** Base repository root the worktrees are derived from. */
    readonly cwd: string;
    readonly prompt: string;
    readonly createdAt: number;
    variants: QaapParallelRunVariant[];
}

export interface QaapCreateParallelRunRequest {
    readonly cwd: string;
    readonly prompt: string;
    /** Agent ids — one isolated worktree + conversation is spawned per agent. */
    readonly agents: string[];
}

/** What to do with the winning variant when the user chooses one. */
export type QaapParallelChooseAction = 'keep-branch' | 'merge' | 'none';

export interface QaapChooseParallelVariantRequest {
    /** Conversation id of the winning variant (each variant is a conversation). */
    readonly conversationId: string;
    readonly action: QaapParallelChooseAction;
}

export interface QaapChooseParallelVariantResponse {
    readonly ok: boolean;
    /** Branch kept/merged for the winner, when applicable. */
    readonly branch?: string;
    /** Populated when a `merge` action could not complete cleanly (aborted, tree untouched). */
    readonly error?: string;
}
