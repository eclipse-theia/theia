// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { groupAgentTasksByParent } from './qaap-agent-task-tree';

/** Minimal VPS task shape for Team aggregation (mirrors {@link MobileProjectTaskView}). */
export interface WorkHubTeamTaskInput {
    readonly id: string;
    readonly title: string;
    readonly command: string;
    readonly cwd: string;
    readonly state: string;
    readonly createdAt: number;
    readonly finishedAt?: number;
    readonly parentId?: string;
}

export type WorkHubTeamMemberKind = 'conversation' | 'leader-task' | 'subtask';

/** One row in the Work Hub Team dashboard — leader conversation, VPS task, or subtask. */
export interface WorkHubTeamMember {
    readonly id: string;
    readonly kind: WorkHubTeamMemberKind;
    readonly title: string;
    readonly projectName: string;
    readonly cwd: string;
    readonly agentId: string;
    readonly state: string;
    readonly parentId?: string;
    readonly childCount: number;
    readonly progressCurrent?: number;
    readonly progressTotal?: number;
    readonly activityLabel?: string;
    readonly linesAdded?: number;
    readonly linesRemoved?: number;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly conversationId?: string;
    readonly projectId?: string;
    /** VPS background task id — set for leader-task and subtask rows. */
    readonly taskId?: string;
}

export interface WorkHubTeamConversationInput {
    readonly projectId: string;
    readonly projectName: string;
    readonly cwd: string;
    readonly id: string;
    readonly agentId: string;
    readonly title: string;
    readonly status: 'idle' | 'streaming' | 'failed';
    readonly paused?: boolean;
    readonly activityLabel?: string;
    readonly turnProgressCurrent?: number;
    readonly turnProgressTotal?: number;
    readonly linesAdded?: number;
    readonly linesRemoved?: number;
    readonly createdAt: number;
    readonly updatedAt: number;
}

export interface CollectAgentMembersInput {
    readonly tasks: readonly WorkHubTeamTaskInput[];
    readonly conversations: readonly WorkHubTeamConversationInput[];
}

export interface WorkHubTeamTree {
    readonly roots: readonly WorkHubTeamMember[];
    readonly childrenByParent: ReadonlyMap<string, readonly WorkHubTeamMember[]>;
}

/** Aggregate streaming conversations and VPS tasks into Team dashboard rows. */
export function collectAgentMembers(input: CollectAgentMembersInput): WorkHubTeamMember[] {
    const convIdByCwd = new Map<string, string>();
    const streamingCwds = new Set<string>();
    const members: WorkHubTeamMember[] = [];
    const hiddenLeaderToConv = new Map<string, string>();

    for (const conv of input.conversations) {
        if (conv.status !== 'streaming' || conv.paused) {
            continue;
        }
        const cwd = normalizeTeamCwd(conv.cwd);
        streamingCwds.add(cwd);
        convIdByCwd.set(cwd, conv.id);
        members.push({
            id: conv.id,
            kind: 'conversation',
            title: conv.title,
            projectName: conv.projectName,
            cwd,
            agentId: conv.agentId,
            state: 'streaming',
            childCount: 0,
            progressCurrent: conv.turnProgressCurrent,
            progressTotal: conv.turnProgressTotal,
            activityLabel: conv.activityLabel,
            linesAdded: conv.linesAdded,
            linesRemoved: conv.linesRemoved,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
            conversationId: conv.id,
            projectId: conv.projectId,
        });
    }
    for (const task of input.tasks) {
        if (task.state !== 'running') {
            continue;
        }
        const cwd = normalizeTeamCwd(task.cwd);
        if (!task.parentId && streamingCwds.has(cwd)) {
            const convId = convIdByCwd.get(cwd);
            if (convId) {
                hiddenLeaderToConv.set(task.id, convId);
            }
            continue;
        }
        members.push({
            id: task.id,
            kind: task.parentId ? 'subtask' : 'leader-task',
            title: task.title,
            projectName: basenameFromCwd(task.cwd),
            cwd,
            agentId: inferAgentIdFromCommand(task.command),
            state: task.state,
            parentId: task.parentId,
            childCount: 0,
            createdAt: task.createdAt,
            updatedAt: task.finishedAt ?? task.createdAt,
            taskId: task.id,
        });
    }
    const remapped = members.map(member => {
        if (member.kind !== 'subtask' || !member.parentId) {
            return member;
        }
        const convId = hiddenLeaderToConv.get(member.parentId);
        return convId ? { ...member, parentId: convId } : member;
    });
    return attachChildCounts(remapped);
}

export function buildTeamTree(members: readonly WorkHubTeamMember[]): WorkHubTeamTree {
    const grouped = groupAgentTasksByParent(members);
    return { roots: sortTeamMembers(grouped.roots), childrenByParent: grouped.childrenByParent };
}

export function filterTeamMembers(members: readonly WorkHubTeamMember[], query: string): WorkHubTeamMember[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return [...members];
    }
    return members.filter(member =>
        member.title.toLowerCase().includes(normalized)
        || member.projectName.toLowerCase().includes(normalized)
        || member.agentId.toLowerCase().includes(normalized)
        || member.activityLabel?.toLowerCase().includes(normalized),
    );
}

/** Keep parent/child rows visible together when search matches either side. */
export function filterTeamMembersForDisplay(members: readonly WorkHubTeamMember[], query: string): WorkHubTeamMember[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return [...members];
    }
    const matched = filterTeamMembers(members, query);
    const included = new Set(matched.map(member => member.id));
    for (const member of matched) {
        if (member.parentId) {
            included.add(member.parentId);
        }
    }
    let expanded = true;
    while (expanded) {
        expanded = false;
        for (const member of members) {
            if (member.parentId && included.has(member.parentId) && !included.has(member.id)) {
                included.add(member.id);
                expanded = true;
            }
        }
    }
    return members.filter(member => included.has(member.id));
}

export function countRunningTeamMembers(members: readonly WorkHubTeamMember[]): number {
    return members.filter(member => member.state === 'running' || member.state === 'streaming').length;
}

function attachChildCounts(members: WorkHubTeamMember[]): WorkHubTeamMember[] {
    const childCounts = new Map<string, number>();
    for (const member of members) {
        if (!member.parentId) {
            continue;
        }
        childCounts.set(member.parentId, (childCounts.get(member.parentId) ?? 0) + 1);
    }
    return members.map(member => ({
        ...member,
        childCount: childCounts.get(member.id) ?? member.childCount,
    }));
}

function sortTeamMembers(members: readonly WorkHubTeamMember[]): WorkHubTeamMember[] {
    return [...members].sort((a, b) => {
        const aActive = a.state === 'running' || a.state === 'streaming' ? 1 : 0;
        const bActive = b.state === 'running' || b.state === 'streaming' ? 1 : 0;
        if (aActive !== bActive) {
            return bActive - aActive;
        }
        return b.updatedAt - a.updatedAt;
    });
}

function basenameFromCwd(cwd: string): string {
    const normalized = normalizeTeamCwd(cwd);
    const parts = normalized.split('/');
    return parts[parts.length - 1] || normalized;
}

function normalizeTeamCwd(cwd: string): string {
    let normalized = cwd.replace(/\\/g, '/');
    while (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

function inferAgentIdFromCommand(command: string): string {
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
    if (/\bopencode\b/.test(command)) {
        return 'opencode';
    }
    if (/\bgoose\b/.test(command)) {
        return 'goose';
    }
    if (/\bhermes\b/.test(command)) {
        return 'hermes';
    }
    if (/\bopenclaw\b/.test(command)) {
        return 'openclaw';
    }
    if (/\bcursor-agent\b/.test(command)) {
        return 'cursor';
    }
    if (/\bgemini\b/.test(command)) {
        return 'gemini';
    }
    if (/\bcopilot\b/.test(command)) {
        return 'copilot';
    }
    if (/\bqwen\b/.test(command)) {
        return 'qwen';
    }
    if (/\bkimi\b/.test(command)) {
        return 'kimi';
    }
    return 'shell';
}
