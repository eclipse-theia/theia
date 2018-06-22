/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable } from 'inversify';
import { Emitter, Event } from '../common/event';
import { Deferred } from '../common/promise-util';

export type FrontendApplicationState =
    'init'
    | 'started_contributions'
    | 'attached_shell'
    | 'initialized_layout'
    | 'ready'
    | 'closing_window';

@injectable()
export class FrontendApplicationStateService {

    private _state: FrontendApplicationState = 'init';

    protected deferred: { [state: string]: Deferred<void> } = {};
    protected readonly stateChanged = new Emitter<FrontendApplicationState>();

    get state(): FrontendApplicationState {
        return this._state;
    }

    set state(state: FrontendApplicationState) {
        if (state !== this._state) {
            this.deferred[this._state] = new Deferred();
            this._state = state;
            if (this.deferred[state] === undefined) {
                this.deferred[state] = new Deferred();
            }
            this.deferred[state].resolve();
            this.stateChanged.fire(state);
        }
    }

    get onStateChanged(): Event<FrontendApplicationState> {
        return this.stateChanged.event;
    }

    reachedState(state: FrontendApplicationState): Promise<void> {
        if (this.deferred[state] === undefined) {
            this.deferred[state] = new Deferred();
        }
        return this.deferred[state].promise;
    }

    reachedAnyState(...states: FrontendApplicationState[]): Promise<void> {
        return Promise.race(states.map(s => this.reachedState(s)));
    }

}
