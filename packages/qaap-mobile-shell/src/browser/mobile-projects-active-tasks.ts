// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';
import { injectable } from '@theia/core/shared/inversify';

/**
 * HTTP contract with `@theia/qaap-cloud-workspace`. The string is duplicated here on purpose:
 * cloud-workspace already depends on mobile-shell, so we cannot import the constant from there
 * without a dependency cycle. Keep in sync with `QAAP_AGENT_TASK_API_PATH`.
 */
const AGENT_TASK_API_PATH = '/qaap/api/agent-tasks';
const WS_PATH = `${AGENT_TASK_API_PATH}/ws`;

/** Exponential backoff cap for WebSocket reconnects. */
const RECONNECT_MAX_MS = 30_000;

/** Task row as shown in the mobile Projects panel (mirrors VPS agent-task API). */
export interface MobileProjectTaskView {
    readonly id: string;
    readonly title: string;
    readonly command: string;
    readonly cwd: string;
    readonly state: string;
    readonly createdAt: number;
    readonly finishedAt?: number;
    /** Set when spawned by a leader via `qaap-task`. */
    readonly parentId?: string;
}

interface TaskEventPayload {
    readonly id: string;
    readonly cwd: string;
    readonly state: string;
    readonly title?: string;
    readonly command?: string;
    readonly createdAt?: number;
    readonly finishedAt?: number;
    readonly parentId?: string;
}

export interface MobileProjectAgentDescriptor {
    readonly id: string;
    readonly label: string;
    readonly available: boolean;
}

interface SnapshotPayload {
    readonly groups?: ReadonlyArray<{
        readonly cwd: string;
        readonly activeCount: number;
        readonly tasks: ReadonlyArray<TaskEventPayload>;
    }>;
    readonly agentConfigured?: boolean;
    readonly agents?: ReadonlyArray<MobileProjectAgentDescriptor>;
    readonly defaultAgent?: string;
}

type WsServerMessage =
    | ({ readonly type: 'snapshot' } & SnapshotPayload)
    | { readonly type: 'created' | 'completed' | 'cancelled'; readonly task: TaskEventPayload }
    | { readonly type: 'output'; readonly task: TaskEventPayload; readonly chunk: string };

/** Snapshot of what's running in one project. */
export interface MobileProjectActiveTaskInfo {
    /** Number of tasks currently in the `'running'` state for this cwd. */
    readonly activeCount: number;
    /** Id of the most recent running task — used for cancel/log quick actions. */
    readonly taskId?: string;
    /** Title of the most recent running task — used as the card subtitle. */
    readonly title?: string;
}

/**
 * Listens to the cross-project agent-task WebSocket and exposes a live view of what is running on
 * the VPS, keyed by absolute working directory. The projects panel consults this to flip cards
 * to a `working` state without polling.
 *
 * The first message from the server is always a `snapshot` that primes the full state, eliminating
 * the separate HTTP `/all` fetch that the previous SSE approach required. Reconnects use
 * exponential backoff (1 s → 2 s → 4 s → … → 30 s cap).
 */
@injectable()
export class MobileProjectsActiveTasks {

    /** Active-task summary keyed by normalized cwd. */
    protected readonly activeByCwd = new Map<string, MobileProjectActiveTaskInfo>();
    /** Full task lists per cwd (newest first), for the expanded project task block. */
    protected readonly tasksByCwd = new Map<string, MobileProjectTaskView[]>();
    protected socket: WebSocket | undefined;
    protected reconnectHandle: number | undefined;
    protected reconnectAttempt = 0;
    protected started = false;
    protected agents: MobileProjectAgentDescriptor[] = [];
    protected agentConfigured = false;
    protected defaultAgentId = 'shell';

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fires whenever the set of active tasks changes (task created, completed, or cancelled). */
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    /** Idempotent — safe to call from multiple consumers. The first call opens the WebSocket. */
    start(): void {
        if (this.started) {
            return;
        }
        this.started = true;
        this.openSocket();
    }

    getForCwd(cwd: string): MobileProjectActiveTaskInfo | undefined {
        return lookupByCwd(this.activeByCwd, cwd);
    }

    /** All tasks for a project cwd, running first then newest — excludes cancelled. */
    getTasksForCwd(cwd: string): MobileProjectTaskView[] {
        return lookupByCwd(this.tasksByCwd, cwd) ?? [];
    }

    /** All VPS background tasks across every project cwd. */
    getAllTasks(): MobileProjectTaskView[] {
        const merged: MobileProjectTaskView[] = [];
        for (const tasks of this.tasksByCwd.values()) {
            merged.push(...tasks);
        }
        return sortTasks(merged);
    }

    /** Sub-tasks spawned by a leader task via `qaap-task`. */
    getChildTasksForParent(parentId: string): MobileProjectTaskView[] {
        const merged: MobileProjectTaskView[] = [];
        for (const tasks of this.tasksByCwd.values()) {
            for (const task of tasks) {
                if (task.parentId === parentId) {
                    merged.push(task);
                }
            }
        }
        return sortTasks(merged);
    }

    /**
     * Match tasks when the panel only knows repo identity (GitHub card without a local URI yet).
     * Compares normalized cwd suffixes against repo name / owner/name.
     */
    findTasksForProject(project: { readonly name: string; readonly github?: { readonly owner: string; readonly name: string } }): MobileProjectTaskView[] {
        const merged: MobileProjectTaskView[] = [];
        for (const [cwd, tasks] of this.tasksByCwd) {
            if (cwdMatchesProject(cwd, project)) {
                merged.push(...tasks);
            }
        }
        return sortTasks(merged);
    }

    getAgents(): MobileProjectAgentDescriptor[] {
        return this.agents;
    }

    getDefaultAgent(): string {
        return this.defaultAgentId;
    }

    isAgentConfigured(): boolean {
        return this.agentConfigured;
    }

    /**
     * Optimistic local update used by the dashboard composer immediately after POST /tasks
     * succeeds. The WebSocket `created` event may arrive later; matching by task id keeps it idempotent.
     */
    recordTaskCreated(task: TaskEventPayload): void {
        this.applyEvent('created', task);
    }

    /** Optimistic local update after a user cancels a task from the dashboard. */
    recordTaskEnded(task: TaskEventPayload): void {
        this.applyEvent('cancelled', task);
    }

    protected openSocket(): void {
        if (typeof WebSocket === 'undefined') {
            return;
        }
        try {
            const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const socket = new WebSocket(`${proto}//${window.location.host}${WS_PATH}`);
            this.socket = socket;

            socket.addEventListener('open', () => {
                this.reconnectAttempt = 0;
            });

            socket.addEventListener('message', ev => {
                try {
                    const msg = JSON.parse(String(ev.data)) as WsServerMessage;
                    if (msg.type === 'snapshot') {
                        this.applySnapshot(msg);
                    } else if (msg.type !== 'output') {
                        this.applyEvent(msg.type, msg.task);
                    }
                } catch {
                    /* malformed payload — drop */
                }
            });

            socket.addEventListener('close', () => this.scheduleReconnect());
            socket.addEventListener('error', () => socket.close());
        } catch {
            this.scheduleReconnect();
        }
    }

    protected scheduleReconnect(): void {
        if (this.reconnectHandle !== undefined) {
            return;
        }
        this.socket = undefined;
        const delay = Math.min(RECONNECT_MAX_MS, 1_000 * (2 ** this.reconnectAttempt));
        this.reconnectAttempt++;
        this.reconnectHandle = window.setTimeout(() => {
            this.reconnectHandle = undefined;
            this.openSocket();
        }, delay);
    }

    /** Apply a full snapshot sent by the server on WebSocket connect. */
    protected applySnapshot(payload: SnapshotPayload): void {
        this.agents = [...(payload.agents ?? [])];
        this.agentConfigured = payload.agentConfigured === true;
        this.defaultAgentId = payload.defaultAgent ?? this.agents[0]?.id ?? 'shell';
        const nextActive = new Map<string, MobileProjectActiveTaskInfo>();
        const nextTasks = new Map<string, MobileProjectTaskView[]>();
        for (const group of payload.groups ?? []) {
            const cwd = normalizeCwd(group.cwd);
            const tasks = sortTasks(
                group.tasks
                    .map(task => toTaskView(task))
                    .filter(task => task.state !== 'cancelled')
            );
            if (tasks.length > 0) {
                nextTasks.set(cwd, tasks);
            }
            if (group.activeCount > 0) {
                const running = tasks.find(task => task.state === 'running');
                nextActive.set(cwd, {
                    activeCount: group.activeCount,
                    taskId: running?.id,
                    title: running?.title,
                });
            }
        }
        this.replaceTasks(nextTasks);
        this.replaceActive(nextActive);
    }

    protected applyEvent(type: 'created' | 'completed' | 'cancelled', task: TaskEventPayload): void {
        const cwd = normalizeCwd(task.cwd);
        this.upsertTaskList({ ...task, cwd });
        const current = lookupByCwd(this.activeByCwd, cwd);
        if (type === 'created') {
            if (current?.taskId === task.id) {
                this.onDidChangeEmitter.fire();
                return;
            }
            this.activeByCwd.set(cwd, {
                activeCount: (current?.activeCount ?? 0) + 1,
                taskId: task.id,
                title: task.title ?? current?.title,
            });
        } else {
            const nextCount = Math.max(0, (current?.activeCount ?? 1) - 1);
            const tasks = this.getTasksForCwd(cwd);
            const running = tasks.find(entry => entry.state === 'running');
            if (nextCount === 0) {
                this.activeByCwd.delete(cwd);
            } else {
                this.activeByCwd.set(cwd, {
                    activeCount: nextCount,
                    taskId: running?.id,
                    title: running?.title ?? current?.title,
                });
            }
        }
        this.onDidChangeEmitter.fire();
    }

    protected upsertTaskList(task: TaskEventPayload): void {
        const cwd = normalizeCwd(task.cwd);
        const view = toTaskView({ ...task, cwd });
        const list = [...(lookupByCwd(this.tasksByCwd, cwd) ?? [])];
        const index = list.findIndex(entry => entry.id === view.id);
        if (view.state === 'cancelled') {
            if (index >= 0) {
                list.splice(index, 1);
            }
        } else if (index >= 0) {
            list[index] = { ...list[index], ...view };
        } else {
            list.unshift(view);
        }
        if (list.length === 0) {
            this.tasksByCwd.delete(cwd);
        } else {
            this.tasksByCwd.set(cwd, sortTasks(list));
        }
    }

    protected replaceActive(next: Map<string, MobileProjectActiveTaskInfo>): void {
        if (sameActive(this.activeByCwd, next)) {
            return;
        }
        this.activeByCwd.clear();
        for (const [cwd, info] of next) {
            this.activeByCwd.set(cwd, info);
        }
        this.onDidChangeEmitter.fire();
    }

    protected replaceTasks(next: Map<string, MobileProjectTaskView[]>): void {
        if (sameTasks(this.tasksByCwd, next)) {
            return;
        }
        this.tasksByCwd.clear();
        for (const [cwd, tasks] of next) {
            this.tasksByCwd.set(cwd, tasks);
        }
        this.onDidChangeEmitter.fire();
    }
}

/** @internal Exported for testing. */
export function toTaskView(task: TaskEventPayload): MobileProjectTaskView {
    const command = task.command ?? task.title ?? '';
    return {
        id: task.id,
        title: task.title || command.slice(0, 80) || 'Background task',
        command,
        cwd: normalizeCwd(task.cwd),
        state: task.state,
        createdAt: task.createdAt ?? Date.now(),
        finishedAt: task.finishedAt,
        parentId: task.parentId,
    };
}

/** @internal Exported for testing. */
export function normalizeCwd(cwd: string): string {
    let normalized = cwd.replace(/\\/g, '/');
    while (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

/** @internal Exported to avoid duplication with mobile-projects-conversations. */
export function lookupByCwd<T>(map: Map<string, T>, cwd: string): T | undefined {
    const normalized = normalizeCwd(cwd);
    const direct = map.get(normalized);
    if (direct !== undefined) {
        return direct;
    }
    for (const [key, value] of map) {
        if (normalizeCwd(key) === normalized) {
            return value;
        }
    }
    return undefined;
}

/** @internal Exported for testing. */
export function cwdMatchesProject(
    cwd: string,
    project: { readonly name: string; readonly github?: { readonly owner: string; readonly name: string } },
): boolean {
    const normalized = normalizeCwd(cwd).toLowerCase();
    const base = normalized.split('/').pop() ?? '';
    if (base === project.name.toLowerCase()) {
        return true;
    }
    if (project.github) {
        const repoPath = `${project.github.owner}/${project.github.name}`.toLowerCase();
        if (normalized.endsWith(`/${repoPath}`) || normalized.endsWith(`/repos/${repoPath}`)) {
            return true;
        }
    }
    return false;
}

/** @internal Exported for testing. */
export function sortTasks(tasks: MobileProjectTaskView[]): MobileProjectTaskView[] {
    return [...tasks].sort((a, b) => {
        const aRunning = a.state === 'running' ? 1 : 0;
        const bRunning = b.state === 'running' ? 1 : 0;
        if (aRunning !== bRunning) {
            return bRunning - aRunning;
        }
        return b.createdAt - a.createdAt;
    });
}

function sameActive(a: Map<string, MobileProjectActiveTaskInfo>, b: Map<string, MobileProjectActiveTaskInfo>): boolean {
    if (a.size !== b.size) {
        return false;
    }
    for (const [cwd, info] of a) {
        const other = b.get(cwd);
        if (!other || other.activeCount !== info.activeCount || other.taskId !== info.taskId || other.title !== info.title) {
            return false;
        }
    }
    return true;
}

function sameTasks(a: Map<string, MobileProjectTaskView[]>, b: Map<string, MobileProjectTaskView[]>): boolean {
    if (a.size !== b.size) {
        return false;
    }
    for (const [cwd, tasks] of a) {
        const other = b.get(cwd);
        if (!other || other.length !== tasks.length) {
            return false;
        }
        for (let i = 0; i < tasks.length; i++) {
            const left = tasks[i];
            const right = other[i];
            if (left.id !== right.id || left.state !== right.state || left.title !== right.title) {
                return false;
            }
        }
    }
    return true;
}
