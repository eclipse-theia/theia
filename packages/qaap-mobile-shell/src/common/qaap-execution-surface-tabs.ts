// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export type ExecutionSurfaceTabId = 'messages' | 'plan' | 'review' | 'preview' | 'files' | 'terminal';

export const EXECUTION_SURFACE_TAB_IDS: readonly ExecutionSurfaceTabId[] = [
    'messages',
    'plan',
    'review',
    'preview',
    'files',
    'terminal',
];

/** Chat is always pinned as the first visible header slot. */
export const PINNED_EXECUTION_SURFACE_TAB: ExecutionSurfaceTabId = 'messages';

/** Header shows Chat plus the overflow picker; all other tabs live in the menu. */
export const HEADER_PINNED_EXECUTION_SURFACE_TABS: readonly ExecutionSurfaceTabId[] = [
    PINNED_EXECUTION_SURFACE_TAB,
];

/** Rotating header slot count (excluding Chat and the overflow control). */
export const ROTATING_EXECUTION_SURFACE_TAB_COUNT = 1;

export const EXECUTION_SURFACE_TAB_USAGE_STORAGE_KEY = 'qaap.executionSurfaceTabUsage';

export interface ExecutionSurfaceTabLayout {
    readonly visible: ExecutionSurfaceTabId[];
    readonly overflow: ExecutionSurfaceTabId[];
}

export function readExecutionSurfaceTabUsage(): Partial<Record<ExecutionSurfaceTabId, number>> {
    try {
        if (typeof window === 'undefined') {
            return {};
        }
        const raw = window.localStorage.getItem(EXECUTION_SURFACE_TAB_USAGE_STORAGE_KEY);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw) as Partial<Record<ExecutionSurfaceTabId, number>>;
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }
        return parsed;
    } catch {
        return {};
    }
}

export function writeExecutionSurfaceTabUsage(
    usage: Readonly<Partial<Record<ExecutionSurfaceTabId, number>>>,
): void {
    try {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(EXECUTION_SURFACE_TAB_USAGE_STORAGE_KEY, JSON.stringify(usage));
    } catch {
        /* private mode — ignore */
    }
}

export function recordExecutionSurfaceTabUse(tab: ExecutionSurfaceTabId): Partial<Record<ExecutionSurfaceTabId, number>> {
    const usage = { ...readExecutionSurfaceTabUsage() };
    usage[tab] = (usage[tab] ?? 0) + 1;
    writeExecutionSurfaceTabUsage(usage);
    return usage;
}

export function rankExecutionSurfaceTabs(
    usage: Readonly<Partial<Record<ExecutionSurfaceTabId, number>>>,
    activeTab?: ExecutionSurfaceTabId,
): ExecutionSurfaceTabLayout {
    const score = (tab: ExecutionSurfaceTabId): number => usage[tab] ?? 0;
    const rotatable = EXECUTION_SURFACE_TAB_IDS.filter(tab => tab !== PINNED_EXECUTION_SURFACE_TAB);
    const sortedRotatable = [...rotatable].sort((left, right) => {
        const diff = score(right) - score(left);
        if (diff !== 0) {
            return diff;
        }
        return EXECUTION_SURFACE_TAB_IDS.indexOf(left) - EXECUTION_SURFACE_TAB_IDS.indexOf(right);
    });

    let secondSlot = sortedRotatable[0] ?? 'plan';
    if (activeTab && activeTab !== PINNED_EXECUTION_SURFACE_TAB) {
        secondSlot = activeTab;
    }

    const visible: ExecutionSurfaceTabId[] = [PINNED_EXECUTION_SURFACE_TAB, secondSlot];
    const overflow = EXECUTION_SURFACE_TAB_IDS.filter(tab => !visible.includes(tab));
    return { visible, overflow };
}

export function layoutExecutionSurfaceTabs(
    activeTab?: ExecutionSurfaceTabId,
    usage: Readonly<Partial<Record<ExecutionSurfaceTabId, number>>> = readExecutionSurfaceTabUsage(),
): ExecutionSurfaceTabLayout {
    return rankExecutionSurfaceTabs(usage, activeTab);
}
