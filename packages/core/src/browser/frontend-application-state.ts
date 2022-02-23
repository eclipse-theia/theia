// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from 'inversify';
import { Emitter, Event } from '../common/event';
import { Deferred } from '../common/promise-util';
import { ILogger } from '../common/logger';
import { FrontendApplicationState } from '../common/frontend-application-state';

export { FrontendApplicationState };

@injectable()
export class FrontendApplicationStateService {

    @inject(ILogger)
    protected readonly logger: ILogger;

    private _state: FrontendApplicationState = 'init';

    protected deferred: { [state: string]: Deferred<void> } = {};
    protected readonly stateChanged = new Emitter<FrontendApplicationState>();

    get state(): FrontendApplicationState {
        return this._state;
    }

    set state(state: FrontendApplicationState) {
        if (state !== this._state) {
            this.doSetState(state);
        }
    }

    get onStateChanged(): Event<FrontendApplicationState> {
        return this.stateChanged.event;
    }

    protected doSetState(state: FrontendApplicationState): void {
        if (this.deferred[this._state] === undefined) {
            this.deferred[this._state] = new Deferred();
        }
        const oldState = this._state;
        this._state = state;
        if (this.deferred[state] === undefined) {
            this.deferred[state] = new Deferred();
        }
        this.deferred[state].resolve();
        this.logger.info(`Changed application state from '${oldState}' to '${this._state}'.`);
        this.stateChanged.fire(state);
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
