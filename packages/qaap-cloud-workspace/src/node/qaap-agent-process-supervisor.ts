// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { ChildProcess, spawn } from 'child_process';
import {
    resolveAgentResourcePolicy,
    wrapAgentCommandWithResourceLimits,
    type QaapAgentResourcePolicy,
} from '../common/qaap-agent-resource-policy';
import {
    agentProcessSpawnOptions,
    scheduleAgentProcessTreeKill,
} from './qaap-agent-process-kill';

export interface QaapAgentProcessSpawnRequest {
    readonly taskId: string;
    readonly command: string;
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly stdinInteractive: boolean;
}

export interface QaapAgentProcessWatchCallbacks {
    readonly isStillRunning: () => boolean;
    /** When true the idle watchdog is rescheduled instead of firing. */
    readonly isIdlePaused: () => boolean;
    readonly onTimeout: (reason: 'idle' | 'wall', message: string) => void;
}

export interface QaapAgentProcessWatchHandle {
    readonly bumpIdleTimer: () => void;
    readonly release: () => void;
}

/** Spawn, watchdog, and kill-tree helpers for hosted agent CLIs. */
@injectable()
export class QaapAgentProcessSupervisor {

    protected readonly idleTimers = new Map<string, NodeJS.Timeout>();
    protected readonly wallTimers = new Map<string, NodeJS.Timeout>();
    protected readonly killEscalationTimers = new Map<string, NodeJS.Timeout>();

    resolvePolicy(env: NodeJS.ProcessEnv = process.env): QaapAgentResourcePolicy {
        return resolveAgentResourcePolicy(env);
    }

    wrapCommand(command: string, policy: QaapAgentResourcePolicy = this.resolvePolicy()): string {
        return wrapAgentCommandWithResourceLimits(command, policy);
    }

    spawn(request: QaapAgentProcessSpawnRequest, env: NodeJS.ProcessEnv = process.env): ChildProcess {
        const policy = this.resolvePolicy(env);
        const command = this.wrapCommand(request.command, policy);
        return spawn(command, {
            cwd: request.cwd,
            shell: true,
            env: request.env,
            ...agentProcessSpawnOptions(request.stdinInteractive),
        });
    }

    startWatch(
        taskId: string,
        child: ChildProcess,
        callbacks: QaapAgentProcessWatchCallbacks,
        env: NodeJS.ProcessEnv = process.env,
    ): QaapAgentProcessWatchHandle {
        const policy = this.resolvePolicy(env);
        const bumpIdleTimer = (): void => {
            const existing = this.idleTimers.get(taskId);
            if (existing) {
                clearTimeout(existing);
            }
            const timer = setTimeout(() => {
                if (!callbacks.isStillRunning()) {
                    return;
                }
                if (callbacks.isIdlePaused()) {
                    bumpIdleTimer();
                    return;
                }
                callbacks.onTimeout(
                    'idle',
                    `task timed out after ${Math.round(policy.idleTimeoutMs / 1000)}s without output.`,
                );
            }, policy.idleTimeoutMs);
            this.idleTimers.set(taskId, timer);
        };
        bumpIdleTimer();
        this.wallTimers.set(taskId, setTimeout(() => {
            if (!callbacks.isStillRunning()) {
                return;
            }
            callbacks.onTimeout(
                'wall',
                `task exceeded wall-clock limit of ${Math.round(policy.wallTimeoutMs / 1000)}s.`,
            );
        }, policy.wallTimeoutMs));
        return {
            bumpIdleTimer,
            release: () => this.release(taskId),
        };
    }

    terminate(taskId: string, child: ChildProcess, env: NodeJS.ProcessEnv = process.env): void {
        this.clearWatchTimers(taskId);
        const existing = this.killEscalationTimers.get(taskId);
        if (existing) {
            clearTimeout(existing);
            this.killEscalationTimers.delete(taskId);
        }
        const timer = scheduleAgentProcessTreeKill(child, this.resolvePolicy(env).killGraceMs);
        if (timer) {
            this.killEscalationTimers.set(taskId, timer);
        }
    }

    release(taskId: string): void {
        this.clearWatchTimers(taskId);
        const killTimer = this.killEscalationTimers.get(taskId);
        if (killTimer) {
            clearTimeout(killTimer);
            this.killEscalationTimers.delete(taskId);
        }
    }

    protected clearWatchTimers(taskId: string): void {
        const idle = this.idleTimers.get(taskId);
        if (idle) {
            clearTimeout(idle);
            this.idleTimers.delete(taskId);
        }
        const wall = this.wallTimers.get(taskId);
        if (wall) {
            clearTimeout(wall);
            this.wallTimers.delete(taskId);
        }
    }
}
