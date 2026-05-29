// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';

/** Scroll hosts that should receive the horizontal touch fallback on mobile. */
export const MOBILE_HORIZONTAL_SCROLL_SELECTOR = [
    '.lm-TabBar-content-container',
    '.lm-DockPanel-tabBar[data-orientation="horizontal"]',
    '.theia-mobile-bottom-activity-bar',
    '#theia-statusBar',
    '.theia-statusBar-track',
    '.theia-mobile-keyboard-accessory',
    '.theia-mobile-keyboard-accessory-page',
    '.theia-mobile-projects-filters',
    '.theia-mobile-pr-picker',
    '.theia-mobile-pr-quick-row',
].join(',');

/** Prefer horizontal pan on tab strips so Lumino tab-drag does not steal the gesture. */
const TAB_STRIP_SCROLL_SELECTOR =
    '.lm-DockPanel-tabBar[data-orientation="horizontal"], .lm-TabBar-content-container';

/**
 * Touch fallback for `overflow-x: auto` strips (bottom activity bar, status bar) on iOS.
 */
export function installMobileHorizontalTouchScroll(element: HTMLElement): Disposable {
    if (typeof window === 'undefined') {
        return Disposable.NULL;
    }
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let axisLocked = false;
    let lockToHorizontal = false;
    const threshold = 6;

    const isTabStrip = element.matches(TAB_STRIP_SCROLL_SELECTOR);
    const canScroll = (): boolean => element.scrollWidth > element.clientWidth + 1;

    const resolveHorizontalLock = (dx: number, dy: number): boolean => {
        if (isTabStrip && Math.abs(dx) > threshold) {
            return Math.abs(dx) >= Math.abs(dy) * 0.65;
        }
        return Math.abs(dx) >= Math.abs(dy);
    };

    const onTouchStart = (event: TouchEvent): void => {
        if (event.touches.length !== 1 || !canScroll()) {
            return;
        }
        startX = event.touches[0].pageX;
        startY = event.touches[0].pageY;
        scrollLeft = element.scrollLeft;
        axisLocked = false;
        lockToHorizontal = false;
    };
    const onTouchMove = (event: TouchEvent): void => {
        if (event.touches.length !== 1 || !canScroll()) {
            return;
        }
        const dx = event.touches[0].pageX - startX;
        const dy = event.touches[0].pageY - startY;
        if (!axisLocked) {
            if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
                return;
            }
            axisLocked = true;
            lockToHorizontal = resolveHorizontalLock(dx, dy);
        }
        if (!lockToHorizontal) {
            return;
        }
        if (event.cancelable) {
            event.preventDefault();
        }
        element.scrollLeft = scrollLeft - dx;
    };
    const stop = (): void => {
        axisLocked = false;
        lockToHorizontal = false;
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
    });
}
