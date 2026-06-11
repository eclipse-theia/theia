// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** ~30 fps cap for streaming tail patches when the user is reading above the bottom. */
export const TRANSCRIPT_STREAMING_OFF_BOTTOM_COALESCE_MS = 33;

let cachedCoarseMq: MediaQueryList | undefined;

export function matchesCoarsePointer(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    if (!cachedCoarseMq) {
        cachedCoarseMq = window.matchMedia('(pointer: coarse)');
    }
    return cachedCoarseMq.matches;
}

/**
 * Delay before applying the next streaming visual patch. Near-bottom stays at 60 fps (RAF);
 * coarse-pointer readers above the tail get ~30 fps so scroll stays smooth.
 */
export function resolveTranscriptStreamingCoalesceDelayMs(isNearBottom: boolean): number {
    if (isNearBottom || !matchesCoarsePointer()) {
        return 0;
    }
    return TRANSCRIPT_STREAMING_OFF_BOTTOM_COALESCE_MS;
}
