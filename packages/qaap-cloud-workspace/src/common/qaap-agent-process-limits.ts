// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export {
    QAAP_AGENT_IDLE_TIMEOUT_MS_ENV,
    QAAP_AGENT_KILL_GRACE_MS_ENV,
    QAAP_AGENT_MAX_CONCURRENT_PER_REPO_ENV,
    QAAP_AGENT_MAX_CPU_PERCENT_ENV,
    QAAP_AGENT_MAX_MEMORY_MB_ENV,
    QAAP_AGENT_TASK_TIMEOUT_MS_ENV,
    QAAP_AGENT_WALL_TIMEOUT_MS_ENV,
    resolveAgentResourcePolicy,
    resolveIdleTimeoutMs,
    resolveKillGraceMs,
    resolveMaxConcurrentPerRepo,
    resolvePositiveIntEnv,
    resolveWallTimeoutMs,
    wrapAgentCommandWithResourceLimits,
    type QaapAgentResourcePolicy,
} from './qaap-agent-resource-policy';
