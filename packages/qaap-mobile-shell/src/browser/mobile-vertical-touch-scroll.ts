// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';

/** Elements that must keep horizontal pan only (see qaap-mobile-touch-scroll.css). */
const HORIZONTAL_STRIP_SELECTOR =
    '.lm-TabBar-content-container, .theia-mobile-bottom-activity-bar, ' +
    '#theia-statusBar, .theia-mobile-keyboard-accessory-page, .theia-statusBar-track';

/**
 * Touch fallback for vertically scrollable regions on iOS / coarse pointers when
 * nested scroll under `body { overflow: hidden }` does not move natively.
 */
export function installMobileVerticalTouchScroll(element: HTMLElement): Disposable {
    if (typeof window === 'undefined') {
        return Disposable.NULL;
    }
    if (element.closest(HORIZONTAL_STRIP_SELECTOR)) {
        return Disposable.NULL;
    }
    if (element.dataset.theiaMobileScrollY === 'true') {
        return Disposable.NULL;
    }
    element.dataset.theiaMobileScrollY = 'true';

    let startY = 0;
    let scrollTop = 0;
    let tracking = false;

    const canScroll = (): boolean => element.scrollHeight > element.clientHeight + 1;

    const onTouchStart = (event: TouchEvent): void => {
        if (event.touches.length !== 1 || !canScroll()) {
            tracking = false;
            return;
        }
        tracking = true;
        startY = event.touches[0].pageY;
        scrollTop = element.scrollTop;
    };

    const onTouchMove = (event: TouchEvent): void => {
        if (!tracking || event.touches.length !== 1) {
            return;
        }
        const dy = event.touches[0].pageY - startY;
        const max = element.scrollHeight - element.clientHeight;
        element.scrollTop = Math.max(0, Math.min(max, scrollTop - dy));
    };

    const stop = (): void => {
        tracking = false;
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: true });
    element.addEventListener('touchend', stop, { passive: true });
    element.addEventListener('touchcancel', stop, { passive: true });

    return Disposable.create(() => {
        element.removeEventListener('touchstart', onTouchStart);
        element.removeEventListener('touchmove', onTouchMove);
        element.removeEventListener('touchend', stop);
        element.removeEventListener('touchcancel', stop);
        delete element.dataset.theiaMobileScrollY;
    });
}

/** Scroll hosts that should receive the vertical touch fallback on mobile. */
export const MOBILE_VERTICAL_SCROLL_SELECTOR = [
    '.theia-Tree',
    '.theia-TreeContainer',
    '.treeContainer',
    '.body.ps',
    '.ps[tabindex]',
    '[data-virtuoso-scroller="true"]',
    '.xterm-viewport',
    '.chat-view-widget',
    '.chat-tree-view-widget .body',
    '.theia-mobile-projects-scroll',
    '.theia-mobile-pr-stack',
    '.theia-mobile-pr-picker',
    '.theia-mobile-open-repo-list',
    '.gs-container',
    '.monaco-editor .overflow-guard',
].join(',');
