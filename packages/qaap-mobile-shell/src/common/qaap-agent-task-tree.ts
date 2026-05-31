// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Minimal task shape for parent/child grouping in the Work Hub. */
export interface QaapAgentTaskTreeNode {
    readonly id: string;
    readonly parentId?: string;
}

export interface QaapAgentTaskTree<T extends QaapAgentTaskTreeNode> {
    /** Top-level tasks (no parentId, or parent not in the set). */
    readonly roots: readonly T[];
    /** Child tasks keyed by parent task id. */
    readonly childrenByParent: ReadonlyMap<string, readonly T[]>;
}

/**
 * Group VPS background tasks into a leader/subtask tree using {@link parentId}.
 * Orphans whose parent is missing from `tasks` are treated as roots.
 */
export function groupAgentTasksByParent<T extends QaapAgentTaskTreeNode>(tasks: readonly T[]): QaapAgentTaskTree<T> {
    const ids = new Set(tasks.map(task => task.id));
    const childrenByParent = new Map<string, T[]>();
    const roots: T[] = [];
    for (const task of tasks) {
        const parentId = task.parentId;
        if (parentId && ids.has(parentId)) {
            const bucket = childrenByParent.get(parentId) ?? [];
            bucket.push(task);
            childrenByParent.set(parentId, bucket);
        } else {
            roots.push(task);
        }
    }
    return { roots, childrenByParent };
}

/** Resolve the leader task id for the current conversation turn (latest user message with taskId). */
export function resolveLeaderTaskIdFromMessages(
    messages: ReadonlyArray<{ readonly role: string; readonly taskId?: string }>,
): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.role === 'user' && message.taskId) {
            return message.taskId;
        }
    }
    return undefined;
}
