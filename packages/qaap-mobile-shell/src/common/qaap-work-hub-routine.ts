// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** HTTP base path for Work Hub routines (implemented in `@theia/qaap-cloud-workspace`). */
export const QAAP_WORK_HUB_ROUTINE_API_PATH = '/qaap/api/work-hub-routines';

export type QaapWorkHubRoutineTrigger = 'manual' | 'interval';

export type QaapWorkHubRoutineLastRunState = 'running' | 'completed' | 'failed';

export interface QaapWorkHubRoutine {
    readonly id: string;
    readonly title: string;
    readonly prompt: string;
    /** Absolute path where the VPS agent runs. */
    readonly cwd: string;
    readonly agent?: string;
    readonly trigger: QaapWorkHubRoutineTrigger;
    /** Used when {@link trigger} is `interval` (minimum 1 hour). */
    readonly intervalHours: number;
    readonly enabled: boolean;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly lastRunAt?: number;
    readonly lastRunTaskId?: string;
    readonly lastRunState?: QaapWorkHubRoutineLastRunState;
}

export interface QaapWorkHubRoutineListResponse {
    readonly routines: QaapWorkHubRoutine[];
    readonly agentConfigured: boolean;
    readonly defaultAgent?: string;
}

export interface QaapCreateWorkHubRoutineBody {
    readonly title: string;
    readonly prompt: string;
    readonly cwd: string;
    readonly agent?: string;
    readonly trigger?: QaapWorkHubRoutineTrigger;
    readonly intervalHours?: number;
    readonly enabled?: boolean;
}

export interface QaapUpdateWorkHubRoutineBody {
    readonly title?: string;
    readonly prompt?: string;
    readonly cwd?: string;
    readonly agent?: string;
    readonly trigger?: QaapWorkHubRoutineTrigger;
    readonly intervalHours?: number;
    readonly enabled?: boolean;
}

export function normalizeRoutineIntervalHours(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value)) {
        return 24;
    }
    return Math.max(1, Math.min(24 * 7, Math.floor(value)));
}

export function routineScheduleLabel(routine: QaapWorkHubRoutine): string {
    if (routine.trigger === 'manual') {
        return 'Manual';
    }
    const hours = routine.intervalHours;
    if (hours === 1) {
        return 'Every hour';
    }
    if (hours === 24) {
        return 'Daily';
    }
    if (hours % 24 === 0) {
        const days = hours / 24;
        return days === 1 ? 'Daily' : `Every ${days} days`;
    }
    return `Every ${hours} h`;
}

export function routineIsDue(routine: QaapWorkHubRoutine, now = Date.now()): boolean {
    if (!routine.enabled || routine.trigger !== 'interval') {
        return false;
    }
    if (routine.lastRunState === 'running') {
        return false;
    }
    const last = routine.lastRunAt ?? 0;
    const intervalMs = normalizeRoutineIntervalHours(routine.intervalHours) * 60 * 60 * 1000;
    return now - last >= intervalMs;
}

export function filterRoutinesByQuery(routines: readonly QaapWorkHubRoutine[], query: string): QaapWorkHubRoutine[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return [...routines];
    }
    return routines.filter(routine =>
        routine.title.toLowerCase().includes(normalized)
        || routine.prompt.toLowerCase().includes(normalized)
        || routine.cwd.toLowerCase().includes(normalized)
        || routineScheduleLabel(routine).toLowerCase().includes(normalized),
    );
}
