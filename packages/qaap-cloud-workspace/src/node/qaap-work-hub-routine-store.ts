// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';
import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    normalizeRoutineCronExpression,
    normalizeRoutineTimezone,
} from '@theia/qaap-mobile-shell/lib/common/qaap-work-hub-cron';
import {
    normalizeRoutineIntervalHours,
    normalizeRoutineRunMode,
    type QaapCreateWorkHubRoutineBody,
    type QaapUpdateWorkHubRoutineBody,
    type QaapWorkHubRoutine,
    type QaapWorkHubRoutineLastRunState,
} from '@theia/qaap-mobile-shell/lib/common/qaap-work-hub-routine';

const STORE_DIR = path.join(os.homedir(), '.qaap');
const STORE_PATH = path.join(STORE_DIR, 'work-hub-routines.json');
const STORE_FILE_MODE = 0o600;
const STORE_DIR_MODE = 0o700;

interface PersistedRoutines {
    routines: QaapWorkHubRoutine[];
    seeded?: boolean;
}

function defaultCwd(): string {
    const fromEnv = process.env.QAAP_REPOS_ROOT?.trim();
    if (fromEnv) {
        return fromEnv;
    }
    return process.cwd();
}

function seedRoutines(cwd: string): QaapWorkHubRoutine[] {
    const now = Date.now();
    const base = (partial: Omit<QaapWorkHubRoutine, 'createdAt' | 'updatedAt'>): QaapWorkHubRoutine => ({
        ...partial,
        createdAt: now,
        updatedAt: now,
    });
    return [
        base({
            id: randomUUID(),
            title: 'Summarize open PRs',
            prompt: 'List open pull requests for this repository and draft a short review comment for each that needs attention.',
            cwd,
            agent: 'qaiq',
            trigger: 'cron',
            intervalHours: 24,
            cronExpression: '0 8 * * 1-5',
            timezone: 'UTC',
            runMode: 'continue',
            enabled: false,
        }),
        base({
            id: randomUUID(),
            title: 'Fix failing CI',
            prompt: 'Read the latest failed GitHub Actions workflow log for this repo, propose a minimal fix, and run the relevant test command.',
            cwd,
            agent: 'qaiq',
            trigger: 'manual',
            intervalHours: 24,
            enabled: false,
        }),
        base({
            id: randomUUID(),
            title: 'Daily drift check',
            prompt: 'Run the qaap drift check script and summarize files that differ from upstream outside packages/qaap-*.',
            cwd,
            agent: 'qaiq',
            trigger: 'cron',
            intervalHours: 24,
            cronExpression: '0 6 * * *',
            timezone: 'UTC',
            runMode: 'fresh',
            enabled: false,
        }),
        base({
            id: randomUUID(),
            title: 'Weekly workspace backup',
            prompt: 'Archive ~/.qaap and the workspace git state; report archive path and size.',
            cwd,
            agent: 'qaiq',
            trigger: 'cron',
            intervalHours: 168,
            cronExpression: '0 3 * * 0',
            timezone: 'UTC',
            runMode: 'fresh',
            enabled: false,
        }),
        base({
            id: randomUUID(),
            title: 'Nightly test sweep',
            prompt: 'Compile the monorepo and run package tests; report failures with file paths.',
            cwd,
            agent: 'qaiq',
            trigger: 'interval',
            intervalHours: 24,
            enabled: false,
        }),
    ];
}

@injectable()
export class QaapWorkHubRoutineStore {

    protected readonly routines = new Map<string, QaapWorkHubRoutine>();
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.loadFromDisk();
    }

    list(): QaapWorkHubRoutine[] {
        return [...this.routines.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    }

    get(id: string): QaapWorkHubRoutine | undefined {
        return this.routines.get(id);
    }

    create(body: QaapCreateWorkHubRoutineBody): QaapWorkHubRoutine {
        const now = Date.now();
        const trigger = body.trigger ?? 'manual';
        const routine: QaapWorkHubRoutine = {
            id: randomUUID(),
            title: body.title.trim(),
            prompt: body.prompt.trim(),
            cwd: body.cwd.trim(),
            agent: body.agent?.trim() || undefined,
            trigger,
            intervalHours: normalizeRoutineIntervalHours(body.intervalHours),
            ...(trigger === 'cron' ? {
                cronExpression: normalizeRoutineCronExpression(body.cronExpression),
                timezone: normalizeRoutineTimezone(body.timezone),
                oneShot: body.oneShot === true,
            } : {}),
            runMode: normalizeRoutineRunMode(body.runMode),
            enabled: body.enabled === true,
            autoApprove: body.autoApprove !== false,
            createdAt: now,
            updatedAt: now,
        };
        this.routines.set(routine.id, routine);
        this.persist();
        this.onDidChangeEmitter.fire();
        return routine;
    }

    update(id: string, patch: QaapUpdateWorkHubRoutineBody): QaapWorkHubRoutine | undefined {
        const existing = this.routines.get(id);
        if (!existing) {
            return undefined;
        }
        const trigger = patch.trigger ?? existing.trigger;
        const next: QaapWorkHubRoutine = {
            ...existing,
            title: patch.title !== undefined ? patch.title.trim() : existing.title,
            prompt: patch.prompt !== undefined ? patch.prompt.trim() : existing.prompt,
            cwd: patch.cwd !== undefined ? patch.cwd.trim() : existing.cwd,
            agent: patch.agent !== undefined ? (patch.agent.trim() || undefined) : existing.agent,
            trigger,
            intervalHours: patch.intervalHours !== undefined
                ? normalizeRoutineIntervalHours(patch.intervalHours)
                : existing.intervalHours,
            ...(trigger === 'cron' ? {
                cronExpression: patch.cronExpression !== undefined
                    ? normalizeRoutineCronExpression(patch.cronExpression)
                    : normalizeRoutineCronExpression(existing.cronExpression),
                timezone: patch.timezone !== undefined
                    ? normalizeRoutineTimezone(patch.timezone)
                    : normalizeRoutineTimezone(existing.timezone),
                oneShot: patch.oneShot !== undefined ? patch.oneShot === true : existing.oneShot === true,
            } : {
                cronExpression: undefined,
                timezone: undefined,
                oneShot: undefined,
            }),
            runMode: patch.runMode !== undefined
                ? normalizeRoutineRunMode(patch.runMode)
                : normalizeRoutineRunMode(existing.runMode),
            enabled: patch.enabled !== undefined ? patch.enabled : existing.enabled,
            autoApprove: patch.autoApprove !== undefined ? patch.autoApprove !== false : existing.autoApprove !== false,
            updatedAt: Date.now(),
        };
        this.routines.set(id, next);
        this.persist();
        this.onDidChangeEmitter.fire();
        return next;
    }

    delete(id: string): boolean {
        const removed = this.routines.delete(id);
        if (removed) {
            this.persist();
            this.onDidChangeEmitter.fire();
        }
        return removed;
    }

    markRunStarted(id: string, taskId: string, conversationId?: string): QaapWorkHubRoutine | undefined {
        const existing = this.routines.get(id);
        if (!existing) {
            return undefined;
        }
        const next: QaapWorkHubRoutine = {
            ...existing,
            lastRunAt: Date.now(),
            lastRunTaskId: taskId,
            lastRunConversationId: conversationId ?? existing.lastRunConversationId,
            lastRunState: 'running',
            updatedAt: Date.now(),
        };
        this.routines.set(id, next);
        this.persist();
        this.onDidChangeEmitter.fire();
        return next;
    }

    markRunFinished(id: string, state: Exclude<QaapWorkHubRoutineLastRunState, 'running'>): void {
        const existing = this.routines.get(id);
        if (!existing) {
            return;
        }
        const next: QaapWorkHubRoutine = {
            ...existing,
            lastRunState: state,
            ...(existing.oneShot ? { enabled: false } : {}),
            updatedAt: Date.now(),
        };
        this.routines.set(id, next);
        this.persist();
        this.onDidChangeEmitter.fire();
    }

    protected loadFromDisk(): void {
        try {
            if (!fs.existsSync(STORE_PATH)) {
                this.seedIfEmpty();
                return;
            }
            const raw = fs.readFileSync(STORE_PATH, 'utf8');
            const parsed = JSON.parse(raw) as PersistedRoutines;
            for (const routine of parsed.routines ?? []) {
                if (routine?.id && routine.title && routine.prompt && routine.cwd) {
                    this.routines.set(routine.id, this.normalizeLoadedRoutine(routine));
                }
            }
            if (this.routines.size === 0) {
                this.seedIfEmpty();
            }
        } catch (error) {
            console.warn('[qaap-work-hub-routines] failed to load store:', error);
            this.seedIfEmpty();
        }
    }

    protected normalizeLoadedRoutine(routine: QaapWorkHubRoutine): QaapWorkHubRoutine {
        const trigger = routine.trigger ?? 'manual';
        return {
            ...routine,
            trigger,
            intervalHours: normalizeRoutineIntervalHours(routine.intervalHours),
            runMode: normalizeRoutineRunMode(routine.runMode),
            ...(trigger === 'cron' ? {
                cronExpression: normalizeRoutineCronExpression(routine.cronExpression),
                timezone: normalizeRoutineTimezone(routine.timezone),
                oneShot: routine.oneShot === true,
            } : {}),
        };
    }

    protected seedIfEmpty(): void {
        if (this.routines.size > 0) {
            return;
        }
        for (const routine of seedRoutines(defaultCwd())) {
            this.routines.set(routine.id, routine);
        }
        this.persist(true);
    }

    protected persist(seeded = false): void {
        try {
            fs.mkdirSync(STORE_DIR, { recursive: true, mode: STORE_DIR_MODE });
            const payload: PersistedRoutines = {
                routines: this.list(),
                seeded: seeded || undefined,
            };
            fs.writeFileSync(STORE_PATH, JSON.stringify(payload, undefined, 2), { mode: STORE_FILE_MODE });
        } catch (error) {
            console.warn('[qaap-work-hub-routines] failed to persist:', error);
        }
    }
}
