// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export interface VirtualListItemLayout {
    readonly index: number;
    readonly offset: number;
    readonly size: number;
}

export interface VirtualListVisibleRange {
    readonly startIndex: number;
    readonly endIndex: number;
    readonly windowOffset: number;
    readonly totalHeight: number;
}

/** Build cumulative offsets from per-item sizes (0 = use {@link defaultSize}). */
export function buildVirtualListLayouts(
    sizes: readonly number[],
    defaultSize: number,
): readonly VirtualListItemLayout[] {
    let offset = 0;
    const layouts: VirtualListItemLayout[] = [];
    for (let index = 0; index < sizes.length; index++) {
        const raw = sizes[index] ?? 0;
        const size = raw > 0 ? raw : defaultSize;
        layouts.push({ index, offset, size });
        offset += size;
    }
    return layouts;
}

export function resolveVirtualListTotalHeight(layouts: readonly VirtualListItemLayout[]): number {
    if (layouts.length === 0) {
        return 0;
    }
    const last = layouts[layouts.length - 1];
    return last.offset + last.size;
}

/** Map scroll position to the indices that should be mounted (inclusive). */
export function resolveVirtualListVisibleRange(
    scrollTop: number,
    viewportHeight: number,
    layouts: readonly VirtualListItemLayout[],
    overscanPx: number,
): VirtualListVisibleRange {
    if (layouts.length === 0) {
        return { startIndex: 0, endIndex: -1, windowOffset: 0, totalHeight: 0 };
    }
    const totalHeight = resolveVirtualListTotalHeight(layouts);
    const viewStart = Math.max(0, scrollTop - overscanPx);
    const viewEnd = scrollTop + viewportHeight + overscanPx;

    let startIndex = 0;
    while (startIndex < layouts.length && layouts[startIndex].offset + layouts[startIndex].size <= viewStart) {
        startIndex++;
    }
    if (startIndex >= layouts.length) {
        startIndex = layouts.length - 1;
    }

    let endIndex = startIndex;
    while (endIndex < layouts.length && layouts[endIndex].offset < viewEnd) {
        endIndex++;
    }
    endIndex = Math.min(layouts.length - 1, Math.max(startIndex, endIndex - 1));

    return {
        startIndex,
        endIndex,
        windowOffset: layouts[startIndex]?.offset ?? 0,
        totalHeight,
    };
}
