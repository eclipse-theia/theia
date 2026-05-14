// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Lightweight wrapper around `navigator.vibrate(...)` for the mobile workbench.
 *
 * The Vibration API is supported by Chromium-based mobile browsers (Android Chrome,
 * Samsung Internet, etc.) but iOS Safari ignores `vibrate()` calls silently — there
 * the buttons/sheets stay perfectly usable, the user just doesn't feel a buzz.
 *
 * Patterns are deliberately short (≤ 18 ms total) so they feel like Material/iOS
 * "selection" feedback rather than a phone-call buzz. They are also gated behind a
 * coarse pointer media query so we never fire while the user is on a desktop browser
 * window resized below 768 px with a mouse.
 */
export namespace MobileHaptics {

    /** Single short pulse for taps on a primary control (sheet open, bottom-bar action). */
    export const LIGHT = 10;
    /** Slightly longer pulse for confirmations (gesture completed, sheet dismissed). */
    export const MEDIUM = 18;
    /** Two-pulse pattern for "ok"-style confirmations (tutorial step complete, etc.). */
    export const SUCCESS: ReadonlyArray<number> = [10, 40, 10];

    let cachedCoarseMq: MediaQueryList | undefined;

    function hasCoarsePointer(): boolean {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return false;
        }
        if (!cachedCoarseMq) {
            cachedCoarseMq = window.matchMedia('(pointer: coarse)');
        }
        return cachedCoarseMq.matches;
    }

    /**
     * Fire a vibration pattern. No-op when:
     *   - `navigator.vibrate` is missing (iOS Safari, desktop browsers without the API),
     *   - the device is fine-pointer (desktop with a mouse),
     *   - the document is hidden (so background tabs cannot buzz the device).
     */
    export function fire(pattern: number | ReadonlyArray<number>): void {
        if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
            return;
        }
        if (!hasCoarsePointer()) {
            return;
        }
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            return;
        }
        try {
            navigator.vibrate(pattern as number | number[]);
        } catch {
            /* Vibration policy may reject calls outside of a user-gesture handler; ignore. */
        }
    }
}
