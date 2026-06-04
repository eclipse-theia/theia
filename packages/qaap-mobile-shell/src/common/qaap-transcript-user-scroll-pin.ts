// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Which user message should be pinned at the transcript top.
 *
 * - First pin: once scroll passes the message anchor.
 * - While pinned: stays on {@link activeIndex} until a different candidate wins (next/previous handoff).
 * - Does not unpin when scrolling back toward the message's natural position.
 */
export function resolveTranscriptPinnedUserIndex(
    offsets: readonly number[],
    scrollTop: number,
    activeIndex: number | undefined,
    pinOffsetPx = 1,
): number | undefined {
    if (offsets.length === 0) {
        return undefined;
    }
    let candidate = 0;
    for (let i = 0; i < offsets.length; i++) {
        if (offsets[i] <= scrollTop + pinOffsetPx) {
            candidate = i;
        } else {
            break;
        }
    }
    if (activeIndex === undefined) {
        if (scrollTop <= offsets[candidate] + pinOffsetPx) {
            return undefined;
        }
        return candidate;
    }
    return candidate;
}
