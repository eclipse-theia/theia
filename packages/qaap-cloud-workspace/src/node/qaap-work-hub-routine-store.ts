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
    normalizeRoutineIntervalHours,
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
            trigger: 'interval',
            intervalHours: 24,
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
            title: 'Weekly drift check',
            prompt: 'Run the qaap drift check script and summarize files that differ from upstream outside packages/qaap-*.',
            cwd,
            agent: 'qaiq',
            trigger: 'interval',
            intervalHours: 168,
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
        const routine: QaapWorkHubRoutine = {
            id: randomUUID(),
            title: body.title.trim(),
            prompt: body.prompt.trim(),
            cwd: body.cwd.trim(),
            agent: body.agent?.trim() || undefined,
            trigger: body.trigger ?? 'manual',
            intervalHours: normalizeRoutineIntervalHours(body.intervalHours),
            enabled: body.enabled === true,
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
        const next: QaapWorkHubRoutine = {
            ...existing,
            title: patch.title !== undefined ? patch.title.trim() : existing.title,
            prompt: patch.prompt !== undefined ? patch.prompt.trim() : existing.prompt,
            cwd: patch.cwd !== undefined ? patch.cwd.trim() : existing.cwd,
            agent: patch.agent !== undefined ? (patch.agent.trim() || undefined) : existing.agent,
            trigger: patch.trigger ?? existing.trigger,
            intervalHours: patch.intervalHours !== undefined
                ? normalizeRoutineIntervalHours(patch.intervalHours)
                : existing.intervalHours,
            enabled: patch.enabled !== undefined ? patch.enabled : existing.enabled,
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

    markRunStarted(id: string, taskId: string): QaapWorkHubRoutine | undefined {
        const existing = this.routines.get(id);
        if (!existing) {
            return undefined;
        }
        const next: QaapWorkHubRoutine = {
            ...existing,
            lastRunAt: Date.now(),
            lastRunTaskId: taskId,
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
                    this.routines.set(routine.id, routine);
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
