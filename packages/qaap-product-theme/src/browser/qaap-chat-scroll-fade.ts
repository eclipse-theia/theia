// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';

export const CHAT_SCROLL_FADE_TOP_CLASS = 'theia-mod-chat-scroll-fade-top';
export const CHAT_SCROLL_FADE_BOTTOM_CLASS = 'theia-mod-chat-scroll-fade-bottom';

/** Scroll hosts that receive fade state classes on their overlay parents. */
export const CHAT_SCROLL_FADE_SCROLLER_SELECTORS = [
    '.chat-view-widget',
    '.chat-tree-view-widget',
    '.chat-tree-view-widget .body',
    '.theia-mobile-agent-transcript',
] as const;

export const CHAT_SCROLL_FADE_SCROLLER_SELECTOR = CHAT_SCROLL_FADE_SCROLLER_SELECTORS.join(',');

export interface ChatScrollFadeState {
    showTop: boolean;
    showBottom: boolean;
}

export interface ChatScrollFadeHosts {
    top: HTMLElement;
    bottom: HTMLElement;
}

export function resolveChatScrollFadeState(
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    thresholdPx = 8,
): ChatScrollFadeState {
    const canScroll = scrollHeight > clientHeight + 1;
    const atTop = scrollTop <= thresholdPx;
    const atBottom = scrollHeight - scrollTop - clientHeight <= thresholdPx;
    return {
        showTop: canScroll && !atTop,
        showBottom: canScroll && !atBottom,
    };
}

export function resolveChatScrollFadeHosts(scroller: HTMLElement): ChatScrollFadeHosts {
    const transcript = scroller.closest<HTMLElement>('.theia-mobile-agent-transcript');
    if (transcript && (scroller === transcript || transcript.contains(scroller))) {
        return { top: transcript, bottom: transcript };
    }

    const realChat = scroller.closest<HTMLElement>('.theia-mobile-agent-transcript-real-chat');
    if (realChat && scroller.classList.contains('theia-mobile-agent-transcript-real-chat')) {
        return { top: realChat, bottom: realChat };
    }

    const chatView = scroller.closest<HTMLElement>('.chat-view-widget');
    const chatTree = scroller.closest<HTMLElement>('.chat-tree-view-widget');
    if (chatView) {
        return { top: chatView, bottom: chatTree ?? chatView };
    }

    return { top: scroller, bottom: scroller };
}

export function installChatScrollFade(scroller: HTMLElement): Disposable {
    if (typeof window === 'undefined') {
        return Disposable.NULL;
    }
    if (scroller.dataset.qaapChatScrollFade === 'true') {
        return Disposable.NULL;
    }
    scroller.dataset.qaapChatScrollFade = 'true';

    const hosts = resolveChatScrollFadeHosts(scroller);
    let rafId = 0;

    const applyState = (state: ChatScrollFadeState): void => {
        hosts.top.classList.toggle(CHAT_SCROLL_FADE_TOP_CLASS, state.showTop);
        hosts.bottom.classList.toggle(CHAT_SCROLL_FADE_BOTTOM_CLASS, state.showBottom);
    };

    const update = (): void => {
        applyState(resolveChatScrollFadeState(
            scroller.scrollTop,
            scroller.scrollHeight,
            scroller.clientHeight,
        ));
    };

    const scheduleUpdate = (): void => {
        if (rafId) {
            return;
        }
        rafId = window.requestAnimationFrame(() => {
            rafId = 0;
            update();
        });
    };

    scroller.addEventListener('scroll', scheduleUpdate, { passive: true });
    update();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => scheduleUpdate())
        : undefined;
    resizeObserver?.observe(scroller);

    return Disposable.create(() => {
        if (rafId) {
            window.cancelAnimationFrame(rafId);
        }
        scroller.removeEventListener('scroll', scheduleUpdate);
        resizeObserver?.disconnect();
        delete scroller.dataset.qaapChatScrollFade;
        hosts.top.classList.remove(CHAT_SCROLL_FADE_TOP_CLASS);
        hosts.bottom.classList.remove(CHAT_SCROLL_FADE_BOTTOM_CLASS);
    });
}
