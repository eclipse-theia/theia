// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { isQaapAgentTaskFinished, type QaapAgentTask } from './qaap-agent-task';

/** Max characters of subtask log appended to the leader conversation transcript. */
export const TEAM_MAILBOX_LOG_MAX_CHARS = 6000;

/** Prefix on auto-generated user turns that ask the leader to synthesize subtask results. */
export const TEAM_SYNTHESIS_USER_PREFIX = '[Team · synthesize]';

export type TeamTaskParentRef = Pick<QaapAgentTask, 'id' | 'parentId' | 'state'>;

export type TeamMailboxTaskInput = Pick<QaapAgentTask, 'id' | 'title' | 'state' | 'exitCode' | 'command'>;

/** Keep the tail of long logs so the leader sees the most recent agent output. */
export function truncateTeamMailboxLog(log: string, maxChars = TEAM_MAILBOX_LOG_MAX_CHARS): string {
    if (log.length <= maxChars) {
        return log;
    }
    const omitted = log.length - maxChars;
    return `…(${omitted} chars truncated)\n${log.slice(-maxChars)}`;
}

export function inferAgentIdFromTaskCommand(command: string): string {
    if (/\bqaiq\b|\bopenclaude\b/.test(command)) {
        return 'qaiq';
    }
    if (/\bcodex\b/.test(command)) {
        return 'codex';
    }
    if (/\bclaude\b/.test(command)) {
        return 'claude';
    }
    if (/\baider\b/.test(command)) {
        return 'aider';
    }
    return 'shell';
}

function formatSubtaskStatus(task: TeamMailboxTaskInput): string {
    if (task.state === 'completed') {
        return 'completed';
    }
    if (task.state === 'cancelled') {
        return 'cancelled';
    }
    if (task.exitCode !== undefined) {
        return `${task.state} (exit ${task.exitCode})`;
    }
    return task.state;
}

/** Passive mailbox body appended to the leader thread when a delegated subtask settles. */
export function formatSubtaskMailboxMessage(task: TeamMailboxTaskInput, log: string): string {
    const agentId = inferAgentIdFromTaskCommand(task.command);
    const lines = [
        `[Team · subtask · ${task.id}]`,
        `Agent: @${agentId} · Status: ${formatSubtaskStatus(task)} · Title: ${task.title}`,
        '',
    ];
    const trimmedLog = log.trim();
    if (trimmedLog) {
        lines.push('--- output ---', truncateTeamMailboxLog(trimmedLog));
    } else if (task.state === 'completed') {
        lines.push('(no output captured)');
    }
    return lines.join('\n');
}

export function isTeamSynthesisUserMessage(content: string): boolean {
    return content.trimStart().startsWith(TEAM_SYNTHESIS_USER_PREFIX);
}

/** True when `task` is a descendant of `leaderTaskId` via {@link parentId} links. */
export function isSubtaskOfLeader(
    task: TeamTaskParentRef,
    leaderTaskId: string,
    tasks: readonly TeamTaskParentRef[],
): boolean {
    let parentId = task.parentId;
    if (!parentId) {
        return false;
    }
    const byId = new Map(tasks.map(entry => [entry.id, entry]));
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        if (parentId === leaderTaskId) {
            return true;
        }
        parentId = byId.get(parentId)?.parentId;
    }
    return false;
}

export function collectSubtasksForLeader(
    leaderTaskId: string,
    tasks: readonly TeamTaskParentRef[],
): TeamTaskParentRef[] {
    return tasks.filter(task => isSubtaskOfLeader(task, leaderTaskId, tasks));
}

/** Requires at least one subtask and every one in a terminal state. */
export function areAllSubtasksSettled(subtasks: readonly Pick<TeamTaskParentRef, 'state'>[]): boolean {
    if (subtasks.length === 0) {
        return false;
    }
    return subtasks.every(task => isQaapAgentTaskFinished(task.state));
}

export function countFailedSubtasks(subtasks: readonly Pick<TeamTaskParentRef, 'state'>[]): number {
    return subtasks.filter(task => task.state === 'failed' || task.state === 'interrupted').length;
}

export function buildTeamSynthesisUserMessage(subtaskCount: number, failedCount: number): string {
    const summary = failedCount > 0
        ? `${subtaskCount} delegated sub-tasks finished (${failedCount} failed).`
        : `${subtaskCount} delegated sub-tasks finished successfully.`;
    return [
        TEAM_SYNTHESIS_USER_PREFIX,
        `${summary} Review the subtask messages above, integrate their results into your plan, and continue the original goal.`,
        'Summarize what was done, what failed, and your next steps. Do not delegate further sub-tasks unless strictly necessary.',
    ].join('\n');
}
