// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Max simultaneous agent processes per repo cwd (default 1). */
export const QAAP_AGENT_MAX_CONCURRENT_PER_REPO_ENV = 'QAAP_AGENT_MAX_CONCURRENT_PER_REPO';
/** Kill agent CLIs that sit silent too long (auth/quota/input hangs). */
export const QAAP_AGENT_IDLE_TIMEOUT_MS_ENV = 'QAAP_AGENT_IDLE_TIMEOUT_MS';
/** Hard cap on total wall-clock runtime since spawn. */
export const QAAP_AGENT_WALL_TIMEOUT_MS_ENV = 'QAAP_AGENT_WALL_TIMEOUT_MS';
/** Legacy alias for {@link QAAP_AGENT_WALL_TIMEOUT_MS_ENV}. */
export const QAAP_AGENT_TASK_TIMEOUT_MS_ENV = 'QAAP_AGENT_TASK_TIMEOUT_MS';
/** Grace period after SIGTERM before SIGKILL on the process tree. */
export const QAAP_AGENT_KILL_GRACE_MS_ENV = 'QAAP_AGENT_KILL_GRACE_MS';
/** Soft virtual-memory cap per agent shell on Unix (`ulimit -v`, in megabytes). */
export const QAAP_AGENT_MAX_MEMORY_MB_ENV = 'QAAP_AGENT_MAX_MEMORY_MB';
/** Reserved for Docker/cgroup enforcement — not applied by the Node supervisor yet. */
export const QAAP_AGENT_MAX_CPU_PERCENT_ENV = 'QAAP_AGENT_MAX_CPU_PERCENT';

const DEFAULT_MAX_CONCURRENT_PER_REPO = 1;
const DEFAULT_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_WALL_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_KILL_GRACE_MS = 5_000;

/** Server-side limits for hosted background agent processes. */
export interface QaapAgentResourcePolicy {
    readonly maxConcurrentPerRepo: number;
    readonly idleTimeoutMs: number;
    readonly wallTimeoutMs: number;
    readonly killGraceMs: number;
    /** Unix-only soft cap applied via `ulimit -v` around the agent shell command. */
    readonly maxMemoryMb?: number;
    /** Fractional CPU cores for Docker workspace containers (`maxCpuPercent / 100`). */
    readonly maxCpuPercent?: number;
}

export function resolvePositiveIntEnv(
    env: NodeJS.ProcessEnv,
    key: string,
    defaultValue: number,
): number {
    const raw = env[key]?.trim();
    if (!raw) {
        return defaultValue;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return defaultValue;
    }
    return parsed;
}

function resolveOptionalPositiveIntEnv(env: NodeJS.ProcessEnv, key: string): number | undefined {
    const raw = env[key]?.trim();
    if (!raw) {
        return undefined;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return undefined;
    }
    return parsed;
}

export function resolveMaxConcurrentPerRepo(env: NodeJS.ProcessEnv = process.env): number {
    return resolvePositiveIntEnv(env, QAAP_AGENT_MAX_CONCURRENT_PER_REPO_ENV, DEFAULT_MAX_CONCURRENT_PER_REPO);
}

export function resolveIdleTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
    return resolvePositiveIntEnv(env, QAAP_AGENT_IDLE_TIMEOUT_MS_ENV, DEFAULT_IDLE_TIMEOUT_MS);
}

export function resolveWallTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
    const wallRaw = env[QAAP_AGENT_WALL_TIMEOUT_MS_ENV]?.trim();
    const legacyRaw = env[QAAP_AGENT_TASK_TIMEOUT_MS_ENV]?.trim();
    const raw = wallRaw || legacyRaw;
    if (!raw) {
        return DEFAULT_WALL_TIMEOUT_MS;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_WALL_TIMEOUT_MS;
    }
    return parsed;
}

export function resolveKillGraceMs(env: NodeJS.ProcessEnv = process.env): number {
    return resolvePositiveIntEnv(env, QAAP_AGENT_KILL_GRACE_MS_ENV, DEFAULT_KILL_GRACE_MS);
}

export function resolveAgentResourcePolicy(env: NodeJS.ProcessEnv = process.env): QaapAgentResourcePolicy {
    return {
        maxConcurrentPerRepo: resolveMaxConcurrentPerRepo(env),
        idleTimeoutMs: resolveIdleTimeoutMs(env),
        wallTimeoutMs: resolveWallTimeoutMs(env),
        killGraceMs: resolveKillGraceMs(env),
        maxMemoryMb: resolveOptionalPositiveIntEnv(env, QAAP_AGENT_MAX_MEMORY_MB_ENV),
        maxCpuPercent: resolveOptionalPositiveIntEnv(env, QAAP_AGENT_MAX_CPU_PERCENT_ENV),
    };
}

/** Prefix the shell command with a soft virtual-memory ulimit when configured. */
export function wrapAgentCommandWithResourceLimits(
    command: string,
    policy: QaapAgentResourcePolicy,
): string {
    if (!policy.maxMemoryMb || policy.maxMemoryMb < 1 || process.platform === 'win32') {
        return command;
    }
    const virtualMemoryKb = policy.maxMemoryMb * 1024;
    return `ulimit -v ${virtualMemoryKb} 2>/dev/null; ${command}`;
}
