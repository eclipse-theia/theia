// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, nls } from '@theia/core/lib/common';
import {
    shouldShowTranscriptScrollToBottomState,
    type TranscriptScrollToBottomState,
} from '../common/qaap-transcript-scroll-to-bottom';
import { scrollElementToEnd } from '../common/qaap-prefers-reduced-motion';

export const TRANSCRIPT_SCROLL_TO_BOTTOM_BUTTON_CLASS = 'theia-mobile-agent-transcript-scroll-to-bottom';
export const TRANSCRIPT_SCROLL_TO_BOTTOM_MOUNT_CLASS = 'theia-mod-transcript-scroll-to-bottom-mount';

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

function readTranscriptScrollToBottomState(scroller: HTMLElement): TranscriptScrollToBottomState {
    const emptyChat = scroller.classList.contains('theia-mod-empty-chat')
        || scroller.querySelector('.theia-mobile-agent-transcript-empty.theia-mod-no-project') !== null;
    const hasMessages = scroller.querySelector(
        '.theia-mobile-agent-transcript-msg, .theia-transcript-virtual-window > *',
    ) !== null;
    return {
        emptyChat,
        hasMessages,
        scrollTop: scroller.scrollTop,
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
    };
}

/**
 * Floating glass scroll-to-bottom control for mobile transcript chat hosts.
 * Mounts on `.theia-mobile-agent-transcript-real-chat`; listens on the inner list scroller.
 */
export function attachTranscriptScrollToBottomButton(mountHost: HTMLElement): Disposable {
    mountHost.classList.add(TRANSCRIPT_SCROLL_TO_BOTTOM_MOUNT_CLASS);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${TRANSCRIPT_SCROLL_TO_BOTTOM_BUTTON_CLASS} codicon codicon-chevron-down`;
    button.hidden = true;
    button.setAttribute('aria-hidden', 'true');
    const label = nls.localize('theia/ai/chat-ui/chat-view-tree-widget/scrollToBottom', 'Jump to latest message');
    button.title = label;
    button.setAttribute('aria-label', label);
    mountHost.append(button);

    let boundScroller: HTMLElement | undefined;
    let scrollListener: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let contentObserver: MutationObserver | undefined;
    let showButton = false;
    let atBottom = true;
    let debounceTimer: number | undefined;
    let syncRaf = 0;

    const setButtonVisible = (visible: boolean): void => {
        if (showButton === visible) {
            return;
        }
        showButton = visible;
        button.hidden = !visible;
        button.setAttribute('aria-hidden', visible ? 'false' : 'true');
    };

    const hideButtonImmediately = (): void => {
        atBottom = true;
        setButtonVisible(false);
        if (debounceTimer !== undefined) {
            window.clearTimeout(debounceTimer);
            debounceTimer = undefined;
        }
    };

    const updateButtonState = (nearBottom: boolean): void => {
        if (nearBottom) {
            hideButtonImmediately();
            return;
        }
        if (atBottom) {
            atBottom = false;
            if (debounceTimer !== undefined) {
                window.clearTimeout(debounceTimer);
            }
            debounceTimer = window.setTimeout(() => {
                if (!atBottom) {
                    setButtonVisible(true);
                }
                debounceTimer = undefined;
            }, SCROLL_BUTTON_GRACE_PERIOD_MS);
        }
    };

    const sync = (): void => {
        syncRaf = 0;
        const scroller = boundScroller;
        if (!scroller) {
            hideButtonImmediately();
            return;
        }
        const nearBottom = !shouldShowTranscriptScrollToBottomState(readTranscriptScrollToBottomState(scroller));
        updateButtonState(nearBottom);
    };

    const scheduleSync = (): void => {
        if (syncRaf) {
            return;
        }
        syncRaf = requestAnimationFrame(sync);
    };

    const unbindScroller = (): void => {
        if (boundScroller && scrollListener) {
            boundScroller.removeEventListener('scroll', scrollListener);
        }
        resizeObserver?.disconnect();
        resizeObserver = undefined;
        contentObserver?.disconnect();
        contentObserver = undefined;
        scrollListener = undefined;
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
        scrollListener = scheduleSync;
        scroller.addEventListener('scroll', scrollListener, { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(scheduleSync);
            resizeObserver.observe(scroller);
        }
        contentObserver = new MutationObserver(scheduleSync);
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
        scrollElementToEnd(scroller, 'smooth');
        const resync = (): void => scheduleSync();
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
