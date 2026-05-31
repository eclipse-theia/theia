// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CronExpressionParser } from 'cron-parser';

/** Well-known cron presets for the routine editor. */
export const QAAP_ROUTINE_CRON_PRESETS: ReadonlyArray<{ readonly label: string; readonly expression: string }> = [
    { label: 'Daily at 6:00', expression: '0 6 * * *' },
    { label: 'Weekdays at 8:00', expression: '0 8 * * 1-5' },
    { label: 'Weekly (Sun 3:00)', expression: '0 3 * * 0' },
    { label: 'Every hour', expression: '0 * * * *' },
];

const DEFAULT_TIMEZONE = 'UTC';

export function normalizeRoutineTimezone(value: string | undefined): string {
    const trimmed = (value ?? DEFAULT_TIMEZONE).trim();
    if (!trimmed) {
        return DEFAULT_TIMEZONE;
    }
    try {
        Intl.DateTimeFormat(undefined, { timeZone: trimmed });
        return trimmed;
    } catch {
        return DEFAULT_TIMEZONE;
    }
}

export function normalizeRoutineCronExpression(value: string | undefined): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
        return QAAP_ROUTINE_CRON_PRESETS[0].expression;
    }
    if (!isValidCronExpression(trimmed)) {
        return QAAP_ROUTINE_CRON_PRESETS[0].expression;
    }
    return trimmed;
}

export function isValidCronExpression(expression: string): boolean {
    try {
        CronExpressionParser.parse(expression, { tz: DEFAULT_TIMEZONE });
        return true;
    } catch {
        return false;
    }
}

/** Most recent cron fire at or before {@link at}. */
export function lastCronFireAt(expression: string, timezone: string, at: Date): Date | undefined {
    try {
        const interval = CronExpressionParser.parse(expression, {
            currentDate: at,
            tz: normalizeRoutineTimezone(timezone),
        });
        return interval.prev().toDate();
    } catch {
        return undefined;
    }
}

/** Next cron fire strictly after {@link from}. */
export function nextCronFireAt(expression: string, timezone: string, from: Date): Date | undefined {
    try {
        const interval = CronExpressionParser.parse(expression, {
            currentDate: from,
            tz: normalizeRoutineTimezone(timezone),
        });
        return interval.next().toDate();
    } catch {
        return undefined;
    }
}

export function formatCronScheduleLabel(expression: string, timezone: string, oneShot?: boolean): string {
    const tz = normalizeRoutineTimezone(timezone);
    const preset = QAAP_ROUTINE_CRON_PRESETS.find(p => p.expression === expression);
    const base = preset?.label ?? `Cron \`${expression}\``;
    const suffix = oneShot ? ' · once' : '';
    return tz === DEFAULT_TIMEZONE ? `${base}${suffix}` : `${base} (${tz})${suffix}`;
}

export function cronSlotIsDue(
    expression: string,
    timezone: string,
    lastRunAt: number | undefined,
    now: number,
): boolean {
    const lastFire = lastCronFireAt(expression, timezone, new Date(now));
    if (!lastFire) {
        return false;
    }
    const lastRun = lastRunAt ?? 0;
    return lastFire.getTime() > lastRun;
}
