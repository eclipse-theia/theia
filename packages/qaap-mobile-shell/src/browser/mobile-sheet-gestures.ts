// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { MobileHaptics } from './mobile-haptics';

/**
 * Touch gesture helpers for the mobile sheets (Projects, Pull Requests, …).
 *
 * `installMobileSheetDragDismiss`:
 *   Adds a draggable "grabber" inside `root` (creates one if you pass
 *   {@link DragDismissOptions.createHandle}). The user can drag the sheet down
 *   to dismiss it — the panel translates with the finger, opacity falls off and,
 *   if the user passes the threshold (default 30 % of sheet height OR a
 *   minimum dispatch velocity of 0.6 px/ms), `onDismiss` is invoked. Releasing
 *   below the threshold springs the sheet back.
 *
 * `installMobilePullToRefresh`:
 *   Watches `scroller` for "overpull at top" — when the user keeps pulling
 *   while `scrollTop === 0`, a fixed-position spinner is revealed inside
 *   `host`. Crossing the threshold triggers a haptic and, on release,
 *   `onRefresh()` runs while the spinner stays visible until the returned
 *   promise resolves. Native vertical scrolling is preserved otherwise.
 *
 * Both helpers are no-ops on devices without coarse pointers (desktop /
 * trackpad) so the existing scrollbars and split-handles still work there.
 */

export interface DragDismissOptions {
    /** Element that should translate vertically and shrink in opacity. */
    target: HTMLElement;
    /** Element where the touch tracking starts; usually the header. */
    grip: HTMLElement;
    /** Called when the user has pulled past the dismiss threshold. */
    onDismiss: () => void;
    /** Optional ratio of `target.offsetHeight` to commit a dismiss. Default 0.30. */
    thresholdRatio?: number;
    /** Optional flick speed (px/ms) that commits regardless of distance. Default 0.6. */
    flickVelocity?: number;
}

const COARSE_POINTER_MEDIA = '(pointer: coarse)';

function hasCoarsePointer(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia(COARSE_POINTER_MEDIA).matches;
}

/**
 * Append a visual drag handle (grabber) at the start of `host`. Returned
 * element is also added as `data-theia-mobile-grabber`, useful for delegated
 * styling.
 */
export function createMobileSheetGrabber(): HTMLElement {
    const grabber = document.createElement('div');
    grabber.className = 'theia-mobile-sheet-grabber';
    grabber.setAttribute('aria-hidden', 'true');
    grabber.dataset.theiaMobileGrabber = 'true';
    const handle = document.createElement('span');
    handle.className = 'theia-mobile-sheet-grabber-handle';
    grabber.append(handle);
    return grabber;
}

export function installMobileSheetDragDismiss(options: DragDismissOptions): Disposable {
    if (!hasCoarsePointer()) {
        return Disposable.NULL;
    }
    const target = options.target;
    const grip = options.grip;
    const thresholdRatio = options.thresholdRatio ?? 0.30;
    const flickVelocity = options.flickVelocity ?? 0.6;

    let startY = 0;
    let startTime = 0;
    let lastY = 0;
    let lastTime = 0;
    let trackedId: number | undefined;
    let active = false;

    function reset(): void {
        active = false;
        trackedId = undefined;
        startY = 0;
        startTime = 0;
        lastY = 0;
        lastTime = 0;
        target.style.transition = '';
        target.style.transform = '';
        target.style.opacity = '';
    }

    function commit(dismiss: boolean): void {
        if (dismiss) {
            // Slide the sheet off-screen before invoking `onDismiss` so the
            // dismissal animation feels continuous with the gesture.
            target.style.transition = 'transform 180ms ease-out, opacity 180ms ease-out';
            target.style.transform = `translateY(${target.offsetHeight}px)`;
            target.style.opacity = '0';
            window.setTimeout(() => {
                reset();
                options.onDismiss();
            }, 170);
            MobileHaptics.fire(MobileHaptics.MEDIUM);
        } else {
            target.style.transition = 'transform 220ms cubic-bezier(.18,.89,.32,1.12), opacity 220ms ease-out';
            target.style.transform = '';
            target.style.opacity = '';
            window.setTimeout(() => reset(), 230);
        }
    }

    const onTouchStart = (ev: TouchEvent): void => {
        if (ev.touches.length !== 1) {
            return;
        }
        const touch = ev.touches[0];
        startY = touch.clientY;
        lastY = touch.clientY;
        startTime = Date.now();
        lastTime = startTime;
        trackedId = touch.identifier;
        active = true;
        // Disable transition so the drag stays glued to the finger.
        target.style.transition = 'none';
    };

    const onTouchMove = (ev: TouchEvent): void => {
        if (!active || trackedId === undefined) {
            return;
        }
        const touch = Array.from(ev.touches).find(t => t.identifier === trackedId);
        if (!touch) {
            return;
        }
        const dy = touch.clientY - startY;
        lastY = touch.clientY;
        lastTime = Date.now();
        if (dy <= 0) {
            target.style.transform = '';
            target.style.opacity = '';
            return;
        }
        // Block the underlying scroll only while we are clearly pulling down on the grip.
        if (ev.cancelable && dy > 4) {
            ev.preventDefault();
        }
        const opacity = Math.max(0.4, 1 - dy / (target.offsetHeight * 1.6));
        target.style.transform = `translateY(${dy}px)`;
        target.style.opacity = `${opacity}`;
    };

    const onTouchEnd = (): void => {
        if (!active) {
            return;
        }
        const dy = lastY - startY;
        const dt = Math.max(1, lastTime - startTime);
        const velocity = dy / dt;
        const threshold = target.offsetHeight * thresholdRatio;
        commit(dy >= threshold || velocity >= flickVelocity);
    };

    const onTouchCancel = (): void => {
        if (active) {
            commit(false);
        }
    };

    grip.addEventListener('touchstart', onTouchStart, { passive: true });
    grip.addEventListener('touchmove', onTouchMove, { passive: false });
    grip.addEventListener('touchend', onTouchEnd, { passive: true });
    grip.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return Disposable.create(() => {
        grip.removeEventListener('touchstart', onTouchStart);
        grip.removeEventListener('touchmove', onTouchMove);
        grip.removeEventListener('touchend', onTouchEnd);
        grip.removeEventListener('touchcancel', onTouchCancel);
        reset();
    });
}

export interface PullToRefreshOptions {
    /** Element that contains the scrollable content (the one whose `scrollTop` we read). */
    scroller: HTMLElement;
    /** Element that hosts the absolutely-positioned spinner indicator (usually `scroller`'s parent or itself). */
    host: HTMLElement;
    /** Called when the threshold is crossed and the user releases. Should resolve when refresh completes. */
    onRefresh: () => Promise<void> | void;
    /** Pixels of pull needed to commit. Default `60`. */
    threshold?: number;
    /** Maximum visual travel of the indicator. Default `90`. */
    maxTravel?: number;
}

export function installMobilePullToRefresh(options: PullToRefreshOptions): Disposable {
    if (!hasCoarsePointer()) {
        return Disposable.NULL;
    }
    const { scroller, host, onRefresh } = options;
    const threshold = options.threshold ?? 60;
    const maxTravel = options.maxTravel ?? 90;

    const indicator = document.createElement('div');
    indicator.className = 'theia-mobile-pull-refresh';
    indicator.setAttribute('aria-hidden', 'true');
    const spinner = document.createElement('span');
    spinner.className = 'theia-mobile-pull-refresh-spinner codicon codicon-sync';
    indicator.append(spinner);
    host.appendChild(indicator);

    let startY = 0;
    let trackedId: number | undefined;
    let dragging = false;
    let refreshing = false;
    let armed = false;

    function setIndicatorTravel(travelPx: number): void {
        const clamped = Math.max(0, Math.min(maxTravel, travelPx));
        indicator.style.transform = `translate3d(-50%, ${clamped - 32}px, 0)`;
        const progress = Math.min(1, travelPx / threshold);
        spinner.style.opacity = `${Math.max(0.4, progress)}`;
        spinner.style.transform = `rotate(${progress * 360}deg)`;
        if (travelPx >= threshold && !armed) {
            armed = true;
            indicator.classList.add('theia-mod-armed');
            MobileHaptics.fire(MobileHaptics.LIGHT);
        } else if (travelPx < threshold && armed) {
            armed = false;
            indicator.classList.remove('theia-mod-armed');
        }
    }

    function settle(commit: boolean): void {
        dragging = false;
        if (commit && !refreshing) {
            refreshing = true;
            indicator.classList.add('theia-mod-refreshing');
            indicator.style.transition = 'transform 180ms ease-out';
            indicator.style.transform = `translate3d(-50%, ${threshold - 32}px, 0)`;
            const result = onRefresh();
            const done = result instanceof Promise ? result : Promise.resolve();
            done.finally(() => {
                refreshing = false;
                armed = false;
                indicator.classList.remove('theia-mod-armed', 'theia-mod-refreshing');
                indicator.style.transition = 'transform 220ms ease-in';
                indicator.style.transform = '';
                window.setTimeout(() => {
                    if (!dragging && !refreshing) {
                        indicator.style.transition = '';
                    }
                }, 250);
            });
        } else {
            armed = false;
            indicator.classList.remove('theia-mod-armed');
            indicator.style.transition = 'transform 200ms ease-out';
            indicator.style.transform = '';
            window.setTimeout(() => {
                if (!dragging && !refreshing) {
                    indicator.style.transition = '';
                }
            }, 220);
        }
    }

    const onTouchStart = (ev: TouchEvent): void => {
        if (refreshing || ev.touches.length !== 1) {
            return;
        }
        if (scroller.scrollTop > 0) {
            trackedId = undefined;
            return;
        }
        const touch = ev.touches[0];
        startY = touch.clientY;
        trackedId = touch.identifier;
        dragging = false;
        indicator.style.transition = 'none';
    };

    const onTouchMove = (ev: TouchEvent): void => {
        if (refreshing || trackedId === undefined) {
            return;
        }
        const touch = Array.from(ev.touches).find(t => t.identifier === trackedId);
        if (!touch) {
            return;
        }
        const dy = touch.clientY - startY;
        if (dy <= 0 || scroller.scrollTop > 0) {
            if (dragging) {
                settle(false);
            }
            dragging = false;
            return;
        }
        if (!dragging && dy > 6) {
            dragging = true;
        }
        if (!dragging) {
            return;
        }
        // Stretch with resistance — beyond `threshold * 1.5` the indicator
        // travels only fractionally further, communicating a soft limit.
        const linear = Math.min(threshold * 1.5, dy * 0.6);
        const past = Math.max(0, dy * 0.6 - threshold * 1.5);
        const travel = linear + past * 0.25;
        if (ev.cancelable) {
            ev.preventDefault();
        }
        setIndicatorTravel(travel);
    };

    const onTouchEnd = (): void => {
        if (refreshing || !dragging) {
            trackedId = undefined;
            return;
        }
        trackedId = undefined;
        settle(armed);
    };

    const onTouchCancel = (): void => {
        trackedId = undefined;
        if (dragging) {
            settle(false);
        }
    };

    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', onTouchEnd, { passive: true });
    scroller.addEventListener('touchcancel', onTouchCancel, { passive: true });

    const toDispose = new DisposableCollection(
        Disposable.create(() => scroller.removeEventListener('touchstart', onTouchStart)),
        Disposable.create(() => scroller.removeEventListener('touchmove', onTouchMove)),
        Disposable.create(() => scroller.removeEventListener('touchend', onTouchEnd)),
        Disposable.create(() => scroller.removeEventListener('touchcancel', onTouchCancel)),
        Disposable.create(() => indicator.parentElement?.removeChild(indicator)),
    );
    return toDispose;
}
