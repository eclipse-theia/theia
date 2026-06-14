// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Persisted metadata for a background agent process that may survive backend restart. */
export interface QaapAgentRunningTaskSnapshot {
    readonly taskId: string;
    readonly pid: number;
    readonly logBytes: number;
    readonly updatedAt: number;
    readonly cwd: string;
}

export type QaapAgentRunningTaskSnapshotIndex = Record<string, QaapAgentRunningTaskSnapshot>;

/** Best-effort liveness probe — false when the pid is gone or not signalable. */
export function isAgentProcessAlive(pid: number | undefined): boolean {
    if (!pid || pid <= 0) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

export function upsertRunningTaskSnapshot(
    index: QaapAgentRunningTaskSnapshotIndex,
    snapshot: QaapAgentRunningTaskSnapshot,
): QaapAgentRunningTaskSnapshotIndex {
    return { ...index, [snapshot.taskId]: snapshot };
}

export function removeRunningTaskSnapshot(
    index: QaapAgentRunningTaskSnapshotIndex,
    taskId: string,
): QaapAgentRunningTaskSnapshotIndex {
    if (!(taskId in index)) {
        return index;
    }
    const next = { ...index };
    delete next[taskId];
    return next;
}
