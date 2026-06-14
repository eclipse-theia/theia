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
    if (!child.pid) {
        return;
    }
    if (process.platform === 'win32') {
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            try {
                execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
            } catch {
                try {
                    child.kill(signal);
                } catch {
                    /* already dead */
                }
            }
            return;
        }
        try {
            child.kill(signal);
        } catch {
            /* already dead */
        }
        return;
    }
    try {
        process.kill(-child.pid, signal);
    } catch {
        try {
            child.kill(signal);
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
    signalAgentProcessTree(child, 'SIGTERM');
    if (graceMs <= 0) {
        signalAgentProcessTree(child, 'SIGKILL');
        return undefined;
    }
    return setTimeout(() => signalAgentProcessTree(child, 'SIGKILL'), graceMs);
}
