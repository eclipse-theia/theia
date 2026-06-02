// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const QAAP_PREVIEW_INSPECTOR_WIDTH_STORAGE_KEY = 'qaap.preview.inspectorPanelWidth';
export const QAAP_PREVIEW_INSPECTOR_HEIGHT_STORAGE_KEY = 'qaap.preview.inspectorPanelHeight';
export const QAAP_PREVIEW_INSPECTOR_POSITION_STORAGE_KEY = 'qaap.preview.inspectorPanelPosition';

export const QAAP_PREVIEW_INSPECTOR_WIDTH_MIN_PX = 240;
export const QAAP_PREVIEW_INSPECTOR_WIDTH_MAX_PX = 720;
export const QAAP_PREVIEW_INSPECTOR_WIDTH_DEFAULT_PX = 320;

export const QAAP_PREVIEW_INSPECTOR_HEIGHT_MIN_PX = 160;
export const QAAP_PREVIEW_INSPECTOR_HEIGHT_MAX_PX = 900;
export const QAAP_PREVIEW_INSPECTOR_HEIGHT_DEFAULT_RATIO = 0.45;

export const QAAP_PREVIEW_INSPECTOR_MOBILE_MQ = '(max-width: 767px)';
export type QaapPreviewInspectorPosition = 'side' | 'bottom';

export function isPreviewInspectorMobileLayout(): boolean {
    return typeof window !== 'undefined' && window.matchMedia(QAAP_PREVIEW_INSPECTOR_MOBILE_MQ).matches;
}

export function resolveDefaultPreviewInspectorPosition(): QaapPreviewInspectorPosition {
    return isPreviewInspectorMobileLayout() ? 'bottom' : 'side';
}

export function readPreviewInspectorPosition(): QaapPreviewInspectorPosition {
    const fallback = resolveDefaultPreviewInspectorPosition();
    if (typeof window === 'undefined') {
        return fallback;
    }
    try {
        const raw = window.localStorage.getItem(QAAP_PREVIEW_INSPECTOR_POSITION_STORAGE_KEY);
        if (raw === 'side' || raw === 'bottom') {
            return raw;
        }
    } catch {
        /* storage blocked */
    }
    return fallback;
}

export function writePreviewInspectorPosition(position: QaapPreviewInspectorPosition): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(QAAP_PREVIEW_INSPECTOR_POSITION_STORAGE_KEY, position);
    } catch {
        /* storage blocked */
    }
}

export function clampPreviewInspectorWidth(widthPx: number, containerWidthPx?: number): number {
    let max = QAAP_PREVIEW_INSPECTOR_WIDTH_MAX_PX;
    if (containerWidthPx !== undefined && containerWidthPx > 0) {
        max = Math.min(max, Math.round(containerWidthPx * 0.88));
    }
    max = Math.max(QAAP_PREVIEW_INSPECTOR_WIDTH_MIN_PX, max);
    return Math.max(QAAP_PREVIEW_INSPECTOR_WIDTH_MIN_PX, Math.min(max, Math.round(widthPx)));
}

export function clampPreviewInspectorHeight(heightPx: number, containerHeightPx?: number): number {
    let max = QAAP_PREVIEW_INSPECTOR_HEIGHT_MAX_PX;
    if (containerHeightPx !== undefined && containerHeightPx > 0) {
        max = Math.min(max, Math.round(containerHeightPx * 0.82));
    }
    max = Math.max(QAAP_PREVIEW_INSPECTOR_HEIGHT_MIN_PX, max);
    return Math.max(QAAP_PREVIEW_INSPECTOR_HEIGHT_MIN_PX, Math.min(max, Math.round(heightPx)));
}

export function readPreviewInspectorWidth(containerWidthPx?: number): number {
    if (typeof window === 'undefined') {
        return clampPreviewInspectorWidth(QAAP_PREVIEW_INSPECTOR_WIDTH_DEFAULT_PX, containerWidthPx);
    }
    try {
        const raw = window.localStorage.getItem(QAAP_PREVIEW_INSPECTOR_WIDTH_STORAGE_KEY);
        const parsed = raw ? Number(raw) : QAAP_PREVIEW_INSPECTOR_WIDTH_DEFAULT_PX;
        if (!Number.isFinite(parsed)) {
            return clampPreviewInspectorWidth(QAAP_PREVIEW_INSPECTOR_WIDTH_DEFAULT_PX, containerWidthPx);
        }
        return clampPreviewInspectorWidth(parsed, containerWidthPx);
    } catch {
        return clampPreviewInspectorWidth(QAAP_PREVIEW_INSPECTOR_WIDTH_DEFAULT_PX, containerWidthPx);
    }
}

export function readPreviewInspectorHeight(containerHeightPx?: number): number {
    const fallback = containerHeightPx && containerHeightPx > 0
        ? Math.round(containerHeightPx * QAAP_PREVIEW_INSPECTOR_HEIGHT_DEFAULT_RATIO)
        : 320;
    if (typeof window === 'undefined') {
        return clampPreviewInspectorHeight(fallback, containerHeightPx);
    }
    try {
        const raw = window.localStorage.getItem(QAAP_PREVIEW_INSPECTOR_HEIGHT_STORAGE_KEY);
        const parsed = raw ? Number(raw) : fallback;
        if (!Number.isFinite(parsed)) {
            return clampPreviewInspectorHeight(fallback, containerHeightPx);
        }
        return clampPreviewInspectorHeight(parsed, containerHeightPx);
    } catch {
        return clampPreviewInspectorHeight(fallback, containerHeightPx);
    }
}

export function writePreviewInspectorWidth(widthPx: number, containerWidthPx?: number): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(
            QAAP_PREVIEW_INSPECTOR_WIDTH_STORAGE_KEY,
            String(clampPreviewInspectorWidth(widthPx, containerWidthPx)),
        );
    } catch {
        /* storage blocked */
    }
}

export function writePreviewInspectorHeight(heightPx: number, containerHeightPx?: number): void {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(
            QAAP_PREVIEW_INSPECTOR_HEIGHT_STORAGE_KEY,
            String(clampPreviewInspectorHeight(heightPx, containerHeightPx)),
        );
    } catch {
        /* storage blocked */
    }
}
