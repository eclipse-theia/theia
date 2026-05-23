// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Shared HTTP + persistence helpers for background agent tasks.
 * Keep {@link QAAP_AGENT_TASK_API_PATH} in sync with `@theia/qaap-cloud-workspace`.
 */
export const QAAP_AGENT_TASK_API_PATH = '/qaap/api/agent-tasks';

export const SHELL_AGENT_ID = 'shell';

/** Legacy global fallback for users that picked an agent before selections became cwd-scoped. */
export const SELECTED_AGENT_STORAGE_KEY = 'qaap.agentTasks.selectedAgent';

export interface QaapAgentTaskAgentOption {
    readonly id: string;
    readonly label: string;
    readonly available: boolean;
}

export interface QaapAgentTaskListSnapshot {
    readonly agents: QaapAgentTaskAgentOption[];
    readonly agentConfigured: boolean;
    readonly defaultAgent?: string;
}

export interface QaapAgentTaskCreated {
    readonly id: string;
    readonly cwd: string;
    readonly state: string;
    readonly title?: string;
    readonly command?: string;
    readonly createdAt?: number;
}

export type QaapCreateAgentTaskBody =
    | { readonly command: string; readonly cwd: string }
    | { readonly prompt: string; readonly agent: string; readonly cwd: string };

export function scopedAgentStorageKey(cwd: string): string {
    return `${SELECTED_AGENT_STORAGE_KEY}.${hashString(cwd)}`;
}

export function readStoredAgent(cwd: string | undefined): string | undefined {
    try {
        return cwd
            ? window.localStorage.getItem(scopedAgentStorageKey(cwd)) ?? window.localStorage.getItem(SELECTED_AGENT_STORAGE_KEY) ?? undefined
            : window.localStorage.getItem(SELECTED_AGENT_STORAGE_KEY) ?? undefined;
    } catch {
        return undefined;
    }
}

export function writeStoredAgent(cwd: string | undefined, agentId: string): void {
    try {
        if (cwd) {
            window.localStorage.setItem(scopedAgentStorageKey(cwd), agentId);
        }
        window.localStorage.setItem(SELECTED_AGENT_STORAGE_KEY, agentId);
    } catch {
        /* localStorage unavailable — selection is session-only */
    }
}

/**
 * Pick a valid agent id: honor the current choice, then per-cwd storage, then server default.
 */
export function reconcileSelectedAgent(
    current: string | undefined,
    agents: readonly QaapAgentTaskAgentOption[],
    defaultAgent: string | undefined,
    cwd: string | undefined,
): string {
    const ids = new Set(agents.map(agent => agent.id));
    if (current && ids.has(current)) {
        return current;
    }
    const stored = readStoredAgent(cwd);
    if (stored && ids.has(stored)) {
        return stored;
    }
    if (defaultAgent && ids.has(defaultAgent)) {
        return defaultAgent;
    }
    return agents[0]?.id ?? SHELL_AGENT_ID;
}

export function buildCreateAgentTaskBody(draft: string, agent: string, cwd: string): QaapCreateAgentTaskBody {
    if (agent === SHELL_AGENT_ID) {
        return { command: draft, cwd };
    }
    return { prompt: draft, agent, cwd };
}

export function shellAgentFallback(): QaapAgentTaskAgentOption {
    return { id: SHELL_AGENT_ID, label: 'Shell', available: true };
}

export async function fetchAgentTaskList(cwd?: string): Promise<QaapAgentTaskListSnapshot> {
    const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : '';
    const response = await fetch(`${QAAP_AGENT_TASK_API_PATH}${query}`, { credentials: 'include' });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    const body = await response.json() as {
        agents?: QaapAgentTaskAgentOption[];
        agentConfigured?: boolean;
        defaultAgent?: string;
    };
    const agents = [...(body.agents ?? [])];
    if (agents.length === 0) {
        agents.push(shellAgentFallback());
    }
    return {
        agents,
        agentConfigured: body.agentConfigured === true,
        defaultAgent: body.defaultAgent,
    };
}

export async function fetchAgentTaskListAll(): Promise<QaapAgentTaskListSnapshot> {
    const response = await fetch(`${QAAP_AGENT_TASK_API_PATH}/all`, { credentials: 'include' });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    const body = await response.json() as {
        agents?: QaapAgentTaskAgentOption[];
        agentConfigured?: boolean;
        defaultAgent?: string;
    };
    const agents = [...(body.agents ?? [])];
    if (agents.length === 0) {
        agents.push(shellAgentFallback());
    }
    return {
        agents,
        agentConfigured: body.agentConfigured === true,
        defaultAgent: body.defaultAgent,
    };
}

export async function createAgentTask(body: QaapCreateAgentTaskBody): Promise<QaapAgentTaskCreated> {
    const response = await fetch(QAAP_AGENT_TASK_API_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
    }
    return response.json() as Promise<QaapAgentTaskCreated>;
}

export async function cancelAgentTask(id: string): Promise<void> {
    const response = await fetch(`${QAAP_AGENT_TASK_API_PATH}/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
}

function hashString(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}
