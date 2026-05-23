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
const ALL_URL = `${AGENT_TASK_API_PATH}/all`;
const STREAM_URL = `${AGENT_TASK_API_PATH}/stream`;
/** Backoff when the stream drops — long enough to be cheap, short enough to feel live. */
const RECONNECT_DELAY_MS = 5_000;

/** Minimal shape of a task as it arrives over SSE — only the fields the dashboard needs. */
interface TaskEventPayload {
    readonly id: string;
    readonly cwd: string;
    readonly state: string;
    readonly title?: string;
    readonly createdAt?: number;
}

export interface MobileProjectAgentDescriptor {
    readonly id: string;
    readonly label: string;
    readonly available: boolean;
}

interface AllResponsePayload {
    readonly groups?: ReadonlyArray<{
        readonly cwd: string;
        readonly activeCount: number;
        readonly tasks: ReadonlyArray<TaskEventPayload>;
    }>;
    readonly agentConfigured?: boolean;
    readonly agents?: ReadonlyArray<MobileProjectAgentDescriptor>;
    readonly defaultAgent?: string;
}

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
 * Listens to the cross-project agent-task stream and exposes a live view of what is running on
 * the VPS, keyed by absolute working directory. The projects panel consults this to flip cards
 * to a `working` state without polling.
 */
@injectable()
export class MobileProjectsActiveTasks {

    /** Active-task info keyed by normalized cwd. */
    protected readonly activeByCwd = new Map<string, MobileProjectActiveTaskInfo>();
    protected source: EventSource | undefined;
    protected reconnectHandle: number | undefined;
    protected started = false;
    protected agents: MobileProjectAgentDescriptor[] = [];
    protected agentConfigured = false;
    protected defaultAgentId = 'shell';

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fires whenever the set of active tasks changes (task created, completed, or cancelled). */
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    /** Idempotent — safe to call from multiple consumers. The first call opens the SSE stream. */
    start(): void {
        if (this.started) {
            return;
        }
        this.started = true;
        void this.primeFromAll();
        this.openStream();
    }

    getForCwd(cwd: string): MobileProjectActiveTaskInfo | undefined {
        return this.activeByCwd.get(cwd);
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
     * succeeds. The SSE `created` event may arrive later; matching by task id keeps it idempotent.
     */
    recordTaskCreated(task: TaskEventPayload): void {
        this.applyEvent('created', task);
    }

    /** Optimistic local update after a user cancels a task from the dashboard. */
    recordTaskEnded(task: TaskEventPayload): void {
        this.applyEvent('cancelled', task);
    }

    /** Fetch the initial snapshot so the dashboard renders correctly before any SSE event arrives. */
    protected async primeFromAll(): Promise<void> {
        try {
            const response = await fetch(ALL_URL, { credentials: 'same-origin' });
            if (!response.ok) {
                return;
            }
            const payload = await response.json() as AllResponsePayload;
            this.agents = [...(payload.agents ?? [])];
            this.agentConfigured = payload.agentConfigured === true;
            this.defaultAgentId = payload.defaultAgent ?? this.agents[0]?.id ?? 'shell';
            const next = new Map<string, MobileProjectActiveTaskInfo>();
            for (const group of payload.groups ?? []) {
                if (group.activeCount <= 0) {
                    continue;
                }
                const running = group.tasks.find(task => task.state === 'running');
                next.set(group.cwd, {
                    activeCount: group.activeCount,
                    taskId: running?.id,
                    title: running?.title,
                });
            }
            this.replaceActive(next);
        } catch {
            /* network errors silently ignored — SSE will reconcile when it connects */
        }
    }

    protected openStream(): void {
        if (typeof EventSource === 'undefined') {
            return;
        }
        try {
            const source = new EventSource(STREAM_URL);
            this.source = source;
            const onEvent = (event: MessageEvent, type: 'created' | 'completed' | 'cancelled'): void => {
                try {
                    const task = JSON.parse(event.data) as TaskEventPayload;
                    this.applyEvent(type, task);
                } catch {
                    /* malformed payload — drop */
                }
            };
            source.addEventListener('created', ev => onEvent(ev as MessageEvent, 'created'));
            source.addEventListener('completed', ev => onEvent(ev as MessageEvent, 'completed'));
            source.addEventListener('cancelled', ev => onEvent(ev as MessageEvent, 'cancelled'));
            source.addEventListener('error', () => this.scheduleReconnect());
        } catch {
            this.scheduleReconnect();
        }
    }

    protected scheduleReconnect(): void {
        if (this.reconnectHandle !== undefined) {
            return;
        }
        this.source?.close();
        this.source = undefined;
        this.reconnectHandle = window.setTimeout(() => {
            this.reconnectHandle = undefined;
            this.openStream();
            // Re-prime after a reconnect so we don't drift if events fired while we were down.
            void this.primeFromAll();
        }, RECONNECT_DELAY_MS);
    }

    protected applyEvent(type: 'created' | 'completed' | 'cancelled', task: TaskEventPayload): void {
        const current = this.activeByCwd.get(task.cwd);
        if (type === 'created') {
            if (current?.taskId === task.id) {
                return;
            }
            this.activeByCwd.set(task.cwd, {
                activeCount: (current?.activeCount ?? 0) + 1,
                taskId: task.id,
                title: task.title ?? current?.title,
            });
        } else {
            const nextCount = Math.max(0, (current?.activeCount ?? 1) - 1);
            if (nextCount === 0) {
                this.activeByCwd.delete(task.cwd);
            } else {
                this.activeByCwd.set(task.cwd, {
                    activeCount: nextCount,
                    taskId: current?.taskId === task.id ? undefined : current?.taskId,
                    title: current?.title,
                });
            }
        }
        this.onDidChangeEmitter.fire();
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
