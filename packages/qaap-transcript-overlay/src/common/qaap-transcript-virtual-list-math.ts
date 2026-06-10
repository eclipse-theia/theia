// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export interface VirtualListVisibleRange {
    readonly startIndex: number;
    readonly endIndex: number;
    readonly windowOffset: number;
    readonly totalHeight: number;
}

/**
 * Build cumulative prefix offsets from per-item sizes (0 = use {@link defaultSize}).
 * `offsets[i]` is the top of item `i`; `offsets[sizes.length]` is the total height.
 * One flat number array instead of per-item layout objects keeps the per-frame
 * cost allocation-free for the caller (build once, binary-search many).
 */
export function buildVirtualListOffsets(
    sizes: readonly number[],
    defaultSize: number,
): readonly number[] {
    const offsets = new Array<number>(sizes.length + 1);
    offsets[0] = 0;
    for (let index = 0; index < sizes.length; index++) {
        const raw = sizes[index] ?? 0;
        offsets[index + 1] = offsets[index] + (raw > 0 ? raw : defaultSize);
    }
    return offsets;
}

export function resolveVirtualListTotalHeight(offsets: readonly number[]): number {
    return offsets.length === 0 ? 0 : offsets[offsets.length - 1];
}

/** Largest index with `offsets[index] <= value` (offsets are ascending). */
function greatestIndexAtMost(offsets: readonly number[], value: number): number {
    let low = 0;
    let high = offsets.length - 1;
    let result = 0;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (offsets[mid] <= value) {
            result = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return result;
}

/** Largest index with `offsets[index] < value` (offsets are ascending). */
function greatestIndexBelow(offsets: readonly number[], value: number): number {
    let low = 0;
    let high = offsets.length - 1;
    let result = 0;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (offsets[mid] < value) {
            result = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return result;
}

/**
 * Map scroll position to the indices that should be mounted (inclusive).
 * O(log n) over the prefix {@link buildVirtualListOffsets} array, so it is safe
 * to call on every scroll frame even for very long transcripts.
 */
export function resolveVirtualListVisibleRange(
    scrollTop: number,
    viewportHeight: number,
    offsets: readonly number[],
    overscanPx: number,
): VirtualListVisibleRange {
    const itemCount = offsets.length - 1;
    if (itemCount <= 0) {
        return { startIndex: 0, endIndex: -1, windowOffset: 0, totalHeight: 0 };
    }
    const totalHeight = offsets[itemCount];
    const viewStart = Math.max(0, scrollTop - overscanPx);
    const viewEnd = scrollTop + viewportHeight + overscanPx;

    const startIndex = Math.min(itemCount - 1, greatestIndexAtMost(offsets, viewStart));
    const endIndex = Math.min(itemCount - 1, Math.max(startIndex, greatestIndexBelow(offsets, viewEnd)));

    return {
        startIndex,
        endIndex,
        windowOffset: offsets[startIndex],
        totalHeight,
    };
}
