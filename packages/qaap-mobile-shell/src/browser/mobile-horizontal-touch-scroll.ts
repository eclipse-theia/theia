// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';

/**
 * Touch fallback for `overflow-x: auto` strips (bottom activity bar, status bar) on iOS.
 */
export function installMobileHorizontalTouchScroll(element: HTMLElement): Disposable {
    if (typeof window === 'undefined') {
        return Disposable.NULL;
    }
    let startX = 0;
    let scrollLeft = 0;
    const onTouchStart = (event: TouchEvent): void => {
        if (event.touches.length !== 1) {
            return;
        }
        startX = event.touches[0].pageX;
        scrollLeft = element.scrollLeft;
    };
    const onTouchMove = (event: TouchEvent): void => {
        if (event.touches.length !== 1) {
            return;
        }
        element.scrollLeft = scrollLeft - (event.touches[0].pageX - startX);
    };
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: true });
    return Disposable.create(() => {
        element.removeEventListener('touchstart', onTouchStart);
        element.removeEventListener('touchmove', onTouchMove);
    });
}
