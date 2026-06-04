// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';

/** Elements that must keep horizontal pan only (see qaap-mobile-touch-scroll.css). */
const HORIZONTAL_STRIP_SELECTOR =
    '.lm-TabBar-content-container, .lm-DockPanel-tabBar[data-orientation="horizontal"], ' +
    '.theia-mobile-bottom-activity-bar, #theia-statusBar, .theia-mobile-keyboard-accessory-page, ' +
    '.theia-statusBar-track';

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

    let startX = 0;
    let startY = 0;
    let scrollTop = 0;
    let tracking = false;
    let axisLocked = false;
    let lockToVertical = false;
    const threshold = 6;

    const canScroll = (): boolean => element.scrollHeight > element.clientHeight + 1;

    const onTouchStart = (event: TouchEvent): void => {
        if (event.touches.length !== 1 || !canScroll()) {
            tracking = false;
            return;
        }
        tracking = true;
        startX = event.touches[0].pageX;
        startY = event.touches[0].pageY;
        scrollTop = element.scrollTop;
        axisLocked = false;
        lockToVertical = false;
    };

    const onTouchMove = (event: TouchEvent): void => {
        if (!tracking || event.touches.length !== 1 || !canScroll()) {
            return;
        }
        const dx = event.touches[0].pageX - startX;
        const dy = event.touches[0].pageY - startY;
        if (!axisLocked) {
            if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
                return;
            }
            axisLocked = true;
            lockToVertical = Math.abs(dy) >= Math.abs(dx);
        }
        if (!lockToVertical) {
            return;
        }
        if (event.cancelable) {
            event.preventDefault();
        }
        const max = element.scrollHeight - element.clientHeight;
        element.scrollTop = Math.max(0, Math.min(max, scrollTop - dy));
    };

    const stop = (): void => {
        tracking = false;
        axisLocked = false;
        lockToVertical = false;
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
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
    '.theia-mobile-sticky-composer-sheet-list',
    '.theia-mobile-sticky-composer-tools-host',
    '.theia-mobile-routine-sheet-form',
    '.theia-mobile-parallel-body',
    '.theia-mobile-transcript-checks-panel',
    '.theia-mobile-transcript-review-checks-body',
    '.theia-mobile-open-repo-list',
    '.theia-mobile-agent-transcript',
    '.theia-mobile-agent-log-output',
    '.theia-mobile-transcript-plan',
    '.theia-mobile-transcript-verify',
    '.theia-mobile-transcript-checks-panel',
    '.theia-mobile-transcript-files-preview-body',
    '.theia-mobile-transcript-files-tree-scroll',
    '.qaap-agent-changes-scroll',
    '.qaap-diff-review-hunks',
    '.qaap-diff-review-files',
    '.theia-mobile-pr-diff',
    '.gs-container',
    '.monaco-editor .overflow-guard',
].join(',');
