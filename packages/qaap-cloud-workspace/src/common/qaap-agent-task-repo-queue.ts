// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentTask } from './qaap-agent-task';

export {
    QAAP_AGENT_MAX_CONCURRENT_PER_REPO_ENV,
    resolveMaxConcurrentPerRepo,
} from './qaap-agent-resource-policy';

export function countRunningTasksForCwd(tasks: readonly QaapAgentTask[], cwd: string): number {
    return tasks.filter(task => task.cwd === cwd && task.state === 'running').length;
}

/** True when another task for this cwd must wait in {@code queued} state. */
export function shouldQueueTask(runningCount: number, maxConcurrent: number): boolean {
    return runningCount >= maxConcurrent;
}

/** Oldest queued task for a cwd — FIFO per repo. */
export function selectNextQueuedTask(tasks: readonly QaapAgentTask[], cwd: string): QaapAgentTask | undefined {
    let oldest: QaapAgentTask | undefined;
    for (const task of tasks) {
        if (task.cwd !== cwd || task.state !== 'queued') {
            continue;
        }
        if (!oldest || task.createdAt < oldest.createdAt) {
            oldest = task;
        }
    }
    return oldest;
}
