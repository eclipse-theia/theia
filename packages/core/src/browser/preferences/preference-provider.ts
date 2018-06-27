/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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
import { Disposable, DisposableCollection, Emitter, Event } from '../../common';
import { Deferred } from '../../common/promise-util';

@injectable()
export class PreferenceProvider implements Disposable {
    protected readonly onDidPreferencesChangedEmitter = new Emitter<void>();
    readonly onDidPreferencesChanged: Event<void> = this.onDidPreferencesChangedEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    /**
     * Resolved when the preference provider is ready to provide preferences
     * It should be resolved by subclasses.
     */
    protected readonly _ready = new Deferred<void>();

    constructor() {
        this.toDispose.push(this.onDidPreferencesChangedEmitter);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected fireOnDidPreferencesChanged(): void {
        this.onDidPreferencesChangedEmitter.fire(undefined);
    }

    getPreferences(): { [p: string]: any } {
        return [];
    }

    setPreference(key: string, value: any): Promise<void> {
        return Promise.resolve();
    }

    /** See `_ready`.  */
    get ready() {
        return this._ready.promise;
    }
}
