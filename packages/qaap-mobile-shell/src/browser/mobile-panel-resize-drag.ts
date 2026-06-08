// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable } from '@theia/core/lib/common/disposable';

export interface MobilePanelResizeDragEvent {
    readonly clientX: number;
    readonly clientY: number;
    readonly startClientX: number;
    readonly startClientY: number;
}

export interface MobilePanelResizeDragOptions {
    readonly handle: HTMLElement;
    readonly enabled?: () => boolean;
    readonly onStart?: () => void;
    readonly onMove: (event: MobilePanelResizeDragEvent) => void;
    readonly onEnd?: () => void;
}

const COARSE_POINTER_MEDIA = '(pointer: coarse)';

function hasCoarsePointer(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia(COARSE_POINTER_MEDIA).matches;
}

/**
 * Pointer-first resize drag for panel split handles. Uses `setPointerCapture` on the
 * handle and listens for `pointermove` on the same element (Lumino / VS Code sash pattern).
 * On legacy environments without Pointer Events, falls back to touch listeners.
 */
export function installMobilePanelResizeDrag(options: MobilePanelResizeDragOptions): Disposable {
    const { handle, onMove, onStart, onEnd, enabled = () => true } = options;
    const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
    const useTouchFallback = !supportsPointerEvents || hasCoarsePointer();

    let activePointerId: number | undefined;
    let activeTouchId: number | undefined;
    let startClientX = 0;
    let startClientY = 0;

    const isActive = (): boolean => activePointerId !== undefined || activeTouchId !== undefined;

    const finish = (): void => {
        if (!isActive()) {
            return;
        }
        const pointerId = activePointerId;
        activePointerId = undefined;
        activeTouchId = undefined;
        if (pointerId !== undefined) {
            try {
                handle.releasePointerCapture(pointerId);
            } catch {
                /* Safari may already have released capture */
            }
        }
        onEnd?.();
    };

    const emitMove = (clientX: number, clientY: number): void => {
        onMove({
            clientX,
            clientY,
            startClientX,
            startClientY,
        });
    };

    const begin = (clientX: number, clientY: number, pointerId?: number, touchId?: number): void => {
        if (!enabled() || isActive()) {
            return;
        }
        startClientX = clientX;
        startClientY = clientY;
        activePointerId = pointerId;
        activeTouchId = touchId;
        onStart?.();
        if (pointerId !== undefined) {
            try {
                handle.setPointerCapture(pointerId);
            } catch {
                /* capture is best-effort; handle-bound listeners still receive moves */
            }
        }
    };

    const onPointerDown = (event: PointerEvent): void => {
        if (!enabled()) {
            return;
        }
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        begin(event.clientX, event.clientY, event.pointerId);
    };

    const onPointerMove = (event: PointerEvent): void => {
        if (activePointerId === undefined || event.pointerId !== activePointerId) {
            return;
        }
        event.preventDefault();
        emitMove(event.clientX, event.clientY);
    };

    const onPointerEnd = (event: PointerEvent): void => {
        if (activePointerId === undefined || event.pointerId !== activePointerId) {
            return;
        }
        finish();
    };

    const onLostPointerCapture = (): void => {
        if (activePointerId === undefined) {
            return;
        }
        finish();
    };

    const onTouchStart = (event: TouchEvent): void => {
        if (!useTouchFallback || !enabled() || isActive() || event.touches.length !== 1) {
            return;
        }
        const touch = event.touches[0];
        if (event.cancelable) {
            event.preventDefault();
        }
        event.stopPropagation();
        begin(touch.clientX, touch.clientY, undefined, touch.identifier);
    };

    const onTouchMove = (event: TouchEvent): void => {
        if (activeTouchId === undefined) {
            return;
        }
        const touch = Array.from(event.touches).find(entry => entry.identifier === activeTouchId);
        if (!touch) {
            return;
        }
        if (event.cancelable) {
            event.preventDefault();
        }
        emitMove(touch.clientX, touch.clientY);
    };

    const onTouchEnd = (event: TouchEvent): void => {
        if (activeTouchId === undefined) {
            return;
        }
        const ended = Array.from(event.changedTouches).some(entry => entry.identifier === activeTouchId);
        if (ended) {
            finish();
        }
    };

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerEnd);
    handle.addEventListener('pointercancel', onPointerEnd);
    handle.addEventListener('lostpointercapture', onLostPointerCapture);

    if (useTouchFallback) {
        handle.addEventListener('touchstart', onTouchStart, { passive: false });
        handle.addEventListener('touchmove', onTouchMove, { passive: false });
        handle.addEventListener('touchend', onTouchEnd, { passive: true });
        handle.addEventListener('touchcancel', onTouchEnd, { passive: true });
    }

    return Disposable.create(() => {
        handle.removeEventListener('pointerdown', onPointerDown);
        handle.removeEventListener('pointermove', onPointerMove);
        handle.removeEventListener('pointerup', onPointerEnd);
        handle.removeEventListener('pointercancel', onPointerEnd);
        handle.removeEventListener('lostpointercapture', onLostPointerCapture);
        if (useTouchFallback) {
            handle.removeEventListener('touchstart', onTouchStart);
            handle.removeEventListener('touchmove', onTouchMove);
            handle.removeEventListener('touchend', onTouchEnd);
            handle.removeEventListener('touchcancel', onTouchEnd);
        }
        finish();
    });
}
