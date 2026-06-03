// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export type WorkHubUsageTimeRange = 'all' | '30d' | '7d';

export type WorkHubUsageTab = 'summary' | 'models';

export interface WorkHubUsageMetric {
    readonly label: string;
    readonly value: string;
}

export interface WorkHubUsageHeatmapCell {
    readonly date: string;
    readonly level: 0 | 1 | 2 | 3 | 4;
}

export interface WorkHubUsageModelRow {
    readonly modelId: string;
    readonly label: string;
    readonly tokens: number;
}

export interface WorkHubHomeUsageSummary {
    readonly metricsByRange: Record<WorkHubUsageTimeRange, readonly WorkHubUsageMetric[]>;
    readonly heatmapByRange: Record<WorkHubUsageTimeRange, readonly WorkHubUsageHeatmapCell[]>;
    readonly models: readonly WorkHubUsageModelRow[];
    readonly footnote?: string;
}

export interface WorkHubUsageActivityEvent {
    readonly updatedAt: number;
    readonly createdAt: number;
    readonly messageCount: number;
}

const DAY_MS = 86_400_000;
const RANGE_MS: Record<Exclude<WorkHubUsageTimeRange, 'all'>, number> = {
    '30d': 30 * DAY_MS,
    '7d': 7 * DAY_MS,
};

export function buildWorkHubHomeUsageSummary(
    events: readonly WorkHubUsageActivityEvent[],
    options: {
        readonly now?: number;
        readonly heatmapWeeks?: number;
        readonly favoriteModelLabel?: string;
        readonly footnote?: string;
    } = {},
): WorkHubHomeUsageSummary {
    const now = options.now ?? Date.now();
    const heatmapWeeks = Math.max(8, options.heatmapWeeks ?? 26);
    const metricsByRange = {
        all: buildUsageMetrics(events, 'all', now, options.favoriteModelLabel),
        '30d': buildUsageMetrics(events, '30d', now, options.favoriteModelLabel),
        '7d': buildUsageMetrics(events, '7d', now, options.favoriteModelLabel),
    } satisfies Record<WorkHubUsageTimeRange, readonly WorkHubUsageMetric[]>;
    const heatmapByRange = {
        all: buildUsageHeatmap(events, 'all', now, heatmapWeeks),
        '30d': buildUsageHeatmap(events, '30d', now, heatmapWeeks),
        '7d': buildUsageHeatmap(events, '7d', now, heatmapWeeks),
    } satisfies Record<WorkHubUsageTimeRange, readonly WorkHubUsageHeatmapCell[]>;
    return {
        metricsByRange,
        heatmapByRange,
        models: buildUsageModelRows(events, now),
        footnote: options.footnote,
    };
}

export function formatWorkHubUsageCount(value: number, locale = 'es'): string {
    if (!Number.isFinite(value) || value <= 0) {
        return '0';
    }
    return new Intl.NumberFormat(locale).format(Math.round(value));
}

export function formatWorkHubUsageTokens(value: number, locale = 'es'): string {
    if (!Number.isFinite(value) || value <= 0) {
        return '0';
    }
    const abs = Math.abs(value);
    if (abs >= 1_000_000) {
        const scaled = value / 1_000_000;
        const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 1;
        return `${scaled.toFixed(digits).replace('.', ',')}M`;
    }
    if (abs >= 1_000) {
        const scaled = value / 1_000;
        const digits = scaled >= 100 ? 0 : 1;
        return `${scaled.toFixed(digits).replace('.', ',')}k`;
    }
    return formatWorkHubUsageCount(value, locale);
}

function buildUsageMetrics(
    events: readonly WorkHubUsageActivityEvent[],
    range: WorkHubUsageTimeRange,
    now: number,
    favoriteModelLabel?: string,
): WorkHubUsageMetric[] {
    const filtered = filterEventsByRange(events, range, now);
    const sessions = filtered.length;
    const messages = filtered.reduce((sum, event) => sum + Math.max(0, event.messageCount), 0);
    const tokens = messages * 600;
    const activeDays = countActiveDays(filtered, now);
    const { currentStreak, longestStreak } = computeStreaks(filtered, now);
    const peakHour = computePeakHour(filtered, now);
    return [
        { label: 'sessions', value: formatWorkHubUsageCount(sessions) },
        { label: 'messages', value: formatWorkHubUsageCount(messages) },
        { label: 'tokens', value: formatWorkHubUsageTokens(tokens) },
        { label: 'activeDays', value: formatWorkHubUsageCount(activeDays) },
        { label: 'currentStreak', value: currentStreak > 0 ? `${currentStreak}d` : '0' },
        { label: 'longestStreak', value: longestStreak > 0 ? `${longestStreak}d` : '0' },
        { label: 'peakHour', value: String(peakHour) },
        { label: 'favoriteModel', value: favoriteModelLabel?.trim() || '—' },
    ];
}

function buildUsageModelRows(
    events: readonly WorkHubUsageActivityEvent[],
    now: number,
): WorkHubUsageModelRow[] {
    const filtered = filterEventsByRange(events, 'all', now);
    if (filtered.length === 0) {
        return [];
    }
    const tokens = filtered.reduce((sum, event) => sum + Math.max(0, event.messageCount) * 600, 0);
    return [{
        modelId: 'aggregate',
        label: 'All activity',
        tokens,
    }];
}

function buildUsageHeatmap(
    events: readonly WorkHubUsageActivityEvent[],
    range: WorkHubUsageTimeRange,
    now: number,
    weeks: number,
): WorkHubUsageHeatmapCell[] {
    const filtered = filterEventsByRange(events, range, now);
    const counts = new Map<string, number>();
    for (const event of filtered) {
        const key = toUtcDateKey(event.updatedAt > 0 ? event.updatedAt : event.createdAt);
        counts.set(key, (counts.get(key) ?? 0) + Math.max(1, event.messageCount));
    }
    const totalDays = weeks * 7;
    const end = startOfUtcDay(now);
    const cells: WorkHubUsageHeatmapCell[] = [];
    for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
        const date = new Date(end - offset * DAY_MS);
        const key = toUtcDateKey(date.getTime());
        const count = counts.get(key) ?? 0;
        cells.push({ date: key, level: activityLevel(count) });
    }
    return cells;
}

function filterEventsByRange(
    events: readonly WorkHubUsageActivityEvent[],
    range: WorkHubUsageTimeRange,
    now: number,
): WorkHubUsageActivityEvent[] {
    if (range === 'all') {
        return [...events];
    }
    const cutoff = now - RANGE_MS[range];
    return events.filter(event => Math.max(event.updatedAt, event.createdAt) >= cutoff);
}

function countActiveDays(events: readonly WorkHubUsageActivityEvent[], now: number): number {
    const days = new Set<string>();
    for (const event of events) {
        const stamp = event.updatedAt > 0 ? event.updatedAt : event.createdAt;
        if (stamp > 0 && stamp <= now) {
            days.add(toUtcDateKey(stamp));
        }
    }
    return days.size;
}

function computeStreaks(
    events: readonly WorkHubUsageActivityEvent[],
    now: number,
): { readonly currentStreak: number; readonly longestStreak: number } {
    const dayKeys = new Set<string>();
    for (const event of events) {
        const stamp = event.updatedAt > 0 ? event.updatedAt : event.createdAt;
        if (stamp > 0 && stamp <= now) {
            dayKeys.add(toUtcDateKey(stamp));
        }
    }
    if (dayKeys.size === 0) {
        return { currentStreak: 0, longestStreak: 0 };
    }
    const sorted = [...dayKeys].sort();
    let longest = 1;
    let run = 1;
    for (let i = 1; i < sorted.length; i += 1) {
        const prev = Date.parse(`${sorted[i - 1]}T00:00:00.000Z`);
        const current = Date.parse(`${sorted[i]}T00:00:00.000Z`);
        if (current - prev === DAY_MS) {
            run += 1;
            longest = Math.max(longest, run);
        } else {
            run = 1;
        }
    }
    let currentStreak = 0;
    const today = toUtcDateKey(now);
    let cursor = today;
    while (dayKeys.has(cursor)) {
        currentStreak += 1;
        cursor = toUtcDateKey(Date.parse(`${cursor}T00:00:00.000Z`) - DAY_MS);
    }
    return { currentStreak, longestStreak: longest };
}

function computePeakHour(events: readonly WorkHubUsageActivityEvent[], now: number): number {
    const buckets = new Array<number>(24).fill(0);
    for (const event of events) {
        const stamp = event.updatedAt > 0 ? event.updatedAt : event.createdAt;
        if (stamp <= 0 || stamp > now) {
            continue;
        }
        buckets[new Date(stamp).getHours()] += Math.max(1, event.messageCount);
    }
    let peak = 0;
    let hour = 0;
    for (let i = 0; i < buckets.length; i += 1) {
        if (buckets[i] > peak) {
            peak = buckets[i];
            hour = i;
        }
    }
    return hour;
}

function activityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count <= 0) {
        return 0;
    }
    if (count < 5) {
        return 1;
    }
    if (count < 20) {
        return 2;
    }
    if (count < 60) {
        return 3;
    }
    return 4;
}

function startOfUtcDay(now: number): number {
    const date = new Date(now);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function toUtcDateKey(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
