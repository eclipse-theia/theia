// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    canonicalPreviewHistoryKey,
    toPreviewHistoryDisplayUrl,
} from './qaap-preview-url-utils';

export const QAAP_PREVIEW_BROWSING_HISTORY_STORAGE_KEY = 'qaap.preview.browsingHistory';
export const QAAP_PREVIEW_BOOKMARK_BAR_PREF_KEY = 'qaap.preview.showBookmarkBar';
export const QAAP_PREVIEW_HISTORY_WIDTH_STORAGE_KEY = 'qaap.preview.historyPanelWidth';

export const QAAP_PREVIEW_HISTORY_WIDTH_DEFAULT_PX = 320;
export const QAAP_PREVIEW_HISTORY_WIDTH_MIN_PX = 200;
export const QAAP_PREVIEW_HISTORY_WIDTH_MAX_PX = 520;

const MAX_ENTRIES = 200;

export interface QaapPreviewHistoryEntry {
    readonly url: string;
    readonly title: string;
    readonly visitedAt: number;
}

export type QaapPreviewHistorySectionId = 'today' | 'last7' | 'last30';

export interface QaapPreviewHistorySection {
    readonly id: QaapPreviewHistorySectionId;
    readonly labelKey: string;
    readonly defaultLabel: string;
    readonly entries: QaapPreviewHistoryEntry[];
}

export function previewHistoryEntryLabel(entry: QaapPreviewHistoryEntry): string {
    const title = entry.title?.trim();
    if (title) {
        return title;
    }
    try {
        const parsed = new URL(entry.url);
        return parsed.hostname + parsed.pathname;
    } catch {
        return entry.url;
    }
}

export function faviconUrlForPreview(entryUrl: string): string | undefined {
    try {
        const host = new URL(entryUrl).hostname;
        if (!host) {
            return undefined;
        }
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
    } catch {
        return undefined;
    }
}

export function readPreviewBrowsingHistory(): QaapPreviewHistoryEntry[] {
    if (typeof window === 'undefined') {
        return [];
    }
    try {
        const raw = window.localStorage.getItem(QAAP_PREVIEW_BROWSING_HISTORY_STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map(normalizeHistoryEntry)
            .filter((entry): entry is QaapPreviewHistoryEntry => !!entry);
    } catch {
        return [];
    }
}

export function writePreviewBrowsingHistory(entries: readonly QaapPreviewHistoryEntry[]): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(
            QAAP_PREVIEW_BROWSING_HISTORY_STORAGE_KEY,
            JSON.stringify(entries.slice(0, MAX_ENTRIES)),
        );
    } catch {
        /* quota or private mode */
    }
}

export function recordPreviewBrowsingVisit(url: string, title?: string): QaapPreviewHistoryEntry[] {
    const displayUrl = toPreviewHistoryDisplayUrl(url);
    if (!displayUrl || displayUrl === 'about:blank') {
        return readPreviewBrowsingHistory();
    }
    const historyKey = canonicalPreviewHistoryKey(displayUrl);
    const now = Date.now();
    const nextTitle = title?.trim() || previewHistoryEntryLabel({ url: displayUrl, title: '', visitedAt: now });
    const withoutDup = readPreviewBrowsingHistory().filter(
        entry => canonicalPreviewHistoryKey(entry.url) !== historyKey,
    );
    const next: QaapPreviewHistoryEntry[] = [
        { url: displayUrl, title: nextTitle, visitedAt: now },
        ...withoutDup,
    ].slice(0, MAX_ENTRIES);
    writePreviewBrowsingHistory(next);
    return next;
}

export function clearPreviewBrowsingHistory(): void {
    writePreviewBrowsingHistory([]);
}

export function readPreviewBookmarkBarVisible(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }
    try {
        return window.localStorage.getItem(QAAP_PREVIEW_BOOKMARK_BAR_PREF_KEY) === 'true';
    } catch {
        return false;
    }
}

export function writePreviewBookmarkBarVisible(visible: boolean): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(QAAP_PREVIEW_BOOKMARK_BAR_PREF_KEY, visible ? 'true' : 'false');
    } catch {
        /* ignore */
    }
}

export function groupPreviewBrowsingHistory(
    entries: readonly QaapPreviewHistoryEntry[],
    now = Date.now(),
): QaapPreviewHistorySection[] {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const todayStart = startOfToday.getTime();
    const last7Start = todayStart - 6 * 24 * 60 * 60 * 1000;
    const last30Start = todayStart - 29 * 24 * 60 * 60 * 1000;

    const today: QaapPreviewHistoryEntry[] = [];
    const last7: QaapPreviewHistoryEntry[] = [];
    const last30: QaapPreviewHistoryEntry[] = [];

    for (const entry of entries) {
        if (entry.visitedAt >= todayStart) {
            today.push(entry);
        } else if (entry.visitedAt >= last7Start) {
            last7.push(entry);
        } else if (entry.visitedAt >= last30Start) {
            last30.push(entry);
        }
    }

    const sections: QaapPreviewHistorySection[] = [];
    if (today.length) {
        sections.push({
            id: 'today',
            labelKey: 'qaap/preview/historyToday',
            defaultLabel: 'Today',
            entries: today,
        });
    }
    if (last7.length) {
        sections.push({
            id: 'last7',
            labelKey: 'qaap/preview/historyLast7',
            defaultLabel: 'Last 7 days',
            entries: last7,
        });
    }
    if (last30.length) {
        sections.push({
            id: 'last30',
            labelKey: 'qaap/preview/historyLast30',
            defaultLabel: 'Last 30 days',
            entries: last30,
        });
    }
    return sections;
}

export function clampPreviewHistoryPanelWidth(widthPx: number, containerWidthPx?: number): number {
    let max = QAAP_PREVIEW_HISTORY_WIDTH_MAX_PX;
    if (containerWidthPx !== undefined && containerWidthPx > 0) {
        max = Math.min(max, Math.round(containerWidthPx * 0.92));
    }
    max = Math.max(QAAP_PREVIEW_HISTORY_WIDTH_MIN_PX, max);
    return Math.max(QAAP_PREVIEW_HISTORY_WIDTH_MIN_PX, Math.min(max, Math.round(widthPx)));
}

export function readPreviewHistoryPanelWidth(containerWidthPx?: number): number {
    if (typeof window === 'undefined') {
        return clampPreviewHistoryPanelWidth(QAAP_PREVIEW_HISTORY_WIDTH_DEFAULT_PX, containerWidthPx);
    }
    try {
        const raw = window.localStorage.getItem(QAAP_PREVIEW_HISTORY_WIDTH_STORAGE_KEY);
        const parsed = raw ? Number(raw) : QAAP_PREVIEW_HISTORY_WIDTH_DEFAULT_PX;
        if (!Number.isFinite(parsed)) {
            return clampPreviewHistoryPanelWidth(QAAP_PREVIEW_HISTORY_WIDTH_DEFAULT_PX, containerWidthPx);
        }
        return clampPreviewHistoryPanelWidth(parsed, containerWidthPx);
    } catch {
        return clampPreviewHistoryPanelWidth(QAAP_PREVIEW_HISTORY_WIDTH_DEFAULT_PX, containerWidthPx);
    }
}

export function writePreviewHistoryPanelWidth(widthPx: number, containerWidthPx?: number): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(
            QAAP_PREVIEW_HISTORY_WIDTH_STORAGE_KEY,
            String(clampPreviewHistoryPanelWidth(widthPx, containerWidthPx)),
        );
    } catch {
        /* ignore */
    }
}

function normalizeHistoryEntry(value: unknown): QaapPreviewHistoryEntry | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const record = value as { url?: unknown; title?: unknown; visitedAt?: unknown };
    if (typeof record.url !== 'string' || !record.url.trim()) {
        return undefined;
    }
    const visitedAt = typeof record.visitedAt === 'number' && Number.isFinite(record.visitedAt)
        ? record.visitedAt
        : Date.now();
    const title = typeof record.title === 'string' ? record.title : '';
    return { url: record.url.trim(), title, visitedAt };
}
