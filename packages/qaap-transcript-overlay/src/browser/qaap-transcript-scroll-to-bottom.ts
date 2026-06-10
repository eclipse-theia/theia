// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, nls } from '@theia/core/lib/common';
import {
    resolveTranscriptNearBottomThresholdPx,
    shouldShowTranscriptScrollToBottomState,
    type TranscriptScrollToBottomState,
} from '../common/qaap-transcript-scroll-to-bottom';
import { resolveScrollBehavior } from '../common/qaap-prefers-reduced-motion';

export const TRANSCRIPT_SCROLL_TO_BOTTOM_BUTTON_CLASS = 'theia-mobile-agent-transcript-scroll-to-bottom';
export const TRANSCRIPT_SCROLL_TO_BOTTOM_MOUNT_CLASS = 'theia-mod-transcript-scroll-to-bottom-mount';
export const TRANSCRIPT_SCROLL_TO_BOTTOM_VISIBLE_CLASS = 'theia-mod-visible';

const SCROLL_BUTTON_GRACE_PERIOD_MS = 100;

function resolveTranscriptScroller(mountHost: HTMLElement): HTMLElement | undefined {
    const list = mountHost.querySelector<HTMLElement>(':scope > .theia-mobile-agent-transcript');
    if (list) {
        return list;
    }
    if (mountHost.classList.contains('theia-mobile-agent-transcript')) {
        return mountHost;
    }
    return undefined;
}

const TRANSCRIPT_CONVERSATION_MESSAGE_SELECTOR = [
    '.theia-mobile-agent-transcript-msg.theia-mod-user',
    '.theia-mobile-agent-transcript-msg.theia-mod-agent:not(.theia-mobile-agent-activity)',
    '.theia-transcript-virtual-window > .theia-mobile-agent-transcript-msg.theia-mod-user',
    '.theia-transcript-virtual-window > .theia-mobile-agent-transcript-msg.theia-mod-agent:not(.theia-mobile-agent-activity)',
].join(', ');

function readComposerLiftPx(mountHost: HTMLElement): number {
    const source = mountHost.closest('.theia-mobile-projects') ?? mountHost;
    const raw = getComputedStyle(source).getPropertyValue('--theia-mobile-projects-fab-lift').trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}

function scrollTranscriptToEnd(scroller: HTMLElement): void {
    const top = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTo({ top, behavior: resolveScrollBehavior('smooth') });
}

function readTranscriptScrollToBottomState(scroller: HTMLElement, mountHost: HTMLElement): TranscriptScrollToBottomState {
    const hasConversationMessages = scroller.querySelector(TRANSCRIPT_CONVERSATION_MESSAGE_SELECTOR) !== null;
    const emptyChat = scroller.classList.contains('theia-mod-empty-chat')
        || scroller.querySelector('.theia-mobile-agent-transcript-empty') !== null
        || !hasConversationMessages;
    const style = getComputedStyle(scroller);
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const scrollPaddingBottom = Number.parseFloat(style.scrollPaddingBottom) || 0;
    return {
        emptyChat,
        hasConversationMessages,
        scrollTop: scroller.scrollTop,
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
        nearBottomThresholdPx: resolveTranscriptNearBottomThresholdPx(
            paddingBottom,
            scrollPaddingBottom,
            readComposerLiftPx(mountHost),
        ),
    };
}

/**
 * Floating glass scroll-to-bottom control for mobile transcript chat hosts.
 * Mounts on `.theia-mobile-agent-transcript-real-chat`; listens on the inner list scroller.
 */
export function attachTranscriptScrollToBottomButton(mountHost: HTMLElement): Disposable {
    mountHost.classList.add(TRANSCRIPT_SCROLL_TO_BOTTOM_MOUNT_CLASS);
    mountHost.querySelector(`.${TRANSCRIPT_SCROLL_TO_BOTTOM_BUTTON_CLASS}`)?.remove();

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${TRANSCRIPT_SCROLL_TO_BOTTOM_BUTTON_CLASS} codicon codicon-chevron-down`;
    button.hidden = true;
    button.setAttribute('aria-hidden', 'true');
    const label = nls.localize('theia/ai/chat-ui/chat-view-tree-widget/scrollToBottom', 'Jump to latest message');
    button.title = label;
    button.setAttribute('aria-label', label);
    const badge = document.createElement('span');
    badge.className = 'theia-mobile-agent-transcript-scroll-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.hidden = true;
    button.append(badge);
    mountHost.append(button);

    // New-message badge: while the user is scrolled away, count freshly appended
    // message rows (dedupe by message id — virtual-list remounts reuse ids).
    let unseenCount = 0;
    const seenMessageIds = new Set<string>();

    const updateBadge = (): void => {
        badge.hidden = unseenCount <= 0;
        badge.textContent = unseenCount > 99 ? '99+' : String(unseenCount);
        button.setAttribute('aria-label', unseenCount > 0
            ? nls.localize('qaap/mobileProjects/transcriptJumpToNew', 'Jump to {0} new messages', String(unseenCount))
            : label);
    };

    const resetBadge = (): void => {
        unseenCount = 0;
        seenMessageIds.clear();
        updateBadge();
    };

    const snapshotSeenMessages = (scroller: HTMLElement | undefined): void => {
        seenMessageIds.clear();
        if (!scroller) {
            return;
        }
        for (const row of scroller.querySelectorAll<HTMLElement>('[data-transcript-message-id]')) {
            const id = row.getAttribute('data-transcript-message-id');
            if (id) {
                seenMessageIds.add(id);
            }
        }
    };

    const countNewMessages = (mutations: readonly MutationRecord[]): void => {
        if (!showButton) {
            return;
        }
        let counted = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement)) {
                    continue;
                }
                const id = node.getAttribute('data-transcript-message-id');
                if (id && !seenMessageIds.has(id)) {
                    seenMessageIds.add(id);
                    unseenCount++;
                    counted = true;
                }
            }
        }
        if (counted) {
            updateBadge();
        }
    };

    let boundScroller: HTMLElement | undefined;
    let scrollListener: (() => void) | undefined;
    let scrollEndListener: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let contentObserver: MutationObserver | undefined;
    let showButton = false;
    let debounceTimer: number | undefined;
    let syncRaf = 0;

    const setButtonVisible = (visible: boolean): void => {
        if (showButton === visible) {
            return;
        }
        showButton = visible;
        button.hidden = !visible;
        button.classList.toggle(TRANSCRIPT_SCROLL_TO_BOTTOM_VISIBLE_CLASS, visible);
        button.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (visible) {
            snapshotSeenMessages(boundScroller);
        } else {
            resetBadge();
        }
    };

    const clearShowDebounce = (): void => {
        if (debounceTimer !== undefined) {
            window.clearTimeout(debounceTimer);
            debounceTimer = undefined;
        }
    };

    const hideButtonImmediately = (): void => {
        clearShowDebounce();
        setButtonVisible(false);
    };

    const readShouldShow = (scroller: HTMLElement | undefined): boolean => {
        if (!scroller) {
            return false;
        }
        return shouldShowTranscriptScrollToBottomState(readTranscriptScrollToBottomState(scroller, mountHost));
    };

    const scheduleShowIfStillNeeded = (): void => {
        if (debounceTimer !== undefined) {
            return;
        }
        debounceTimer = window.setTimeout(() => {
            debounceTimer = undefined;
            if (readShouldShow(boundScroller)) {
                setButtonVisible(true);
            }
        }, SCROLL_BUTTON_GRACE_PERIOD_MS);
    };

    const applyScrollVisibility = (): void => {
        const scroller = boundScroller;
        if (!readShouldShow(scroller)) {
            hideButtonImmediately();
            return;
        }
        if (!showButton) {
            scheduleShowIfStillNeeded();
        }
    };

    const onScrollerScroll = (): void => {
        // Hide immediately when the user reaches the end — no rAF / debounce lag.
        applyScrollVisibility();
    };

    const scheduleSync = (): void => {
        if (syncRaf) {
            return;
        }
        syncRaf = requestAnimationFrame(() => {
            syncRaf = 0;
            applyScrollVisibility();
        });
    };

    const unbindScroller = (): void => {
        if (boundScroller && scrollListener) {
            boundScroller.removeEventListener('scroll', scrollListener);
        }
        if (boundScroller && scrollEndListener) {
            boundScroller.removeEventListener('touchend', scrollEndListener);
            if ('onscrollend' in boundScroller) {
                boundScroller.removeEventListener('scrollend', scrollEndListener);
            }
        }
        resizeObserver?.disconnect();
        resizeObserver = undefined;
        contentObserver?.disconnect();
        contentObserver = undefined;
        scrollListener = undefined;
        scrollEndListener = undefined;
        boundScroller = undefined;
    };

    const bindScroller = (scroller: HTMLElement | undefined): void => {
        if (scroller === boundScroller) {
            scheduleSync();
            return;
        }
        unbindScroller();
        boundScroller = scroller;
        if (!scroller) {
            hideButtonImmediately();
            return;
        }
        scrollListener = onScrollerScroll;
        scrollEndListener = onScrollerScroll;
        scroller.addEventListener('scroll', scrollListener, { passive: true });
        scroller.addEventListener('touchend', scrollEndListener, { passive: true });
        if ('onscrollend' in scroller) {
            scroller.addEventListener('scrollend', scrollEndListener, { passive: true });
        }
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(scheduleSync);
            resizeObserver.observe(scroller);
        }
        contentObserver = new MutationObserver(mutations => {
            countNewMessages(mutations);
            scheduleSync();
        });
        contentObserver.observe(scroller, { childList: true, subtree: true, characterData: true });
        scheduleSync();
    };

    const resolveAndBindScroller = (): void => {
        bindScroller(resolveTranscriptScroller(mountHost));
    };

    button.addEventListener('click', (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const scroller = boundScroller;
        if (!scroller || button.hidden) {
            return;
        }
        hideButtonImmediately();
        scrollTranscriptToEnd(scroller);
        const resync = (): void => onScrollerScroll();
        if ('onscrollend' in scroller) {
            scroller.addEventListener('scrollend', resync, { once: true });
        }
        window.setTimeout(resync, 450);
    });

    const mutationObserver = new MutationObserver(resolveAndBindScroller);
    mutationObserver.observe(mountHost, { childList: true, subtree: false });

    resolveAndBindScroller();

    return Disposable.create(() => {
        if (syncRaf) {
            cancelAnimationFrame(syncRaf);
        }
        if (debounceTimer !== undefined) {
            window.clearTimeout(debounceTimer);
        }
        mutationObserver.disconnect();
        unbindScroller();
        button.remove();
        mountHost.classList.remove(TRANSCRIPT_SCROLL_TO_BOTTOM_MOUNT_CLASS);
    });
}
