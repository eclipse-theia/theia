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

import { inject, injectable } from 'inversify';
import { CommandRegistry } from '../../common/command';
import { FrontendApplicationContribution } from '../frontend-application-contribution';
import { CommonCommands } from '../common-commands';
import { MobileHaptics } from './mobile-haptics';

/** Matches the breakpoint used by the rest of the mobile workbench. */
const MOBILE_MEDIA = '(max-width: 767px)';

/** Monaco's built-in editor commands; safe as string IDs to avoid hard-depending on monaco-editor here. */
const MONACO_FONT_ZOOM_IN = 'editor.action.fontZoomIn';
const MONACO_FONT_ZOOM_OUT = 'editor.action.fontZoomOut';

interface PointerSnapshot {
    id: number;
    x: number;
    y: number;
}

/**
 * Two-finger editor gestures for the narrow-viewport workbench:
 *
 *   1. Pinch-to-zoom: when both fingers move radially (distance changes ≥ 12 % from baseline)
 *      we dispatch Monaco's `editor.action.fontZoomIn` / `fontZoomOut` repeatedly until the
 *      gesture ends. The same threshold is used to debounce subsequent steps so a continuous
 *      pinch produces multiple zoom steps without spamming the command service.
 *
 *   2. Two-finger horizontal swipe: when both fingers translate horizontally by ≥ 60 px with
 *      vertical deviation under 32 px (per finger) and the radial change is below the pinch
 *      threshold, we navigate between editor tabs (`NEXT_TAB_IN_GROUP` / `PREVIOUS_TAB_IN_GROUP`).
 *
 * Gestures are scoped to `.monaco-editor` and `.theia-main-content-panel` descendants so they
 * never compete with the side-sheet swipes (`MobileOneColumnShellContribution`) or with
 * Lumino's own widget pointer handling.
 */
@injectable()
export class MobileEditorGestureContribution implements FrontendApplicationContribution {

    /** Minimum relative distance change (|d1/d0 - 1|) to consider the gesture a pinch. */
    protected static readonly PINCH_RATIO_THRESHOLD = 0.12;
    /** Horizontal pixels both fingers must travel for a swipe to register. */
    protected static readonly SWIPE_MIN_DX = 60;
    /** Per-finger vertical deviation tolerated during a horizontal swipe. */
    protected static readonly SWIPE_MAX_DY = 32;
    /** Pixels of horizontal travel between two consecutive zoom steps within the same pinch. */
    protected static readonly PINCH_STEP_RATIO = 0.18;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    protected mobileMq: MediaQueryList | undefined;
    protected coarseMq: MediaQueryList | undefined;
    protected attached = false;

    protected startPointers: PointerSnapshot[] = [];
    protected lastZoomDistance = 0;
    protected swipeFired = false;
    protected gestureTarget: HTMLElement | undefined;

    onStart(): void {
        if (typeof window === 'undefined') {
            return;
        }
        this.mobileMq = window.matchMedia(MOBILE_MEDIA);
        this.coarseMq = window.matchMedia('(pointer: coarse)');
        this.mobileMq.addEventListener('change', this.refreshAttached);
        this.coarseMq.addEventListener('change', this.refreshAttached);
        this.refreshAttached();
    }

    onStop(): void {
        this.mobileMq?.removeEventListener('change', this.refreshAttached);
        this.coarseMq?.removeEventListener('change', this.refreshAttached);
        this.detachListeners();
    }

    protected readonly refreshAttached = (): void => {
        const shouldAttach = !!this.mobileMq?.matches || !!this.coarseMq?.matches;
        if (shouldAttach && !this.attached) {
            this.attachListeners();
        } else if (!shouldAttach && this.attached) {
            this.detachListeners();
        }
    };

    protected attachListeners(): void {
        if (typeof document === 'undefined' || this.attached) {
            return;
        }
        this.attached = true;
        // Non-passive touchstart/move so we can preventDefault and stop iOS browser-level pinch zoom.
        document.addEventListener('touchstart', this.onTouchStart, { passive: false, capture: true });
        document.addEventListener('touchmove', this.onTouchMove, { passive: false, capture: true });
        document.addEventListener('touchend', this.onTouchEnd, { passive: true, capture: true });
        document.addEventListener('touchcancel', this.onTouchCancel, { passive: true, capture: true });
    }

    protected detachListeners(): void {
        if (typeof document === 'undefined' || !this.attached) {
            return;
        }
        this.attached = false;
        document.removeEventListener('touchstart', this.onTouchStart, true);
        document.removeEventListener('touchmove', this.onTouchMove, true);
        document.removeEventListener('touchend', this.onTouchEnd, true);
        document.removeEventListener('touchcancel', this.onTouchCancel, true);
        this.resetGesture();
    }

    protected resetGesture(): void {
        this.startPointers = [];
        this.lastZoomDistance = 0;
        this.swipeFired = false;
        this.gestureTarget = undefined;
    }

    /**
     * Only react to gestures that originate inside the editor area. Other touch targets (side
     * sheets, file tree, agent panel) must keep their native or Lumino-defined behavior so
     * scrolling and component drag-handles continue to work.
     */
    protected isEditorTarget(target: EventTarget | null): HTMLElement | undefined {
        if (!(target instanceof Element)) {
            return undefined;
        }
        const monaco = target.closest('.monaco-editor');
        if (monaco instanceof HTMLElement) {
            return monaco;
        }
        return undefined;
    }

    protected readonly onTouchStart = (e: TouchEvent): void => {
        if (e.touches.length !== 2) {
            this.resetGesture();
            return;
        }
        const target = this.isEditorTarget(e.target);
        if (!target) {
            this.resetGesture();
            return;
        }
        this.gestureTarget = target;
        this.startPointers = [
            { id: e.touches[0].identifier, x: e.touches[0].clientX, y: e.touches[0].clientY },
            { id: e.touches[1].identifier, x: e.touches[1].clientX, y: e.touches[1].clientY },
        ];
        this.lastZoomDistance = this.distance(this.startPointers[0], this.startPointers[1]);
        this.swipeFired = false;
        // Suppress iOS browser pinch zoom inside the editor — we hand it off to Monaco's font zoom.
        if (e.cancelable) {
            e.preventDefault();
        }
    };

    protected readonly onTouchMove = (e: TouchEvent): void => {
        if (this.startPointers.length !== 2 || e.touches.length < 2) {
            return;
        }
        const p0 = this.snapshotFor(e, this.startPointers[0].id);
        const p1 = this.snapshotFor(e, this.startPointers[1].id);
        if (!p0 || !p1) {
            return;
        }
        const startDist = this.distance(this.startPointers[0], this.startPointers[1]);
        const currentDist = this.distance(p0, p1);
        const ratio = startDist > 0 ? currentDist / startDist : 1;
        const sinceLastStepRatio = this.lastZoomDistance > 0 ? currentDist / this.lastZoomDistance : 1;
        const radialDelta = Math.abs(ratio - 1);
        const horizontalDelta = Math.min(
            Math.abs(p0.x - this.startPointers[0].x),
            Math.abs(p1.x - this.startPointers[1].x)
        );
        const verticalDelta = Math.max(
            Math.abs(p0.y - this.startPointers[0].y),
            Math.abs(p1.y - this.startPointers[1].y)
        );

        // Treat as a pinch as soon as fingers diverge/converge enough; ignore once the gesture has
        // been claimed as a swipe to avoid surprising the user mid-flick.
        if (!this.swipeFired && radialDelta >= MobileEditorGestureContribution.PINCH_RATIO_THRESHOLD) {
            if (e.cancelable) {
                e.preventDefault();
            }
            if (Math.abs(sinceLastStepRatio - 1) >= MobileEditorGestureContribution.PINCH_STEP_RATIO) {
                if (sinceLastStepRatio > 1) {
                    this.executeIfAvailable(MONACO_FONT_ZOOM_IN);
                } else {
                    this.executeIfAvailable(MONACO_FONT_ZOOM_OUT);
                }
                MobileHaptics.fire(MobileHaptics.LIGHT);
                this.lastZoomDistance = currentDist;
            }
            return;
        }

        // Two-finger horizontal swipe: both fingers translated in the same direction without diverging.
        if (
            !this.swipeFired
            && radialDelta < MobileEditorGestureContribution.PINCH_RATIO_THRESHOLD
            && horizontalDelta >= MobileEditorGestureContribution.SWIPE_MIN_DX
            && verticalDelta <= MobileEditorGestureContribution.SWIPE_MAX_DY
        ) {
            const dx0 = p0.x - this.startPointers[0].x;
            const dx1 = p1.x - this.startPointers[1].x;
            if (Math.sign(dx0) === Math.sign(dx1) && dx0 !== 0) {
                this.swipeFired = true;
                if (e.cancelable) {
                    e.preventDefault();
                }
                if (dx0 < 0) {
                    this.executeIfAvailable(CommonCommands.NEXT_TAB_IN_GROUP.id);
                } else {
                    this.executeIfAvailable(CommonCommands.PREVIOUS_TAB_IN_GROUP.id);
                }
                MobileHaptics.fire(MobileHaptics.MEDIUM);
            }
        }
    };

    protected readonly onTouchEnd = (_e: TouchEvent): void => {
        this.resetGesture();
    };

    protected readonly onTouchCancel = (_e: TouchEvent): void => {
        this.resetGesture();
    };

    protected snapshotFor(e: TouchEvent, id: number): PointerSnapshot | undefined {
        for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            if (t.identifier === id) {
                return { id, x: t.clientX, y: t.clientY };
            }
        }
        return undefined;
    }

    protected distance(a: PointerSnapshot, b: PointerSnapshot): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    protected executeIfAvailable(commandId: string): void {
        if (!this.commands.getCommand(commandId)) {
            return;
        }
        void this.commands.executeCommand(commandId).catch(() => undefined);
    }
}
