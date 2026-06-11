// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Token smoothing for streaming transcript text: SSE deltas arrive in bursts, but revealing
 * them at a steady pace reads faster and avoids layout jumps. The reveal rate adapts to the
 * backlog so the visible text always catches up to the wire within {@link STREAM_SMOOTH_CATCH_UP_MS}.
 */

/** Floor reveal speed so short tails never crawl. */
export const STREAM_SMOOTH_MIN_CHARS_PER_SECOND = 120;

/** The visible text catches up to the latest received chunk within this window. */
export const STREAM_SMOOTH_CATCH_UP_MS = 350;

/** Backlogs beyond this jump straight to the end (tab restore, huge paste-like chunks). */
export const STREAM_SMOOTH_MAX_LAG_CHARS = 1600;

/**
 * Next reveal length for a smoothing tick.
 *
 * Monotonic (never reveals less than `revealed`), clamps to `targetLength`, jumps when the
 * backlog exceeds {@link STREAM_SMOOTH_MAX_LAG_CHARS}, and otherwise advances at
 * `max(minRate, backlog / catchUpWindow)` so pace stays steady yet bounded.
 */
export function nextStreamSmoothRevealLength(
    revealed: number,
    targetLength: number,
    elapsedMs: number,
): number {
    if (targetLength <= revealed) {
        return targetLength;
    }
    const backlog = targetLength - revealed;
    if (backlog > STREAM_SMOOTH_MAX_LAG_CHARS) {
        return targetLength;
    }
    const charsPerSecond = Math.max(
        STREAM_SMOOTH_MIN_CHARS_PER_SECOND,
        backlog * (1000 / STREAM_SMOOTH_CATCH_UP_MS),
    );
    const step = Math.max(1, Math.round(charsPerSecond * Math.max(0, elapsedMs) / 1000));
    return Math.min(targetLength, revealed + step);
}
