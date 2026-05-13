// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { PickedElement, ElementInspectorState } from './element-inspector-types';

const HISTORY_LIMIT = 10;

/**
 * Shared state between the mini-browser element picker and the inspector widget.
 * Avoids cross-package dependencies by acting as a single source of truth.
 */
@injectable()
export class ElementInspectorService {

    protected readonly onDidPickEmitter = new Emitter<PickedElement>();
    protected readonly onDidChangeStateEmitter = new Emitter<ElementInspectorState>();

    protected _state: ElementInspectorState = { history: [] };

    get state(): ElementInspectorState {
        return this._state;
    }

    get onDidPick(): Event<PickedElement> {
        return this.onDidPickEmitter.event;
    }

    get onDidChangeState(): Event<ElementInspectorState> {
        return this.onDidChangeStateEmitter.event;
    }

    pick(element: PickedElement): void {
        const history = [element, ...this._state.history.filter(item => item.domPath !== element.domPath)].slice(0, HISTORY_LIMIT);
        this._state = { picked: element, history };
        this.onDidPickEmitter.fire(element);
        this.onDidChangeStateEmitter.fire(this._state);
    }

    clear(): void {
        if (!this._state.picked && this._state.history.length === 0) {
            return;
        }
        this._state = { history: [] };
        this.onDidChangeStateEmitter.fire(this._state);
    }
}
