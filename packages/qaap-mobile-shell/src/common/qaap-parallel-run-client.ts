// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

// Frontend client for the parallel-runs backend. DTOs mirror
// `@theia/qaap-cloud-workspace/src/common/qaap-parallel-run.ts` (kept local, like the other
// qaap clients in this package, to avoid a cross-package dependency).

export const QAAP_PARALLEL_RUN_API_PATH = '/qaap/api/parallel-runs';

export type QaapParallelVariantState = 'running' | 'idle' | 'failed';

export interface QaapParallelRunVariantStatsDTO {
    readonly conversationId: string;
    readonly agentId: string;
    readonly state: QaapParallelVariantState;
    readonly adds: number;
    readonly dels: number;
    readonly fileCount: number;
}

export interface QaapParallelRunVariantDTO {
    readonly id: string;
    readonly agentId: string;
    readonly worktreePath: string;
    readonly branch: string;
    readonly conversationId: string;
    readonly state: QaapParallelVariantState;
    readonly adds: number;
    readonly dels: number;
    readonly fileCount: number;
}

export interface QaapParallelRunDTO {
    readonly id: string;
    readonly cwd: string;
    readonly prompt: string;
    readonly createdAt: number;
    readonly variants: QaapParallelRunVariantDTO[];
}

export type QaapParallelChooseAction = 'keep-branch' | 'merge' | 'none';

export interface QaapChooseParallelVariantResultDTO {
    readonly ok: boolean;
    readonly branch?: string;
    readonly error?: string;
}

export async function createParallelRun(cwd: string, prompt: string, agents: string[]): Promise<QaapParallelRunDTO> {
    const response = await fetch(QAAP_PARALLEL_RUN_API_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, prompt, agents }),
    });
    if (!response.ok) {
        throw new Error((await response.text()) || response.statusText);
    }
    return response.json() as Promise<QaapParallelRunDTO>;
}

export async function fetchParallelRun(id: string): Promise<QaapParallelRunDTO> {
    const response = await fetch(`${QAAP_PARALLEL_RUN_API_PATH}/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    return response.json() as Promise<QaapParallelRunDTO>;
}

export async function chooseParallelVariant(
    id: string,
    conversationId: string,
    action: QaapParallelChooseAction,
): Promise<QaapChooseParallelVariantResultDTO> {
    const response = await fetch(`${QAAP_PARALLEL_RUN_API_PATH}/${encodeURIComponent(id)}/choose`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, action }),
    });
    if (!response.ok) {
        throw new Error((await response.text()) || response.statusText);
    }
    return response.json() as Promise<QaapChooseParallelVariantResultDTO>;
}

export async function deleteParallelRun(id: string): Promise<void> {
    const response = await fetch(`${QAAP_PARALLEL_RUN_API_PATH}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
}
