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
    resolveStuckUserIndex,
    transcriptUserMessageScrollTop,
} from '../common/qaap-transcript-user-scroll-pin';

const USER_WRAP_SELECTOR = '.theia-mobile-agent-transcript-user-wrap';
const USER_BUBBLE_SELECTOR = '.theia-mobile-agent-transcript-msg.theia-mod-user';
const STUCK_WRAP_CLASS = 'theia-mod-sticky-stuck';
const JUMP_CLASS = 'theia-mod-scroll-pinned-jump';
const STICKY_COMPACT_CLASS = 'theia-mod-sticky-compact';
const CONTENT_SELECTOR = '.theia-mobile-agent-transcript-content';

interface TranscriptUserPinEntry {
    readonly wrap: HTMLElement;
    readonly bubble: HTMLElement;
}

function wrapScrollTopInScroller(wrap: HTMLElement, scroller: HTMLElement): number {
    let top = 0;
    let node: HTMLElement | null = wrap;
    while (node && node !== scroller) {
        top += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
    }
    return top;
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
    entry.bubble.classList.remove(JUMP_CLASS);
    entry.bubble.querySelector<HTMLElement>(CONTENT_SELECTOR)?.classList.remove(STICKY_COMPACT_CLASS);
    entry.bubble.removeAttribute('tabindex');
    entry.bubble.removeAttribute('title');
    entry.bubble.removeAttribute('aria-label');
}

function applyStickyVisual(entry: TranscriptUserPinEntry): void {
    entry.wrap.classList.add(STUCK_WRAP_CLASS);
    const jumpLabel = nls.localize('qaap/mobileProjects/transcriptPinnedJump', 'Jump to message');
    entry.bubble.classList.add(JUMP_CLASS);
    syncStickyCompact(entry);
    entry.bubble.setAttribute('tabindex', '0');
    entry.bubble.setAttribute('title', jumpLabel);
    entry.bubble.setAttribute('aria-label', jumpLabel);
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

    const finishScrollToUserMessage = (): void => {
        scrollToUserMessage = false;
        if (scrollToUserMessageTimer !== undefined) {
            window.clearTimeout(scrollToUserMessageTimer);
            scrollToUserMessageTimer = undefined;
        }
        scheduleSync();
    };

    const scrollStickyMessageIntoView = (entry: TranscriptUserPinEntry): void => {
        const targetTop = transcriptUserMessageScrollTop(wrapScrollTopInScroller(entry.wrap, scroller));
        scrollToUserMessage = true;
        stuckIndex = undefined;
        clearStickyVisual(entry);
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
        if (entries.length === 0) {
            stuckIndex = undefined;
            return;
        }

        const scrollerRect = scroller.getBoundingClientRect();
        const wrapTopsRelative = entries.map(
            e => e.wrap.getBoundingClientRect().top - scrollerRect.top,
        );
        const index = resolveStuckUserIndex(wrapTopsRelative);

        entries.forEach((entry, i) => {
            entry.wrap.style.zIndex = String(10 + i);
        });

        if (index === undefined) {
            stuckIndex = undefined;
            for (const entry of entries) {
                clearStickyVisual(entry);
            }
            return;
        }

        if (index === stuckIndex) {
            applyStickyVisual(entries[index]);
            return;
        }

        stuckIndex = index;
        for (let i = 0; i < entries.length; i++) {
            if (i === index) {
                applyStickyVisual(entries[i]);
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
