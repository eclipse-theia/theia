// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { QAAP_AGENT_MAX_CPU_PERCENT_ENV, QAAP_AGENT_MAX_MEMORY_MB_ENV } from './qaap-agent-resource-policy';

/** Memory cap (MB) for per-repo workspace containers (`QAAP_CLOUD_MODE=docker`). */
export const QAAP_DOCKER_WORKSPACE_MEMORY_MB_ENV = 'QAAP_DOCKER_WORKSPACE_MEMORY_MB';
/** CPU quota as fractional cores, e.g. `1.5` (`docker create --cpus`). */
export const QAAP_DOCKER_WORKSPACE_CPUS_ENV = 'QAAP_DOCKER_WORKSPACE_CPUS';
/** Docker network mode: `bridge` (default), `none`, or `host`. */
export const QAAP_DOCKER_NETWORK_MODE_ENV = 'QAAP_DOCKER_NETWORK_MODE';
/** Set to `0` to omit `IS_SANDBOX=1` in new workspace containers. */
export const QAAP_DOCKER_IS_SANDBOX_ENV = 'QAAP_DOCKER_IS_SANDBOX';

export type QaapDockerNetworkMode = 'bridge' | 'none' | 'host';

export interface QaapDockerWorkspacePolicy {
    readonly memoryMb?: number;
    /** Fractional CPU cores passed to Docker `NanoCPUs`. */
    readonly cpus?: number;
    readonly networkMode: QaapDockerNetworkMode;
    /** Inject `IS_SANDBOX=1` for hosted agent CLIs inside the workspace container. */
    readonly injectSandboxEnv: boolean;
}

export interface QaapDockerWorkspaceHostConfig {
    readonly Memory?: number;
    readonly MemorySwap?: number;
    readonly NanoCPUs?: number;
    readonly NetworkMode?: string;
    readonly AutoRemove: false;
}

function resolveOptionalPositiveInt(env: NodeJS.ProcessEnv, key: string): number | undefined {
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

function resolveOptionalPositiveFloat(env: NodeJS.ProcessEnv, key: string): number | undefined {
    const raw = env[key]?.trim();
    if (!raw) {
        return undefined;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return undefined;
    }
    return parsed;
}

export function resolveDockerNetworkMode(env: NodeJS.ProcessEnv = process.env): QaapDockerNetworkMode {
    const raw = env[QAAP_DOCKER_NETWORK_MODE_ENV]?.trim().toLowerCase();
    if (raw === 'none' || raw === 'host') {
        return raw;
    }
    return 'bridge';
}

export function resolveDockerWorkspacePolicy(env: NodeJS.ProcessEnv = process.env): QaapDockerWorkspacePolicy {
    const memoryMb = resolveOptionalPositiveInt(env, QAAP_DOCKER_WORKSPACE_MEMORY_MB_ENV)
        ?? resolveOptionalPositiveInt(env, QAAP_AGENT_MAX_MEMORY_MB_ENV);
    let cpus = resolveOptionalPositiveFloat(env, QAAP_DOCKER_WORKSPACE_CPUS_ENV);
    if (cpus === undefined) {
        const cpuPercent = resolveOptionalPositiveInt(env, QAAP_AGENT_MAX_CPU_PERCENT_ENV);
        if (cpuPercent) {
            cpus = cpuPercent / 100;
        }
    }
    return {
        memoryMb,
        cpus,
        networkMode: resolveDockerNetworkMode(env),
        injectSandboxEnv: env[QAAP_DOCKER_IS_SANDBOX_ENV]?.trim() !== '0',
    };
}

/** Docker {@code HostConfig} fragment for workspace containers (without volume binds). */
export function buildDockerWorkspaceHostConfig(
    policy: QaapDockerWorkspacePolicy,
): QaapDockerWorkspaceHostConfig {
    const bytes = policy.memoryMb ? policy.memoryMb * 1024 * 1024 : undefined;
    return {
        AutoRemove: false,
        ...(bytes !== undefined ? { Memory: bytes, MemorySwap: bytes } : {}),
        ...(policy.cpus ? { NanoCPUs: Math.round(policy.cpus * 1_000_000_000) } : {}),
        ...(policy.networkMode !== 'bridge' ? { NetworkMode: policy.networkMode } : {}),
    };
}

export function buildDockerWorkspaceContainerEnv(policy: QaapDockerWorkspacePolicy): string[] | undefined {
    return policy.injectSandboxEnv ? ['IS_SANDBOX=1'] : undefined;
}
