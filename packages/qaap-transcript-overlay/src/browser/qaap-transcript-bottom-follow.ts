// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { prefersReducedMotion } from '../common/qaap-prefers-reduced-motion';

interface TranscriptBottomFollowState {
    rafId: number;
    readonly stop: () => void;
}

const followers = new WeakMap<HTMLElement, TranscriptBottomFollowState>();

/** True while a smooth bottom-follow loop is active on the scroller. */
export function isFollowingTranscriptBottom(scroller: HTMLElement): boolean {
    return followers.has(scroller);
}

/**
 * Smoothly follow the bottom of a streaming transcript. Instead of a discrete
 * `scrollTop = scrollHeight` jump per delta, a RAF loop eases toward the bottom
 * each frame, so the page glides with the incoming text. Any user gesture
 * (wheel, touch, pointer) cancels the follow immediately so reading upward is
 * never fought. Honors reduced motion by jumping instantly.
 */
export function followTranscriptBottom(scroller: HTMLElement): void {
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
        scroller.scrollTop = scroller.scrollHeight;
        return;
    }
    if (followers.has(scroller)) {
        return;
    }
    const stop = (): void => {
        const state = followers.get(scroller);
        if (!state) {
            return;
        }
        followers.delete(scroller);
        if (state.rafId) {
            cancelAnimationFrame(state.rafId);
        }
        scroller.removeEventListener('wheel', stop);
        scroller.removeEventListener('touchstart', stop);
        scroller.removeEventListener('pointerdown', stop);
    };
    const step = (): void => {
        const state = followers.get(scroller);
        if (!state) {
            return;
        }
        const target = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const distance = target - scroller.scrollTop;
        if (distance <= 1) {
            scroller.scrollTop = target;
            stop();
            return;
        }
        scroller.scrollTop += Math.max(distance * 0.35, Math.min(distance, 24));
        state.rafId = requestAnimationFrame(step);
    };
    const state: TranscriptBottomFollowState = { rafId: 0, stop };
    followers.set(scroller, state);
    scroller.addEventListener('wheel', stop, { passive: true });
    scroller.addEventListener('touchstart', stop, { passive: true });
    scroller.addEventListener('pointerdown', stop, { passive: true });
    state.rafId = requestAnimationFrame(step);
}
