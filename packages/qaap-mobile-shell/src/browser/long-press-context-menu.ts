// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';

/** Touch long-press → synthetic `contextmenu` for coarse pointers (product layer). */
@injectable()
export class LongPressContextMenuContribution implements FrontendApplicationContribution {

    protected static readonly LONG_PRESS_MS = 500;
    protected static readonly MOVE_THRESHOLD_PX = 10;
    protected static readonly POST_FIRE_CLICK_SUPPRESS_MS = 350;

    protected timer: ReturnType<typeof setTimeout> | undefined;
    protected startX = 0;
    protected startY = 0;
    protected lastTarget: EventTarget | undefined;
    protected lastTouchId = -1;
    protected firedAt = 0;
    protected coarseMq: MediaQueryList | undefined;

    onStart(): void {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return;
        }
        this.coarseMq = window.matchMedia('(pointer: coarse)');
        document.addEventListener('touchstart', this.onTouchStart, { passive: true, capture: true });
        document.addEventListener('touchmove', this.onTouchMove, { passive: true, capture: true });
        document.addEventListener('touchend', this.onTouchEnd, { capture: true });
        document.addEventListener('touchcancel', this.onTouchCancel, { passive: true, capture: true });
        document.addEventListener('contextmenu', this.onNativeContextMenu, { capture: true });
        document.addEventListener('click', this.onClick, { capture: true });
    }

    onStop(): void {
        if (typeof document === 'undefined') {
            return;
        }
        document.removeEventListener('touchstart', this.onTouchStart, true);
        document.removeEventListener('touchmove', this.onTouchMove, true);
        document.removeEventListener('touchend', this.onTouchEnd, true);
        document.removeEventListener('touchcancel', this.onTouchCancel, true);
        document.removeEventListener('contextmenu', this.onNativeContextMenu, true);
        document.removeEventListener('click', this.onClick, true);
        this.cancelTimer();
    }

    protected isActive(): boolean {
        return !!this.coarseMq?.matches;
    }

    protected readonly onTouchStart = (ev: TouchEvent): void => {
        if (!this.isActive() || ev.touches.length !== 1) {
            this.cancelTimer();
            return;
        }
        const touch = ev.touches[0];
        this.startX = touch.clientX;
        this.startY = touch.clientY;
        this.lastTarget = ev.target ? ev.target : undefined;
        this.lastTouchId = touch.identifier;
        this.cancelTimer();
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.fireContextMenu(this.startX, this.startY, this.lastTarget);
            this.firedAt = Date.now();
        }, LongPressContextMenuContribution.LONG_PRESS_MS);
    };

    protected readonly onTouchMove = (ev: TouchEvent): void => {
        if (this.timer === undefined) {
            return;
        }
        const touch = Array.from(ev.touches).find(t => t.identifier === this.lastTouchId);
        if (!touch) {
            this.cancelTimer();
            return;
        }
        const dx = touch.clientX - this.startX;
        const dy = touch.clientY - this.startY;
        const threshold = LongPressContextMenuContribution.MOVE_THRESHOLD_PX;
        if (dx * dx + dy * dy > threshold * threshold) {
            this.cancelTimer();
        }
    };

    protected readonly onTouchEnd = (ev: TouchEvent): void => {
        this.cancelTimer();
        if (this.recentlyFired()) {
            if (ev.cancelable) {
                ev.preventDefault();
            }
        }
    };

    protected readonly onTouchCancel = (): void => {
        this.cancelTimer();
        this.firedAt = 0;
    };

    protected readonly onClick = (ev: MouseEvent): void => {
        if (this.recentlyFired()) {
            this.firedAt = 0;
            ev.preventDefault();
            ev.stopImmediatePropagation();
        }
    };

    protected readonly onNativeContextMenu = (_ev: MouseEvent): void => {
        this.cancelTimer();
    };

    protected cancelTimer(): void {
        if (this.timer !== undefined) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }

    protected recentlyFired(): boolean {
        return this.firedAt !== 0
            && (Date.now() - this.firedAt) < LongPressContextMenuContribution.POST_FIRE_CLICK_SUPPRESS_MS;
    }

    protected fireContextMenu(x: number, y: number, target: EventTarget | undefined): void {
        const init: MouseEventInit = {
            bubbles: true,
            cancelable: true,
            view: typeof window !== 'undefined' ? window : undefined,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: 2,
            buttons: 2,
        };
        const event = new MouseEvent('contextmenu', init);
        const element = (target instanceof Element ? target : undefined)
            ?? (typeof document !== 'undefined' ? document.elementFromPoint(x, y) : undefined);
        (element ?? document).dispatchEvent(event);
    }
}
