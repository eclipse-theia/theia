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

import { injectable, postConstruct } from 'inversify';
import { MimeData } from '@lumino/coreutils';
import { Drag } from '@lumino/dragdrop';
import { TabBar, Title, Widget } from '@lumino/widgets';
import { Disposable } from '../../common/disposable';
import { Emitter, Event } from '../../common/event';

/**
 * The mime type that Lumino drop targets, e.g. dock panels, expect for dragged widgets.
 */
export const WIDGET_FACTORY_MIME_TYPE = 'application/vnd.lumino.widget-factory';

export interface TabDropOutsideWindowsEvent {
    /** The title of the dragged tab. */
    title: Title<Widget>;
    /** The horizontal screen coordinate at which the tab was released. */
    screenX: number;
    /** The vertical screen coordinate at which the tab was released. */
    screenY: number;
}

export interface TabDropEvent {
    /** The title of the dropped tab. */
    title: Title<Widget>;
    /** The window in which the tab has been dropped. */
    window: Window;
}

type LuminoDragEventType = 'lm-dragenter' | 'lm-dragover' | 'lm-dragleave' | 'lm-dragexit' | 'lm-drop';

interface NativeTabDragSession {
    readonly title: Title<Widget>;
    readonly source: Widget;
    readonly mimeData: MimeData;
}

interface WindowDragState {
    readonly window: Window;
    /** The Lumino drag object used to create the Lumino drag events dispatched in this window. */
    drag?: Drag;
    /** The element under the pointer during the last drag event. */
    currentElement?: Element;
    /** The element that accepted the Lumino `lm-dragenter` event. */
    currentTarget?: Element;
    /** The drop action of the last `lm-dragover` event. */
    dropAction: Drag.DropAction;
    /** Whether the pointer is currently over this window. */
    inside: boolean;
    leaveTimeout?: number;
}

/**
 * Drags the tabs of dock panels with native HTML drag and drop instead of Lumino's pointer based drag and drop.
 * Native drags work across windows, e.g. secondary windows, and show the drag image outside of the window as well.
 *
 * Drop targets are not aware of this: the native drag events are translated to the Lumino drag events
 * (`lm-dragenter`, `lm-dragover`, `lm-dragleave` and `lm-drop`) that Lumino drop targets handle.
 */
@injectable()
export class NativeTabDragService {

    static readonly MIME_TYPE = 'application/vnd.theia.dock-panel-tab';

    /**
     * The time without native drag events in a window after which the pointer is considered to have left the window.
     * Native `dragleave` events are also fired when the pointer moves between the elements of a window,
     * while native `dragover` events are fired continuously as long as the pointer is over a window.
     */
    protected static readonly LEAVE_DELAY = 150;

    protected session: NativeTabDragSession | undefined;
    protected readonly windows = new Map<Window, WindowDragState>();

    protected readonly onDidDropTabOutsideWindowsEmitter = new Emitter<TabDropOutsideWindowsEvent>();
    /**
     * Emitted when a tab is released outside of all windows of the application, e.g. over the desktop.
     */
    readonly onDidDropTabOutsideWindows: Event<TabDropOutsideWindowsEvent> = this.onDidDropTabOutsideWindowsEmitter.event;

    protected readonly onDidDropTabEmitter = new Emitter<TabDropEvent>();
    /**
     * Emitted when a tab has been dropped on a drop target in one of the windows of the application.
     */
    readonly onDidDropTab: Event<TabDropEvent> = this.onDidDropTabEmitter.event;

    protected readonly onDidStartDragEmitter = new Emitter<DragEvent>();
    /**
     * Emitted when a tab drag has started, with its `dragstart` event.
     */
    readonly onDidStartDrag: Event<DragEvent> = this.onDidStartDragEmitter.event;

    protected readonly onDidEndDragEmitter = new Emitter<DragEvent>();
    /**
     * Emitted when a tab drag has ended, with its `dragend` event, or with the `drop` event of a successful drop.
     * Native drags end without a `mouseup` event.
     */
    readonly onDidEndDrag: Event<DragEvent> = this.onDidEndDragEmitter.event;

    @postConstruct()
    protected init(): void {
        this.installWindow(window);
    }

    /**
     * Translates the native drag events of tab drags in the given window to Lumino drag events.
     */
    installWindow(win: Window): Disposable {
        if (this.windows.has(win)) {
            return Disposable.NULL;
        }
        const state: WindowDragState = { window: win, dropAction: 'none', inside: false };
        this.windows.set(win, state);
        const listener = (event: DragEvent) => this.handleDragEvent(state, event);
        const types = ['dragenter', 'dragover', 'dragleave', 'drop'];
        // Listen on the window in the capture phase to handle tab drags before any other drop target, e.g. Monaco or file drops.
        types.forEach(type => win.addEventListener(type, listener, true));
        return Disposable.create(() => {
            types.forEach(type => win.removeEventListener(type, listener, true));
            this.resetWindow(state);
            this.windows.delete(win);
        });
    }

    /**
     * Starts dragging the given tab. To be called from the `dragstart` event of the tab.
     *
     * @param source the widget that is reported as the source of the Lumino drag events, i.e. the dock panel containing the tab bar
     */
    startDrag(event: DragEvent, tabBar: TabBar<Widget>, title: Title<Widget>, source: Widget): void {
        // not using `instanceof`, the tab may be in a secondary window, i.e. in another JavaScript realm
        const tab = (event.target as Element | null)?.closest?.('.lm-TabBar-tab');
        if (!event.dataTransfer || !tab) {
            event.preventDefault();
            return;
        }
        // Only set our own type, so that other applications don't accept the drop.
        event.dataTransfer.setData(NativeTabDragService.MIME_TYPE, title.owner.id);
        // like VS Code, drop targets only ever move tabs, though
        event.dataTransfer.effectAllowed = 'copyMove';
        const tabRect = tab.getBoundingClientRect();
        event.dataTransfer.setDragImage(tab, event.clientX - tabRect.left, event.clientY - tabRect.top);

        const mimeData = new MimeData();
        mimeData.setData(WIDGET_FACTORY_MIME_TYPE, () => title.owner);
        this.session = { title, source, mimeData };
        // The native drag cancels the pointer events, so Lumino never sees the release of its press on the tab.
        tabBar.releaseMouse();
        this.onDidStartDragEmitter.fire(event);
    }

    /**
     * Ends the current tab drag. To be called from the `dragend` event of the tab.
     */
    endDrag(event: DragEvent): void {
        const session = this.session;
        if (!session) {
            return;
        }
        // a successful drop has ended the session already, see `handleDrop`
        const insideWindows = this.isInsideWindows(event);
        this.endSession(event);
        if (!insideWindows && event.dataTransfer?.dropEffect === 'none' && !session.title.owner.isDisposed) {
            this.onDidDropTabOutsideWindowsEmitter.fire({ title: session.title, screenX: event.screenX, screenY: event.screenY });
        }
    }

    protected handleDragEvent(state: WindowDragState, event: DragEvent): void {
        if (!this.session || !event.dataTransfer?.types.includes(NativeTabDragService.MIME_TYPE)) {
            return;
        }
        // Tab drags are only handled by Lumino drop targets.
        event.stopPropagation();
        switch (event.type) {
            case 'dragenter':
            case 'dragover':
                this.handleDragOver(state, event);
                break;
            case 'dragleave':
                this.scheduleLeave(state);
                break;
            case 'drop':
                this.handleDrop(state, event);
                break;
        }
    }

    protected handleDragOver(state: WindowDragState, event: DragEvent): void {
        state.inside = true;
        this.cancelLeave(state);
        this.updateCurrentTarget(state, event);
        if (state.dropAction !== 'none') {
            event.preventDefault();
            event.dataTransfer!.dropEffect = 'move';
        } else {
            event.dataTransfer!.dropEffect = 'none';
        }
    }

    protected handleDrop(state: WindowDragState, event: DragEvent): void {
        event.preventDefault();
        this.cancelLeave(state);
        this.updateCurrentTarget(state, event);
        const target = state.currentTarget;
        let action: Drag.DropAction = 'none';
        if (target) {
            if (state.dropAction === 'none') {
                this.dispatch(state, 'lm-dragleave', target, event, undefined);
            } else {
                action = this.dispatch(state, 'lm-drop', target, event, undefined).dropAction;
            }
        }
        // The drop target has handled the drop, so it must not get a leave event when the drag ends.
        state.currentTarget = undefined;
        state.currentElement = undefined;
        state.dropAction = 'none';
        const title = this.session?.title;
        if (action !== 'none' && title) {
            // The drop may close the window the drag started in, e.g. when its last tab has been moved, so `dragend` may never be fired.
            this.endSession(event);
            this.onDidDropTabEmitter.fire({ title, window: state.window });
        }
    }

    /**
     * Ends the current drag session and notifies the drop targets under the pointer that the drag has left them.
     *
     * @param event the event that ends the drag, i.e. its `dragend` event or the `drop` event of a successful drop
     */
    protected endSession(event: DragEvent): void {
        this.session = undefined;
        for (const state of this.windows.values()) {
            this.resetWindow(state);
        }
        this.onDidEndDragEmitter.fire(event);
    }

    /**
     * @returns whether the pointer is over one of the windows at the end of the given drag event
     */
    protected isInsideWindows(event: DragEvent): boolean {
        for (const state of this.windows.values()) {
            // A window is only considered left some time after its last `dragleave` event, see `LEAVE_DELAY`.
            // If the drag ends in the meantime, the position of the pointer tells whether it has left the window.
            if (state.inside && (state.leaveTimeout === undefined || this.containsScreenPoint(state.window, event.screenX, event.screenY))) {
                return true;
            }
        }
        return false;
    }

    protected containsScreenPoint(win: Window, screenX: number, screenY: number): boolean {
        return !win.closed && screenX >= win.screenX && screenX < win.screenX + win.outerWidth
            && screenY >= win.screenY && screenY < win.screenY + win.outerHeight;
    }

    /**
     * Updates the Lumino drop target under the pointer, following `Drag._updateCurrentTarget` in `@lumino/dragdrop`.
     */
    protected updateCurrentTarget(state: WindowDragState, event: DragEvent): void {
        const prevTarget = state.currentTarget;
        let currTarget = state.currentTarget;
        const prevElem = state.currentElement;
        const currElem = state.window.document.elementFromPoint(event.clientX, event.clientY) ?? undefined;
        state.currentElement = currElem;
        if (currElem !== prevElem && currElem !== currTarget) {
            if (currTarget) {
                this.dispatch(state, 'lm-dragexit', currTarget, event, currElem);
            }
            currTarget = this.dispatchDragEnter(state, currElem, currTarget, event);
        }
        if (currTarget !== prevTarget) {
            state.currentTarget = currTarget;
            if (prevTarget) {
                this.dispatch(state, 'lm-dragleave', prevTarget, event, currTarget);
            }
        }
        if (!currTarget) {
            state.dropAction = 'none';
            return;
        }
        const dragOver = this.dispatch(state, 'lm-dragover', currTarget, event, undefined);
        state.dropAction = dragOver.defaultPrevented ? dragOver.dropAction : 'none';
    }

    /**
     * Follows `Private.dispatchDragEnter` in `@lumino/dragdrop`.
     */
    protected dispatchDragEnter(state: WindowDragState, currElem: Element | undefined, currTarget: Element | undefined, event: DragEvent): Element | undefined {
        if (!currElem) {
            return undefined;
        }
        if (this.dispatch(state, 'lm-dragenter', currElem, event, currTarget).defaultPrevented) {
            this.rememberAncestors(currElem);
            return currElem;
        }
        const body = state.window.document.body;
        if (currElem === body) {
            return currTarget;
        }
        this.dispatch(state, 'lm-dragenter', body, event, currTarget);
        return body;
    }

    /**
     * The ancestors of the drop targets, see {@link rememberAncestors}.
     */
    protected readonly targetAncestors = new WeakMap<Element, Element[]>();

    /**
     * Drop targets are often elements that are replaced while dragging, e.g. the lines of an editor that is re-rendered
     * because a side panel expands. Lumino drag events dispatched to a removed element don't reach the drop target that
     * handles them, e.g. the dock panel that has to hide its drop overlay. Such events are dispatched to the nearest
     * ancestor that is still attached instead.
     */
    protected rememberAncestors(target: Element): void {
        const ancestors: Element[] = [];
        for (let ancestor = target.parentElement; ancestor; ancestor = ancestor.parentElement) {
            ancestors.push(ancestor);
        }
        this.targetAncestors.set(target, ancestors);
    }

    protected dispatch(state: WindowDragState, type: LuminoDragEventType, target: Element, event: DragEvent, related: Element | undefined): Drag.Event {
        // `Drag.Event` is typed to take a `PointerEvent`, but it only copies `MouseEvent` properties (coordinates, button,
        // modifier keys) into the new event, and does not keep a reference to the given event, so a `DragEvent` does as well.
        const dragEvent = new Drag.Event(event as unknown as PointerEvent, {
            drag: this.getDrag(state),
            // eslint-disable-next-line no-null/no-null
            related: related ?? null,
            type
        });
        const attachedTarget = target.isConnected ? target : this.targetAncestors.get(target)?.find(ancestor => ancestor.isConnected);
        attachedTarget?.dispatchEvent(dragEvent);
        return dragEvent;
    }

    protected getDrag(state: WindowDragState): Drag {
        if (!state.drag || state.drag.mimeData !== this.session?.mimeData) {
            // The drag is never started, it only provides the data of the Lumino drag events.
            state.drag = new Drag({
                document: state.window.document,
                mimeData: this.session?.mimeData ?? new MimeData(),
                proposedAction: 'move',
                supportedActions: 'move',
                source: this.session?.source
            });
        }
        return state.drag;
    }

    protected scheduleLeave(state: WindowDragState): void {
        this.cancelLeave(state);
        state.leaveTimeout = state.window.setTimeout(() => {
            state.leaveTimeout = undefined;
            this.leaveWindow(state);
        }, NativeTabDragService.LEAVE_DELAY);
    }

    protected cancelLeave(state: WindowDragState): void {
        if (state.leaveTimeout !== undefined) {
            state.window.clearTimeout(state.leaveTimeout);
            state.leaveTimeout = undefined;
        }
    }

    /**
     * Notifies the current drop target, if any, that the pointer has left the window.
     */
    protected leaveWindow(state: WindowDragState): void {
        const target = state.currentTarget;
        state.currentTarget = undefined;
        state.currentElement = undefined;
        state.dropAction = 'none';
        state.inside = false;
        if (target && !state.window.closed) {
            // There is no native event at the time the pointer is known to have left the window.
            this.dispatch(state, 'lm-dragleave', target, new DragEvent('dragleave'), undefined);
        }
    }

    protected resetWindow(state: WindowDragState): void {
        this.cancelLeave(state);
        this.leaveWindow(state);
        state.drag = undefined;
    }
}
