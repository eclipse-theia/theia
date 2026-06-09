// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { isTranscriptScrollNearBottom } from './qaap-transcript-user-scroll-pin';

export const TRANSCRIPT_SCROLL_TO_BOTTOM_MIN_OVERFLOW_PX = 8;
/** Base floor; real threshold also includes composer / scroll-padding clearance. */
export const TRANSCRIPT_SCROLL_TO_BOTTOM_NEAR_BOTTOM_PX = 32;

export interface TranscriptScrollToBottomState {
    readonly emptyChat: boolean;
    readonly hasConversationMessages: boolean;
    readonly scrollTop: number;
    readonly clientHeight: number;
    readonly scrollHeight: number;
    /** Distance from scroll end still treated as "at bottom" (composer padding band). */
    readonly nearBottomThresholdPx?: number;
}

/** Merge measured scroll clearance into the near-bottom threshold. */
export function resolveTranscriptNearBottomThresholdPx(
    paddingBottomPx: number,
    scrollPaddingBottomPx: number,
    composerLiftPx = 0,
    baseThresholdPx = TRANSCRIPT_SCROLL_TO_BOTTOM_NEAR_BOTTOM_PX,
): number {
    return Math.max(
        baseThresholdPx,
        paddingBottomPx,
        scrollPaddingBottomPx,
        composerLiftPx + 16,
    );
}

export function isTranscriptEmptyChatState(state: Pick<TranscriptScrollToBottomState, 'emptyChat' | 'hasConversationMessages'>): boolean {
    return state.emptyChat || !state.hasConversationMessages;
}

export function hasTranscriptScrollableContentState(
    state: TranscriptScrollToBottomState,
    minOverflowPx = TRANSCRIPT_SCROLL_TO_BOTTOM_MIN_OVERFLOW_PX,
): boolean {
    if (isTranscriptEmptyChatState(state)) {
        return false;
    }
    return state.scrollHeight - state.clientHeight > minOverflowPx;
}

export function isTranscriptAtMaxScroll(
    scrollTop: number,
    clientHeight: number,
    scrollHeight: number,
    epsilonPx = 2,
): boolean {
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    return scrollTop >= maxScrollTop - epsilonPx;
}

/** Show only when there is scrollable transcript content and the viewport is not at the end. */
export function shouldShowTranscriptScrollToBottomState(state: TranscriptScrollToBottomState): boolean {
    if (!hasTranscriptScrollableContentState(state)) {
        return false;
    }
    if (isTranscriptAtMaxScroll(state.scrollTop, state.clientHeight, state.scrollHeight)) {
        return false;
    }
    const threshold = state.nearBottomThresholdPx ?? TRANSCRIPT_SCROLL_TO_BOTTOM_NEAR_BOTTOM_PX;
    return !isTranscriptScrollNearBottom(
        state.scrollTop,
        state.clientHeight,
        state.scrollHeight,
        threshold,
    );
}
