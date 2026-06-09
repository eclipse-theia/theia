// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Lines shown per message while the transcript list is scrolling. */
export const TRANSCRIPT_SCROLL_COMPACT_LINE_COUNT = 5;

/** Matches user markdown bubble `line-height: 1.58` in mobile-workbench.css. */
export const TRANSCRIPT_SCROLL_COMPACT_LINE_HEIGHT_EM = 1.58;

/**
 * Max content height (px) before a bubble is treated as "long" and may compact while scrolling.
 */
export function transcriptScrollCompactMaxHeightPx(fontSizePx: number, lineCount = TRANSCRIPT_SCROLL_COMPACT_LINE_COUNT): number {
    const safeSize = Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx : 13;
    return Math.ceil(safeSize * TRANSCRIPT_SCROLL_COMPACT_LINE_HEIGHT_EM * lineCount + 6);
}

export function isTranscriptContentTall(element: HTMLElement, maxHeightPx: number): boolean {
    return element.scrollHeight > maxHeightPx + 2;
}
