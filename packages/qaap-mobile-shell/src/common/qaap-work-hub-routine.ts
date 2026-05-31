// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    cronSlotIsDue,
    formatCronScheduleLabel,
    normalizeRoutineCronExpression,
    normalizeRoutineTimezone,
} from './qaap-work-hub-cron';

/** HTTP base path for Work Hub routines (implemented in `@theia/qaap-cloud-workspace`). */
export const QAAP_WORK_HUB_ROUTINE_API_PATH = '/qaap/api/work-hub-routines';

export type QaapWorkHubRoutineTrigger = 'manual' | 'interval' | 'cron';

/** How scheduled runs attach to agent sessions. */
export type QaapWorkHubRoutineRunMode =
    /** Spawn a standalone background task each run (default). */
    | 'fresh'
    /** Continue the last conversation thread when available. */
    | 'continue';

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
    /** Standard five-field cron when {@link trigger} is `cron`. */
    readonly cronExpression?: string;
    /** IANA timezone for cron evaluation (default UTC). */
    readonly timezone?: string;
    /** When true, disable the routine after the first scheduled fire. */
    readonly oneShot?: boolean;
    readonly runMode?: QaapWorkHubRoutineRunMode;
    readonly enabled: boolean;
    /**
     * YOLO / full-auto — bypass agent CLI permission prompts (default on for routines).
     * Set `false` only when you intend to babysit the run interactively.
     */
    readonly autoApprove?: boolean;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly lastRunAt?: number;
    readonly lastRunTaskId?: string;
    /** Set when {@link runMode} is `continue` — reused on the next scheduled run. */
    readonly lastRunConversationId?: string;
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
    readonly cronExpression?: string;
    readonly timezone?: string;
    readonly oneShot?: boolean;
    readonly runMode?: QaapWorkHubRoutineRunMode;
    readonly enabled?: boolean;
    readonly autoApprove?: boolean;
}

export interface QaapUpdateWorkHubRoutineBody {
    readonly title?: string;
    readonly prompt?: string;
    readonly cwd?: string;
    readonly agent?: string;
    readonly trigger?: QaapWorkHubRoutineTrigger;
    readonly intervalHours?: number;
    readonly cronExpression?: string;
    readonly timezone?: string;
    readonly oneShot?: boolean;
    readonly runMode?: QaapWorkHubRoutineRunMode;
    readonly enabled?: boolean;
    readonly autoApprove?: boolean;
}

export function normalizeRoutineIntervalHours(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value)) {
        return 24;
    }
    return Math.max(1, Math.min(24 * 7, Math.floor(value)));
}

export function normalizeRoutineRunMode(value: QaapWorkHubRoutineRunMode | undefined): QaapWorkHubRoutineRunMode {
    return value === 'continue' ? 'continue' : 'fresh';
}

export function routineScheduleLabel(routine: QaapWorkHubRoutine): string {
    if (routine.trigger === 'manual') {
        return 'Manual';
    }
    if (routine.trigger === 'cron') {
        return formatCronScheduleLabel(
            normalizeRoutineCronExpression(routine.cronExpression),
            normalizeRoutineTimezone(routine.timezone),
            routine.oneShot,
        );
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
    if (!routine.enabled) {
        return false;
    }
    if (routine.lastRunState === 'running') {
        return false;
    }
    if (routine.trigger === 'interval') {
        const last = routine.lastRunAt ?? 0;
        const intervalMs = normalizeRoutineIntervalHours(routine.intervalHours) * 60 * 60 * 1000;
        return now - last >= intervalMs;
    }
    if (routine.trigger === 'cron') {
        return cronSlotIsDue(
            normalizeRoutineCronExpression(routine.cronExpression),
            normalizeRoutineTimezone(routine.timezone),
            routine.lastRunAt,
            now,
        );
    }
    return false;
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
        || routineScheduleLabel(routine).toLowerCase().includes(normalized)
        || (routine.cronExpression?.toLowerCase().includes(normalized) ?? false),
    );
}
