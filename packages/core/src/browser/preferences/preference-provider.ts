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

// tslint:disable:no-any

import { injectable } from 'inversify';
import { Disposable, DisposableCollection, Emitter, Event } from '../../common';
import { Deferred } from '../../common/promise-util';
import { PreferenceScope } from './preference-scope';

export namespace PreferenceProviderPriority {
    export const NA = -1;
    export const Default = 0;
    export const User = 1;
    export const Workspace = 2;
    export const Folder = 3;
}

export interface PreferenceProviderDataChange {
    readonly preferenceName: string;
    readonly newValue?: any;
    readonly oldValue?: any;
    readonly scope: PreferenceScope;
    readonly domain: string[];
}

export interface PreferenceProviderDataChanges {
    [preferenceName: string]: PreferenceProviderDataChange
}

@injectable()
export abstract class PreferenceProvider implements Disposable {

    protected readonly onDidPreferencesChangedEmitter = new Emitter<PreferenceProviderDataChanges | undefined>();
    readonly onDidPreferencesChanged: Event<PreferenceProviderDataChanges | undefined> = this.onDidPreferencesChangedEmitter.event;

    protected readonly onDidInvalidPreferencesReadEmitter = new Emitter<{ [key: string]: any }>();
    readonly onDidInvalidPreferencesRead: Event<{ [key: string]: any }> = this.onDidInvalidPreferencesReadEmitter.event;

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

    /**
     * Informs the listeners that one or more preferences of this provider are changed.
     * The listeners are able to find what was changed from the emitted event.
     */
    protected emitPreferencesChangedEvent(changes: PreferenceProviderDataChanges | PreferenceProviderDataChange[]): void {
        if (Array.isArray(changes)) {
            const prefChanges: PreferenceProviderDataChanges = {};
            for (const change of changes) {
                prefChanges[change.preferenceName] = change;
            }
            this.onDidPreferencesChangedEmitter.fire(prefChanges);
        } else {
            this.onDidPreferencesChangedEmitter.fire(changes);
        }
    }

    /**
     * Informs the listeners that one or more preferences of this provider are changed.
     * @deprecated Use emitPreferencesChangedEvent instead.
     */
    protected fireOnDidPreferencesChanged(): void {
        this.onDidPreferencesChangedEmitter.fire(undefined);
    }

    get<T>(preferenceName: string, resourceUri?: string): T | undefined {
        const value = this.getPreferences(resourceUri)[preferenceName];
        if (value !== undefined && value !== null) {
            return value;
        }
    }

    // tslint:disable-next-line:no-any
    abstract getPreferences(resourceUri?: string): { [p: string]: any };

    // tslint:disable-next-line:no-any
    abstract setPreference(key: string, value: any, resourceUri?: string): Promise<void>;

    /** See `_ready`.  */
    get ready() {
        return this._ready.promise;
    }

    canProvide(preferenceName: string, resourceUri?: string): { priority: number, provider: PreferenceProvider } {
        return { priority: PreferenceProviderPriority.NA, provider: this };
    }

    getDomain(): string[] {
        return [];
    }

    protected getScope() {
        return PreferenceScope.Default;
    }
}
