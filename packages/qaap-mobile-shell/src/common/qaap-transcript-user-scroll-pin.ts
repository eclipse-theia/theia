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

/** Scroll position that places the user message at the top of the transcript (unpins the bubble). */
export function transcriptUserMessageScrollTop(anchorOffsetPx: number, paddingPx = 8): number {
    return Math.max(0, anchorOffsetPx - paddingPx);
}

/**
 * User message currently stuck at the scrollport top (last in document order whose wrap
 * intersects the top edge). Uses layout-relative top only — sticky elements keep a
 * document offsetTop near scrollTop, so scrollTop vs offsetTop cannot detect handoff.
 */
export function resolveStuckUserIndex(
    wrapTopsRelativeToScroller: readonly number[],
    stuckTopMaxPx = 24,
): number | undefined {
    if (wrapTopsRelativeToScroller.length === 0) {
        return undefined;
    }
    let candidate: number | undefined;
    for (let i = 0; i < wrapTopsRelativeToScroller.length; i++) {
        if (wrapTopsRelativeToScroller[i] <= stuckTopMaxPx) {
            candidate = i;
        }
    }
    return candidate;
}

export function isTranscriptScrollAtTop(scrollTop: number, thresholdPx = 1): boolean {
    return scrollTop <= thresholdPx;
}

/** Avoid showing a compact sticky preview while the transcript is pinned to the newest response. */
export function isTranscriptScrollNearBottom(
    scrollTop: number,
    clientHeight: number,
    scrollHeight: number,
    thresholdPx = 24,
): boolean {
    return scrollHeight - scrollTop - clientHeight <= thresholdPx;
}

export function shouldPinTranscriptUserIndex(index: number | undefined, userCount: number): index is number {
    return index !== undefined && index < userCount - 1;
}
