// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, nls } from '@theia/core/lib/common';
import {
    isTranscriptContentTall,
    transcriptScrollCompactMaxHeightPx,
} from '../common/qaap-transcript-scroll-compact';
import {
    isTranscriptScrollAtTop,
    isTranscriptScrollNearBottom,
    resolveStuckUserIndex,
    shouldPinTranscriptUserIndex,
    transcriptUserMessageScrollTop,
} from '../common/qaap-transcript-user-scroll-pin';

const USER_WRAP_SELECTOR = '.theia-mobile-agent-transcript-user-wrap';
const USER_BUBBLE_SELECTOR = '.theia-mobile-agent-transcript-msg.theia-mod-user';
const STUCK_WRAP_CLASS = 'theia-mod-sticky-stuck';
const SUPPRESSED_WRAP_CLASS = 'theia-mod-sticky-suppressed';
const JUMP_CLASS = 'theia-mod-scroll-pinned-jump';
const STICKY_COMPACT_CLASS = 'theia-mod-sticky-compact';
const CONTENT_SELECTOR = '.theia-mobile-agent-transcript-content';
const STUCK_TOP_MAX_PX = 24;

interface TranscriptUserPinEntry {
    readonly wrap: HTMLElement;
    readonly bubble: HTMLElement;
}

function wrapNaturalScrollTopInScroller(wrap: HTMLElement, scroller: HTMLElement): number {
    const previousPosition = wrap.style.position;
    const previousTop = wrap.style.top;
    const previousZIndex = wrap.style.zIndex;
    wrap.style.position = 'static';
    wrap.style.top = 'auto';
    wrap.style.zIndex = 'auto';
    try {
        const scrollerRect = scroller.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        return wrapRect.top - scrollerRect.top + scroller.scrollTop;
    } finally {
        wrap.style.position = previousPosition;
        wrap.style.top = previousTop;
        wrap.style.zIndex = previousZIndex;
    }
}

function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function syncStickyCompact(entry: TranscriptUserPinEntry): void {
    const content = entry.bubble.querySelector<HTMLElement>(CONTENT_SELECTOR);
    if (!content) {
        return;
    }
    const maxHeightPx = transcriptScrollCompactMaxHeightPx(parseFloat(getComputedStyle(content).fontSize));
    content.classList.toggle(STICKY_COMPACT_CLASS, isTranscriptContentTall(content, maxHeightPx));
}

function clearStickyVisual(entry: TranscriptUserPinEntry): void {
    entry.wrap.classList.remove(STUCK_WRAP_CLASS);
    entry.wrap.classList.remove(SUPPRESSED_WRAP_CLASS);
    entry.bubble.classList.remove(JUMP_CLASS);
    entry.bubble.querySelector<HTMLElement>(CONTENT_SELECTOR)?.classList.remove(STICKY_COMPACT_CLASS);
    entry.bubble.removeAttribute('tabindex');
    entry.bubble.removeAttribute('title');
    entry.bubble.removeAttribute('aria-label');
}

function applyStickyVisual(entry: TranscriptUserPinEntry): void {
    entry.wrap.classList.add(STUCK_WRAP_CLASS);
    entry.wrap.classList.remove(SUPPRESSED_WRAP_CLASS);
    const jumpLabel = nls.localize('qaap/mobileProjects/transcriptPinnedJump', 'Jump to message');
    entry.bubble.classList.add(JUMP_CLASS);
    syncStickyCompact(entry);
    entry.bubble.setAttribute('tabindex', '0');
    entry.bubble.setAttribute('title', jumpLabel);
    entry.bubble.setAttribute('aria-label', jumpLabel);
}

function applySuppressedStickyVisual(entry: TranscriptUserPinEntry): void {
    entry.wrap.classList.remove(STUCK_WRAP_CLASS);
    entry.wrap.classList.add(SUPPRESSED_WRAP_CLASS);
    entry.bubble.classList.remove(JUMP_CLASS);
    entry.bubble.querySelector<HTMLElement>(CONTENT_SELECTOR)?.classList.remove(STICKY_COMPACT_CLASS);
    entry.bubble.removeAttribute('tabindex');
    entry.bubble.removeAttribute('title');
    entry.bubble.removeAttribute('aria-label');
}

/**
 * Sticky user prompts hand off at scroll intersections (CSS sticky on every wrap; compact preview on the one stuck at top).
 */
export function attachTranscriptUserScrollPin(scroller: HTMLElement): Disposable {
    let raf = 0;
    let stuckIndex: number | undefined;
    let scrollToUserMessage = false;
    let scrollToUserMessageTimer: number | undefined;

    const collectEntries = (): TranscriptUserPinEntry[] => {
        const entries: TranscriptUserPinEntry[] = [];
        for (const wrap of scroller.querySelectorAll<HTMLElement>(USER_WRAP_SELECTOR)) {
            const bubble = wrap.querySelector<HTMLElement>(USER_BUBBLE_SELECTOR);
            if (!bubble) {
                continue;
            }
            entries.push({ wrap, bubble });
        }
        return entries;
    };

    const clearStickyEntries = (entries = collectEntries()): void => {
        stuckIndex = undefined;
        for (const entry of entries) {
            clearStickyVisual(entry);
            entry.wrap.style.removeProperty('z-index');
        }
    };

    const finishScrollToUserMessage = (): void => {
        scrollToUserMessage = false;
        if (scrollToUserMessageTimer !== undefined) {
            window.clearTimeout(scrollToUserMessageTimer);
            scrollToUserMessageTimer = undefined;
        }
        scheduleSync();
    };

    const scrollStickyMessageIntoView = (entry: TranscriptUserPinEntry): void => {
        const targetTop = transcriptUserMessageScrollTop(wrapNaturalScrollTopInScroller(entry.wrap, scroller));
        scrollToUserMessage = true;
        stuckIndex = undefined;
        clearStickyEntries();
        if (scrollToUserMessageTimer !== undefined) {
            window.clearTimeout(scrollToUserMessageTimer);
        }
        const onScrollDone = (): void => {
            scroller.removeEventListener('scrollend', onScrollDone);
            if (scrollToUserMessageTimer !== undefined) {
                window.clearTimeout(scrollToUserMessageTimer);
                scrollToUserMessageTimer = undefined;
            }
            finishScrollToUserMessage();
        };
        if ('onscrollend' in scroller) {
            scroller.addEventListener('scrollend', onScrollDone, { once: true });
        }
        scrollToUserMessageTimer = window.setTimeout(onScrollDone, prefersReducedMotion() ? 32 : 700);
        scroller.scrollTo({
            top: targetTop,
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
    };

    const resolveStickyEntryFromTarget = (target: EventTarget | null): TranscriptUserPinEntry | undefined => {
        const wrap = (target as HTMLElement | null)?.closest<HTMLElement>(USER_WRAP_SELECTOR);
        if (!wrap?.classList.contains(STUCK_WRAP_CLASS)) {
            return undefined;
        }
        return collectEntries().find(entry => entry.wrap === wrap);
    };

    const onStickyActivate = (event: Event): void => {
        const entry = resolveStickyEntryFromTarget(event.target);
        if (!entry) {
            return;
        }
        if ((event.target as HTMLElement | null)?.closest('a, .theia-mobile-agent-transcript-user-action')) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        scrollStickyMessageIntoView(entry);
    };

    const onStickyKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        const entry = resolveStickyEntryFromTarget(event.target);
        if (!entry) {
            return;
        }
        event.preventDefault();
        scrollStickyMessageIntoView(entry);
    };

    const sync = (): void => {
        if (scrollToUserMessage) {
            return;
        }
        raf = 0;
        const entries = collectEntries();
        if (
            entries.length === 0
            || isTranscriptScrollAtTop(scroller.scrollTop)
            || isTranscriptScrollNearBottom(scroller.scrollTop, scroller.clientHeight, scroller.scrollHeight)
        ) {
            clearStickyEntries(entries);
            return;
        }

        const wrapTopsRelative = entries.map(
            e => wrapNaturalScrollTopInScroller(e.wrap, scroller) - scroller.scrollTop,
        );
        const index = resolveStuckUserIndex(wrapTopsRelative, STUCK_TOP_MAX_PX);

        entries.forEach((entry, i) => {
            if (i === index) {
                entry.wrap.style.zIndex = String(100 + i);
            } else {
                entry.wrap.style.removeProperty('z-index');
            }
        });

        if (!shouldPinTranscriptUserIndex(index, entries.length)) {
            clearStickyEntries(entries);
            return;
        }
        const pinnedIndex = index;

        if (pinnedIndex === stuckIndex) {
            applyStickyVisual(entries[pinnedIndex]);
            for (let i = 0; i < entries.length; i++) {
                if (i === pinnedIndex) {
                    continue;
                }
                if (wrapTopsRelative[i] <= STUCK_TOP_MAX_PX) {
                    applySuppressedStickyVisual(entries[i]);
                } else {
                    clearStickyVisual(entries[i]);
                }
            }
            return;
        }

        stuckIndex = pinnedIndex;
        for (let i = 0; i < entries.length; i++) {
            if (i === pinnedIndex) {
                applyStickyVisual(entries[i]);
            } else if (wrapTopsRelative[i] <= STUCK_TOP_MAX_PX) {
                applySuppressedStickyVisual(entries[i]);
            } else {
                clearStickyVisual(entries[i]);
            }
        }
    };

    const scheduleSync = (): void => {
        if (raf) {
            return;
        }
        raf = requestAnimationFrame(sync);
    };

    scroller.addEventListener('scroll', scheduleSync, { passive: true });
    scroller.addEventListener('click', onStickyActivate);
    scroller.addEventListener('keydown', onStickyKeyDown);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleSync)
        : undefined;
    resizeObserver?.observe(scroller);
    const mutationObserver = new MutationObserver(scheduleSync);
    mutationObserver.observe(scroller, { childList: true, subtree: true, characterData: true });

    scheduleSync();

    return Disposable.create(() => {
        if (raf) {
            cancelAnimationFrame(raf);
        }
        scroller.removeEventListener('scroll', scheduleSync);
        scroller.removeEventListener('click', onStickyActivate);
        scroller.removeEventListener('keydown', onStickyKeyDown);
        if (scrollToUserMessageTimer !== undefined) {
            window.clearTimeout(scrollToUserMessageTimer);
        }
        resizeObserver?.disconnect();
        mutationObserver.disconnect();
        stuckIndex = undefined;
        for (const entry of collectEntries()) {
            clearStickyVisual(entry);
            entry.wrap.style.removeProperty('z-index');
        }
    });
}
