// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, nls } from '@theia/core/lib/common';
import {
    isTranscriptContentTall,
    transcriptScrollCompactMaxHeightPx,
} from '../common/qaap-transcript-scroll-compact';
import { prefersReducedMotion, resolveScrollBehavior } from '../common/qaap-prefers-reduced-motion';
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
/**
 * Coalescing window for mutation-driven re-syncs. During token streaming the
 * MutationObserver fires many times per second; each full sync re-measures wrap
 * positions (forced layout). 100ms matches the virtual list's measure throttle,
 * while scroll-driven syncs stay on their own RAF path and use cached positions.
 */
const PIN_MUTATION_SYNC_THROTTLE_MS = 100;

interface TranscriptUserPinEntry {
    readonly wrap: HTMLElement;
    readonly bubble: HTMLElement;
}

type TranscriptUserPinVisualState = 'stuck' | 'suppressed' | 'clear';

function syncStickyCompact(entry: TranscriptUserPinEntry): void {
    const content = entry.bubble.querySelector<HTMLElement>(CONTENT_SELECTOR);
    if (!content) {
        return;
    }
    const maxHeightPx = transcriptScrollCompactMaxHeightPx(parseFloat(getComputedStyle(content).fontSize));
    content.classList.toggle(STICKY_COMPACT_CLASS, isTranscriptContentTall(content, maxHeightPx));
}

function reserveNaturalWrapHeight(entry: TranscriptUserPinEntry): void {
    const content = entry.bubble.querySelector<HTMLElement>(CONTENT_SELECTOR);
    const hadStuckClass = entry.wrap.classList.contains(STUCK_WRAP_CLASS);
    const hadSuppressedClass = entry.wrap.classList.contains(SUPPRESSED_WRAP_CLASS);
    const hadCompactClass = content?.classList.contains(STICKY_COMPACT_CLASS) ?? false;
    const previousMinHeight = entry.wrap.style.minHeight;

    entry.wrap.classList.remove(STUCK_WRAP_CLASS, SUPPRESSED_WRAP_CLASS);
    content?.classList.remove(STICKY_COMPACT_CLASS);
    entry.wrap.style.removeProperty('min-height');

    const naturalHeight = entry.wrap.offsetHeight;

    entry.wrap.classList.toggle(STUCK_WRAP_CLASS, hadStuckClass);
    entry.wrap.classList.toggle(SUPPRESSED_WRAP_CLASS, hadSuppressedClass);
    content?.classList.toggle(STICKY_COMPACT_CLASS, hadCompactClass);
    entry.wrap.style.minHeight = previousMinHeight;

    if (naturalHeight > 0) {
        entry.wrap.style.minHeight = `${Math.ceil(naturalHeight)}px`;
    }
}

function clearStickyVisual(entry: TranscriptUserPinEntry): void {
    entry.wrap.classList.remove(STUCK_WRAP_CLASS);
    entry.wrap.classList.remove(SUPPRESSED_WRAP_CLASS);
    entry.wrap.style.removeProperty('min-height');
    entry.bubble.classList.remove(JUMP_CLASS);
    entry.bubble.querySelector<HTMLElement>(CONTENT_SELECTOR)?.classList.remove(STICKY_COMPACT_CLASS);
    entry.bubble.removeAttribute('tabindex');
    entry.bubble.removeAttribute('title');
    entry.bubble.removeAttribute('aria-label');
}

function applyStickyVisual(entry: TranscriptUserPinEntry): void {
    reserveNaturalWrapHeight(entry);
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
    entry.wrap.style.removeProperty('min-height');
    entry.bubble.classList.remove(JUMP_CLASS);
    entry.bubble.querySelector<HTMLElement>(CONTENT_SELECTOR)?.classList.remove(STICKY_COMPACT_CLASS);
    entry.bubble.removeAttribute('tabindex');
    entry.bubble.removeAttribute('title');
    entry.bubble.removeAttribute('aria-label');
}

/**
 * Sticky user prompts hand off at scroll intersections (CSS sticky on every wrap; compact preview on the one stuck at top).
 *
 * Performance contract: plain scroll frames are layout-read-free. Wrap entries and
 * their natural (non-sticky) scroll offsets are cached; the caches are invalidated by
 * DOM mutations, scroller resizes, or a scrollHeight change (which covers virtual-list
 * relayouts). When a re-measure is needed, all wraps are measured in one batched
 * write→read→restore pass — one forced reflow instead of one per user message.
 */
export function attachTranscriptUserScrollPin(scroller: HTMLElement): Disposable {
    let raf = 0;
    let stuckIndex: number | undefined;
    let scrollToUserMessage = false;
    let scrollToUserMessageTimer: number | undefined;
    let mutationSyncTimer: number | undefined;
    let lastMutationSyncAt = 0;
    let skipNextSync = false;
    let refreshVisualsPending = true;
    let entriesCache: TranscriptUserPinEntry[] | undefined;
    let naturalTopsCache: number[] | undefined;
    let lastScrollHeight = -1;
    let zIndexWrap: HTMLElement | undefined;
    const entryStates = new WeakMap<HTMLElement, TranscriptUserPinVisualState>();

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

    const getEntries = (): TranscriptUserPinEntry[] => entriesCache ??= collectEntries();

    /**
     * Natural scroll offsets for all wraps in one batched pass: neutralize sticky
     * positioning on every wrap (writes), read all rects (single forced reflow),
     * then restore the inline styles (writes).
     */
    const measureNaturalTops = (entries: readonly TranscriptUserPinEntry[]): number[] => {
        const previousStyles = entries.map(entry => ({
            position: entry.wrap.style.position,
            top: entry.wrap.style.top,
            zIndex: entry.wrap.style.zIndex,
        }));
        for (const entry of entries) {
            entry.wrap.style.position = 'static';
            entry.wrap.style.top = 'auto';
            entry.wrap.style.zIndex = 'auto';
        }
        try {
            const scrollerRect = scroller.getBoundingClientRect();
            const scrollTop = scroller.scrollTop;
            return entries.map(entry => entry.wrap.getBoundingClientRect().top - scrollerRect.top + scrollTop);
        } finally {
            entries.forEach((entry, i) => {
                entry.wrap.style.position = previousStyles[i].position;
                entry.wrap.style.top = previousStyles[i].top;
                entry.wrap.style.zIndex = previousStyles[i].zIndex;
            });
        }
    };

    const getNaturalTops = (entries: readonly TranscriptUserPinEntry[]): number[] => {
        if (!naturalTopsCache || naturalTopsCache.length !== entries.length) {
            naturalTopsCache = measureNaturalTops(entries);
        }
        return naturalTopsCache;
    };

    const applyEntryState = (entry: TranscriptUserPinEntry, state: TranscriptUserPinVisualState, force = false): void => {
        if (!force && entryStates.get(entry.wrap) === state) {
            return;
        }
        entryStates.set(entry.wrap, state);
        if (state === 'stuck') {
            applyStickyVisual(entry);
        } else if (state === 'suppressed') {
            applySuppressedStickyVisual(entry);
        } else {
            clearStickyVisual(entry);
        }
    };

    const setZIndexEntry = (entries: readonly TranscriptUserPinEntry[], index: number | undefined): void => {
        const wrap = index !== undefined ? entries[index].wrap : undefined;
        if (wrap === zIndexWrap) {
            return;
        }
        zIndexWrap?.style.removeProperty('z-index');
        if (wrap && index !== undefined) {
            wrap.style.zIndex = String(100 + index);
        }
        zIndexWrap = wrap;
    };

    const clearStickyEntries = (entries = getEntries()): void => {
        stuckIndex = undefined;
        setZIndexEntry(entries, undefined);
        for (const entry of entries) {
            applyEntryState(entry, 'clear');
        }
    };

    const finishScrollToUserMessage = (): void => {
        scrollToUserMessage = false;
        skipNextSync = true;
        if (scrollToUserMessageTimer !== undefined) {
            window.clearTimeout(scrollToUserMessageTimer);
            scrollToUserMessageTimer = undefined;
        }
        clearStickyEntries();
    };

    const scrollStickyMessageIntoView = (entry: TranscriptUserPinEntry): void => {
        const entries = getEntries();
        const entryIndex = entries.indexOf(entry);
        const anchorTop = entryIndex >= 0
            ? getNaturalTops(entries)[entryIndex]
            : measureNaturalTops([entry])[0];
        const targetTop = transcriptUserMessageScrollTop(anchorTop);
        scrollToUserMessage = true;
        stuckIndex = undefined;
        clearStickyEntries(entries);
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
            behavior: resolveScrollBehavior('smooth'),
        });
    };

    const resolveStickyEntryFromTarget = (target: EventTarget | null): TranscriptUserPinEntry | undefined => {
        const wrap = (target as HTMLElement | null)?.closest<HTMLElement>(USER_WRAP_SELECTOR);
        if (!wrap?.classList.contains(STUCK_WRAP_CLASS)) {
            return undefined;
        }
        return getEntries().find(entry => entry.wrap === wrap);
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
        raf = 0;
        if (scrollToUserMessage) {
            return;
        }
        const entries = getEntries();
        if (skipNextSync) {
            skipNextSync = false;
            clearStickyEntries(entries);
            return;
        }
        const scrollTop = scroller.scrollTop;
        const scrollHeight = scroller.scrollHeight;
        if (scrollHeight !== lastScrollHeight) {
            // Content height changed without an observed mutation/resize (e.g. the
            // virtual list moved its window transform) — cached offsets are stale.
            lastScrollHeight = scrollHeight;
            naturalTopsCache = undefined;
        }
        if (
            entries.length === 0
            || isTranscriptScrollAtTop(scrollTop)
            || isTranscriptScrollNearBottom(scrollTop, scroller.clientHeight, scrollHeight)
        ) {
            clearStickyEntries(entries);
            return;
        }

        const naturalTops = getNaturalTops(entries);
        const wrapTopsRelative = naturalTops.map(top => top - scrollTop);
        const index = resolveStuckUserIndex(wrapTopsRelative, STUCK_TOP_MAX_PX);

        setZIndexEntry(entries, index);

        if (!shouldPinTranscriptUserIndex(index, entries.length)) {
            clearStickyEntries(entries);
            return;
        }
        const pinnedIndex = index;
        const refresh = refreshVisualsPending;
        refreshVisualsPending = false;
        const pinnedChanged = pinnedIndex !== stuckIndex;
        stuckIndex = pinnedIndex;

        for (let i = 0; i < entries.length; i++) {
            if (i === pinnedIndex) {
                // Force re-apply on content changes so the compact preview tracks
                // streaming updates; plain scroll frames skip the re-style entirely.
                applyEntryState(entries[i], 'stuck', refresh || pinnedChanged);
            } else if (wrapTopsRelative[i] <= STUCK_TOP_MAX_PX) {
                applyEntryState(entries[i], 'suppressed');
            } else {
                applyEntryState(entries[i], 'clear');
            }
        }
    };

    const scheduleSync = (): void => {
        if (raf) {
            return;
        }
        raf = requestAnimationFrame(sync);
    };

    const scheduleMutationSync = (): void => {
        if (mutationSyncTimer !== undefined) {
            return;
        }
        const elapsed = Date.now() - lastMutationSyncAt;
        const delay = elapsed >= PIN_MUTATION_SYNC_THROTTLE_MS
            ? 0
            : PIN_MUTATION_SYNC_THROTTLE_MS - elapsed;
        mutationSyncTimer = window.setTimeout(() => {
            mutationSyncTimer = undefined;
            lastMutationSyncAt = Date.now();
            scheduleSync();
        }, delay);
    };

    scroller.addEventListener('scroll', scheduleSync, { passive: true });
    scroller.addEventListener('click', onStickyActivate);
    scroller.addEventListener('keydown', onStickyKeyDown);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            naturalTopsCache = undefined;
            refreshVisualsPending = true;
            scheduleSync();
        })
        : undefined;
    resizeObserver?.observe(scroller);
    const mutationObserver = new MutationObserver(() => {
        entriesCache = undefined;
        naturalTopsCache = undefined;
        refreshVisualsPending = true;
        scheduleMutationSync();
    });
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
        if (mutationSyncTimer !== undefined) {
            window.clearTimeout(mutationSyncTimer);
        }
        resizeObserver?.disconnect();
        mutationObserver.disconnect();
        stuckIndex = undefined;
        zIndexWrap = undefined;
        for (const entry of collectEntries()) {
            clearStickyVisual(entry);
            entry.wrap.style.removeProperty('z-index');
        }
    });
}
