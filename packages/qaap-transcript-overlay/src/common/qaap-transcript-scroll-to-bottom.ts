// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { isTranscriptScrollNearBottom } from './qaap-transcript-user-scroll-pin';

export const TRANSCRIPT_SCROLL_TO_BOTTOM_MIN_OVERFLOW_PX = 8;
export const TRANSCRIPT_SCROLL_TO_BOTTOM_NEAR_BOTTOM_PX = 24;

export interface TranscriptScrollToBottomState {
    readonly emptyChat: boolean;
    readonly hasMessages: boolean;
    readonly scrollTop: number;
    readonly clientHeight: number;
    readonly scrollHeight: number;
}

export function hasTranscriptScrollableContentState(
    state: TranscriptScrollToBottomState,
    minOverflowPx = TRANSCRIPT_SCROLL_TO_BOTTOM_MIN_OVERFLOW_PX,
): boolean {
    if (state.emptyChat || !state.hasMessages) {
        return false;
    }
    return state.scrollHeight - state.clientHeight > minOverflowPx;
}

/** Show only when there is scrollable transcript content and the viewport is not at the end. */
export function shouldShowTranscriptScrollToBottomState(
    state: TranscriptScrollToBottomState,
    nearBottomThresholdPx = TRANSCRIPT_SCROLL_TO_BOTTOM_NEAR_BOTTOM_PX,
): boolean {
    if (!hasTranscriptScrollableContentState(state)) {
        return false;
    }
    return !isTranscriptScrollNearBottom(
        state.scrollTop,
        state.clientHeight,
        state.scrollHeight,
        nearBottomThresholdPx,
    );
}
