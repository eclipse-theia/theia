// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';
import { resolveTranscriptPinnedUserIndex } from '../common/qaap-transcript-user-scroll-pin';

const USER_WRAP_SELECTOR = '.theia-mobile-agent-transcript-user-wrap';
const USER_BUBBLE_SELECTOR = '.theia-mobile-agent-transcript-msg.theia-mod-user';
const PIN_SPACER_CLASS = 'theia-mobile-agent-transcript-user-pin-spacer';
const PINNED_CLASS = 'theia-mod-scroll-pinned';
const HANDOFF_IN_CLASS = 'theia-mod-scroll-pin-handoff-in';
const HANDOFF_OUT_CLASS = 'theia-mod-scroll-pin-handoff-out';
const HANDOFF_MS = 260;

interface TranscriptUserPinEntry {
    readonly wrap: HTMLElement;
    readonly bubble: HTMLElement;
    spacer: HTMLElement;
}

function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function anchorOffsetInScroller(wrap: HTMLElement, scroller: HTMLElement): number {
    return wrap.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

function ensureSpacer(entry: TranscriptUserPinEntry): HTMLElement {
    let spacer = entry.wrap.querySelector<HTMLElement>(`.${PIN_SPACER_CLASS}`);
    if (!spacer) {
        spacer = document.createElement('div');
        spacer.className = PIN_SPACER_CLASS;
        spacer.setAttribute('aria-hidden', 'true');
        entry.wrap.insertBefore(spacer, entry.bubble);
    }
    entry.spacer = spacer;
    return spacer;
}

function clearEntryPin(entry: TranscriptUserPinEntry): void {
    entry.bubble.classList.remove(PINNED_CLASS, HANDOFF_IN_CLASS, HANDOFF_OUT_CLASS);
    entry.bubble.style.removeProperty('position');
    entry.bubble.style.removeProperty('top');
    entry.bubble.style.removeProperty('right');
    entry.bubble.style.removeProperty('width');
    entry.bubble.style.removeProperty('max-width');
    entry.bubble.style.removeProperty('z-index');
    entry.bubble.style.removeProperty('transform');
    entry.spacer.style.height = '0px';
    entry.wrap.classList.remove('theia-mod-scroll-pin-active');
}

/** Lock bubble to the top edge of the scrollport (does not move with scroll). */
function layoutFixedPin(entry: TranscriptUserPinEntry, scroller: HTMLElement): void {
    const scrollerRect = scroller.getBoundingClientRect();
    const wrapRect = entry.wrap.getBoundingClientRect();
    const height = entry.bubble.offsetHeight;
    ensureSpacer(entry);
    entry.spacer.style.height = `${height}px`;
    entry.wrap.classList.add('theia-mod-scroll-pin-active');
    entry.bubble.classList.add(PINNED_CLASS);
    entry.bubble.style.position = 'fixed';
    entry.bubble.style.top = `${scrollerRect.top}px`;
    entry.bubble.style.right = `${Math.max(0, window.innerWidth - wrapRect.right)}px`;
    entry.bubble.style.width = `${wrapRect.width}px`;
    entry.bubble.style.maxWidth = '86vw';
    entry.bubble.style.zIndex = '5';
    entry.bubble.style.transform = '';
}

function applyEntryPin(
    entry: TranscriptUserPinEntry,
    scroller: HTMLElement,
    options: { readonly handoffIn: boolean },
): void {
    layoutFixedPin(entry, scroller);
    if (options.handoffIn && !prefersReducedMotion()) {
        entry.bubble.classList.add(HANDOFF_IN_CLASS);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                entry.bubble.classList.remove(HANDOFF_IN_CLASS);
            });
        });
    }
}

function releasePinWithHandoff(entry: TranscriptUserPinEntry, onDone: () => void): void {
    if (!entry.bubble.classList.contains(PINNED_CLASS) || prefersReducedMotion()) {
        onDone();
        return;
    }
    let finished = false;
    const finish = (): void => {
        if (finished) {
            return;
        }
        finished = true;
        entry.bubble.removeEventListener('transitionend', onTransitionEnd);
        window.clearTimeout(fallbackTimer);
        onDone();
    };
    const onTransitionEnd = (event: TransitionEvent): void => {
        if (event.target === entry.bubble && (event.propertyName === 'opacity' || event.propertyName === 'transform')) {
            finish();
        }
    };
    entry.bubble.classList.remove(HANDOFF_IN_CLASS);
    entry.bubble.classList.add(HANDOFF_OUT_CLASS);
    entry.bubble.addEventListener('transitionend', onTransitionEnd);
    const fallbackTimer = window.setTimeout(finish, HANDOFF_MS + 48);
}

/**
 * Cursor-style sticky user prompt: fixed at the scrollport top until the next/previous user message replaces it.
 */
export function attachTranscriptUserScrollPin(scroller: HTMLElement): Disposable {
    let raf = 0;
    let activeIndex: number | undefined;

    const collectEntries = (): TranscriptUserPinEntry[] => {
        const entries: TranscriptUserPinEntry[] = [];
        for (const wrap of scroller.querySelectorAll<HTMLElement>(USER_WRAP_SELECTOR)) {
            const bubble = wrap.querySelector<HTMLElement>(USER_BUBBLE_SELECTOR);
            if (!bubble) {
                continue;
            }
            const spacer = wrap.querySelector<HTMLElement>(`.${PIN_SPACER_CLASS}`);
            entries.push({
                wrap,
                bubble,
                spacer: spacer ?? document.createElement('div'),
            });
        }
        return entries;
    };

    const clearInactiveEntries = (entries: TranscriptUserPinEntry[], keepIndex: number): void => {
        for (let i = 0; i < entries.length; i++) {
            if (i === keepIndex) {
                continue;
            }
            if (entries[i].bubble.classList.contains(PINNED_CLASS)
                && !entries[i].bubble.classList.contains(HANDOFF_OUT_CLASS)) {
                clearEntryPin(entries[i]);
            }
        }
    };

    const sync = (): void => {
        raf = 0;
        const entries = collectEntries();
        if (entries.length === 0) {
            activeIndex = undefined;
            return;
        }
        const offsets = entries.map(e => anchorOffsetInScroller(e.wrap, scroller));
        const index = resolveTranscriptPinnedUserIndex(offsets, scroller.scrollTop, activeIndex);

        if (index === undefined) {
            return;
        }

        if (index === activeIndex) {
            layoutFixedPin(entries[index], scroller);
            return;
        }

        const previousIndex = activeIndex;
        activeIndex = index;
        clearInactiveEntries(entries, index);

        if (previousIndex !== undefined && previousIndex < entries.length) {
            const outgoing = entries[previousIndex];
            releasePinWithHandoff(outgoing, () => clearEntryPin(outgoing));
        }

        applyEntryPin(entries[index], scroller, {
            handoffIn: previousIndex !== undefined,
        });
    };

    const scheduleSync = (): void => {
        if (raf) {
            return;
        }
        raf = requestAnimationFrame(sync);
    };

    scroller.addEventListener('scroll', scheduleSync, { passive: true });
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
        resizeObserver?.disconnect();
        mutationObserver.disconnect();
        activeIndex = undefined;
        for (const entry of collectEntries()) {
            clearEntryPin(entry);
        }
    });
}
