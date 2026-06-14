// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChildProcess, execSync, type SpawnOptions } from 'child_process';

/** Spawn options so Unix agents become their own process-group leader (kill-tree safe). */
export function agentProcessSpawnOptions(stdinInteractive: boolean): Pick<SpawnOptions, 'detached' | 'stdio'> {
    return {
        detached: process.platform !== 'win32',
        stdio: stdinInteractive ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    };
}

/** Deliver `signal` to the agent shell and its descendants when possible. */
export function signalAgentProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
    signalProcessTreeByPid(child.pid, signal);
}

/** Kill a detached process group when only the root pid is known (post-restart re-attach). */
export function signalProcessTreeByPid(pid: number | undefined, signal: NodeJS.Signals): void {
    if (!pid) {
        return;
    }
    if (process.platform === 'win32') {
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            try {
                execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
            } catch {
                try {
                    process.kill(pid, signal);
                } catch {
                    /* already dead */
                }
            }
            return;
        }
        try {
            process.kill(pid, signal);
        } catch {
            /* already dead */
        }
        return;
    }
    try {
        process.kill(-pid, signal);
    } catch {
        try {
            process.kill(pid, signal);
        } catch {
            /* already dead */
        }
    }
}

/**
 * SIGTERM the tree, then SIGKILL after `graceMs`. Returns the escalation timer so callers can
 * clear it when the process exits early.
 */
export function scheduleAgentProcessTreeKill(
    child: ChildProcess,
    graceMs: number,
): NodeJS.Timeout | undefined {
    return scheduleProcessTreeKillByPid(child.pid, graceMs);
}

export function scheduleProcessTreeKillByPid(
    pid: number | undefined,
    graceMs: number,
): NodeJS.Timeout | undefined {
    signalProcessTreeByPid(pid, 'SIGTERM');
    if (graceMs <= 0) {
        signalProcessTreeByPid(pid, 'SIGKILL');
        return undefined;
    }
    return setTimeout(() => signalProcessTreeByPid(pid, 'SIGKILL'), graceMs);
}
