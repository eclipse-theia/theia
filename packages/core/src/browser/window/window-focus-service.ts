// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

// based on https://github.com/microsoft/vscode/blob/ea6aac971b851ff8675f9ea04f8c0dfc36034a89/src/vs/workbench/services/host/browser/browserHostService.ts
// and https://github.com/microsoft/vscode/blob/ea6aac971b851ff8675f9ea04f8c0dfc36034a89/src/vs/base/browser/dom.ts#L1319 (FocusTracker)
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { injectable, postConstruct } from 'inversify';
import { Disposable, DisposableCollection, Emitter, Event } from '../../common';

export interface WindowFocusEvent {
    win: Window;
    hasFocus: boolean;
}

/**
 * Tracks focus state for each registered application window independently.
 *
 * The main window is registered automatically. Secondary windows should be
 * registered via {@link registerWindow} — typically by the service responsible
 * for creating them.
 *
 * Uses two complementary signals per window for robust detection:
 * - `window` `focus`/`blur` events (OS-level window focus changes)
 * - `document` `visibilitychange` events (browser tab switches)
 *
 * Blur events are debounced per window with `setTimeout(0)` so that focus
 * moving between elements within the same window does not produce a false
 * blur: the subsequent `focus` event cancels the pending blur before it fires.
 *
 * Each per-window event is latched — it only fires when that window's focus
 * state actually changes.
 */
@injectable()
export class WindowFocusService implements Disposable {

    protected readonly onDidWindowChangeFocusEmitter = new Emitter<WindowFocusEvent>();

    /**
     * Fires when an individual window's focus state changes.
     * The event payload identifies which window changed and whether it gained or lost focus.
     *
     * A window losing focus to another application window will fire separately
     * for each window involved: one event with `hasFocus: false` for the window
     * that lost focus, and one with `hasFocus: true` for the window that gained it.
     */
    readonly onDidWindowChangeFocus: Event<WindowFocusEvent> = this.onDidWindowChangeFocusEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onDidWindowChangeFocusEmitter);

    /** Per-window tracking state. */
    protected readonly windowStates = new Map<Window, WindowTrackingState>();

    @postConstruct()
    protected init(): void {
        this.registerWindow(window);
    }

    /**
     * Register a window for focus tracking. The returned {@link Disposable}
     * removes the window from tracking when disposed.
     *
     * The main window is registered automatically. Call this for secondary
     * windows when they are created.
     */
    registerWindow(win: Window): Disposable {
        if (this.windowStates.has(win)) {
            return Disposable.NULL;
        }

        const state: WindowTrackingState = {
            lastFocusState: this.windowHasFocus(win),
            pendingBlurTimeout: undefined,
        };
        this.windowStates.set(win, state);

        const onFocus = () => this.handleFocus(win, state);
        const onBlur = () => this.scheduleBlur(win, state);
        const onVisibilityChange = () => this.updateWindowFocusState(win, state);

        win.addEventListener('focus', onFocus);
        win.addEventListener('blur', onBlur);
        win.document.addEventListener('visibilitychange', onVisibilityChange);

        const cleanup = Disposable.create(() => {
            this.cancelPendingBlur(state);
            this.windowStates.delete(win);
            win.removeEventListener('focus', onFocus);
            win.removeEventListener('blur', onBlur);
            try {
                win.document.removeEventListener('visibilitychange', onVisibilityChange);
            } catch {
                // The window may already be closed
            }
        });

        this.toDispose.push(cleanup);
        return cleanup;
    }

    /**
     * Whether any registered window currently has focus.
     */
    get hasFocus(): boolean {
        for (const win of this.windowStates.keys()) {
            if (this.windowHasFocus(win)) {
                return true;
            }
        }
        return false;
    }

    protected windowHasFocus(win: Window): boolean {
        try {
            return win.document.hasFocus();
        } catch {
            // The window may have been closed
            return false;
        }
    }

    protected handleFocus(win: Window, state: WindowTrackingState): void {
        // Cancel this window's pending blur — focus arrived before the timeout,
        // meaning focus just moved between elements within this window.
        this.cancelPendingBlur(state);
        this.updateWindowFocusState(win, state);
    }

    /**
     * Schedule a deferred blur check for this specific window.
     * If no `focus` event arrives on this same window before the timeout fires,
     * we treat it as a real focus loss for that window.
     */
    protected scheduleBlur(win: Window, state: WindowTrackingState): void {
        this.cancelPendingBlur(state);
        state.pendingBlurTimeout = setTimeout(() => {
            state.pendingBlurTimeout = undefined;
            this.updateWindowFocusState(win, state);
        }, 0);
    }

    protected cancelPendingBlur(state: WindowTrackingState): void {
        if (state.pendingBlurTimeout !== undefined) {
            clearTimeout(state.pendingBlurTimeout);
            state.pendingBlurTimeout = undefined;
        }
    }

    /**
     * Re-evaluate a single window's focus and fire if it changed (latching).
     */
    protected updateWindowFocusState(win: Window, state: WindowTrackingState): void {
        const focused = this.windowHasFocus(win);
        if (focused !== state.lastFocusState) {
            state.lastFocusState = focused;
            this.onDidWindowChangeFocusEmitter.fire({ win, hasFocus: focused });
        }
    }

    dispose(): void {
        for (const state of this.windowStates.values()) {
            this.cancelPendingBlur(state);
        }
        this.toDispose.dispose();
    }
}

interface WindowTrackingState {
    lastFocusState: boolean;
    pendingBlurTimeout: ReturnType<typeof setTimeout> | undefined;
}
