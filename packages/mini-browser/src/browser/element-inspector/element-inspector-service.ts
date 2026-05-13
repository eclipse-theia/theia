// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { PickedElement, ElementInspectorState, ELEMENT_UPDATE_STYLE_TYPE, ELEMENT_UPDATE_TEXT_TYPE, ELEMENT_REFRESH_REQUEST_TYPE } from './element-inspector-types';

const HISTORY_LIMIT = 10;

/**
 * Shared state between the mini-browser element picker and the inspector widget.
 *
 * Knows about the iframe `Window` that owns the currently-picked node so that the inspector
 * UI can `postMessage` style mutations straight into the resident bridge running inside it.
 */
@injectable()
export class ElementInspectorService {

    protected readonly onDidPickEmitter = new Emitter<PickedElement>();
    protected readonly onDidChangeStateEmitter = new Emitter<ElementInspectorState>();

    protected _state: ElementInspectorState = { history: [] };
    protected boundWindow: Window | undefined;

    get state(): ElementInspectorState {
        return this._state;
    }

    get onDidPick(): Event<PickedElement> {
        return this.onDidPickEmitter.event;
    }

    get onDidChangeState(): Event<ElementInspectorState> {
        return this.onDidChangeStateEmitter.event;
    }

    /** Associates the picked element with the iframe `Window` that produced it. */
    bind(target: Window | undefined): void {
        this.boundWindow = target;
    }

    pick(element: PickedElement): void {
        const history = [element, ...this._state.history.filter(item => item.pickedId !== element.pickedId)].slice(0, HISTORY_LIMIT);
        this._state = { picked: element, history };
        this.onDidPickEmitter.fire(element);
        this.onDidChangeStateEmitter.fire(this._state);
    }

    /** Applies a fresh snapshot coming from the iframe bridge after a mutation. */
    refreshed(element: PickedElement): void {
        const current = this._state.picked;
        if (!current || current.pickedId !== element.pickedId) {
            return;
        }
        const history = this._state.history.map(item => item.pickedId === element.pickedId ? element : item);
        this._state = { picked: element, history };
        this.onDidChangeStateEmitter.fire(this._state);
    }

    /** Sends a style mutation to the iframe bridge for the currently-picked element. */
    updateStyle(property: string, value: string, important: boolean = false): void {
        const picked = this._state.picked;
        if (!picked || !this.boundWindow) return;
        this.boundWindow.postMessage({
            type: ELEMENT_UPDATE_STYLE_TYPE,
            id: picked.pickedId,
            prop: property,
            value,
            important
        }, '*');
    }

    /** Sends a `textContent` mutation to the iframe bridge. */
    updateText(text: string): void {
        const picked = this._state.picked;
        if (!picked || !this.boundWindow) return;
        this.boundWindow.postMessage({
            type: ELEMENT_UPDATE_TEXT_TYPE,
            id: picked.pickedId,
            text
        }, '*');
    }

    /** Requests a fresh snapshot for the currently-picked element. */
    requestRefresh(): void {
        const picked = this._state.picked;
        if (!picked || !this.boundWindow) return;
        this.boundWindow.postMessage({
            type: ELEMENT_REFRESH_REQUEST_TYPE,
            id: picked.pickedId
        }, '*');
    }

    clear(): void {
        if (!this._state.picked && this._state.history.length === 0) {
            return;
        }
        this._state = { history: [] };
        this.boundWindow = undefined;
        this.onDidChangeStateEmitter.fire(this._state);
    }
}
