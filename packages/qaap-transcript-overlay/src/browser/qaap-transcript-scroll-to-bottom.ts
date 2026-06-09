// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, nls } from '@theia/core/lib/common';
import { isTranscriptScrollNearBottom } from '../common/qaap-transcript-user-scroll-pin';
import { scrollElementToEnd } from '../common/qaap-prefers-reduced-motion';

export const TRANSCRIPT_SCROLL_TO_BOTTOM_BUTTON_CLASS = 'theia-mobile-agent-transcript-scroll-to-bottom';
export const TRANSCRIPT_SCROLL_TO_BOTTOM_MOUNT_CLASS = 'theia-mod-transcript-scroll-to-bottom-mount';

const SCROLL_BUTTON_GRACE_PERIOD_MS = 100;
const NEAR_BOTTOM_THRESHOLD_PX = 24;

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
    const label = nls.localize('theia/ai/chat-ui/chat-view-tree-widget/scrollToBottom', 'Jump to latest message');
    button.title = label;
    button.setAttribute('aria-label', label);
    mountHost.append(button);

    let boundScroller: HTMLElement | undefined;
    let scrollListener: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
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
        if (scroller.scrollHeight <= scroller.clientHeight) {
            hideButtonImmediately();
            return;
        }
        const nearBottom = isTranscriptScrollNearBottom(
            scroller.scrollTop,
            scroller.clientHeight,
            scroller.scrollHeight,
            NEAR_BOTTOM_THRESHOLD_PX,
        );
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
        scheduleSync();
    };

    const resolveAndBindScroller = (): void => {
        bindScroller(resolveTranscriptScroller(mountHost));
    };

    button.addEventListener('click', () => {
        const scroller = boundScroller;
        if (!scroller) {
            return;
        }
        hideButtonImmediately();
        scrollElementToEnd(scroller, 'smooth');
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
