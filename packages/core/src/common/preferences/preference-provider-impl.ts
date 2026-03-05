// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import debounce = require('p-debounce');
import { injectable } from 'inversify';
import { JSONObject } from '@lumino/coreutils';
import URI from '../uri';
import { Emitter, Event } from '../event';
import { Deferred } from '../promise-util';
import { PreferenceScope } from './preference-scope';
import { PreferenceProvider, PreferenceProviderDataChange, PreferenceProviderDataChanges, PreferenceResolveResult } from './preference-provider';
import { DisposableCollection } from '../disposable';
import { PreferenceLanguageOverrideService } from './preference-language-override-service';
import { isObject } from '../types';

export abstract class PreferenceProviderBase {

    protected readonly onDidPreferencesChangedEmitter = new Emitter<PreferenceProviderDataChanges>();
    readonly onDidPreferencesChanged: Event<PreferenceProviderDataChanges> = this.onDidPreferencesChangedEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    protected deferredChanges: Record<string, PreferenceProviderDataChange> | undefined;

    constructor() {
        this.toDispose.push(this.onDidPreferencesChangedEmitter);
    }

    /**
     * Informs the listeners that one or more preferences of this provider are changed.
     * The listeners are able to find what was changed from the emitted event.
     */
    protected emitPreferencesChangedEvent(changes: PreferenceProviderDataChange[]): Promise<boolean> {
        for (const change of changes) {
            this.mergePreferenceProviderDataChange(change);
        }

        return this.fireDidPreferencesChanged();
    }

    protected mergePreferenceProviderDataChange(change: PreferenceProviderDataChange): void {
        if (!this.deferredChanges) {
            this.deferredChanges = {};
        }
        const key = `${change.preferenceName}.${change.overrideIdentifier}`;
        const current = this.deferredChanges[key];
        const { newValue, scope, domain } = change;
        if (!current) {
            // new
            this.deferredChanges[key] = change;
        } else if (current.oldValue === newValue) {
            // delete
            delete this.deferredChanges[key];
        } else {
            // update
            Object.assign(current, { newValue, scope, domain });
        }
    }

    protected fireDidPreferencesChanged = debounce(() => {
        const changes = this.deferredChanges;
        this.deferredChanges = undefined;
        if (changes && Object.keys(changes).length) {
            this.onDidPreferencesChangedEmitter.fire(Object.values(changes));
            return true;
        }
        return false;
    }, 0);

    dispose(): void {
        this.toDispose.dispose();
    }

}

/**
 * The {@link PreferenceProvider} is used to store and retrieve preference values. A {@link PreferenceProvider} does not operate in a global scope but is
 * configured for one or more {@link PreferenceScope}s. The (default implementation for the) {@link PreferenceService} aggregates all {@link PreferenceProvider}s and
 * serves as a common facade for manipulating preference values.
 */
@injectable()
export abstract class PreferenceProviderImpl extends PreferenceProviderBase implements PreferenceProvider {

    protected readonly _ready = new Deferred<void>();

    constructor() {
        super();
    }

    get<T>(preferenceName: string, resourceUri?: string, overrideIdentifier?: string): T | undefined {
        return this.resolve<T>(preferenceName, resourceUri, overrideIdentifier).value;
    }

    resolve<T>(preferenceName: string, resourceUri?: string, overrideIdentifier?: string): PreferenceResolveResult<T> {
        const preferences = this.getPreferences(resourceUri);
        const key = overrideIdentifier ? `[${overrideIdentifier}].${preferenceName}` : preferenceName;
        return {
            value: preferences[key] as T,
            configUri: this.getConfigUri(resourceUri)
        };
    }

    abstract getPreferences(resourceUri?: string): JSONObject;
    abstract setPreference(key: string, value: unknown, resourceUri?: string, overrideIdentifier?: string): Promise<boolean>;

    /**
     * Resolved when the preference provider is ready to provide preferences
     * It should be resolved by subclasses.
     */
    get ready(): Promise<void> {
        return this._ready.promise;
    }

    /**
     * Retrieve the domain for this provider.
     *
     * @returns the domain or `undefined` if this provider is suitable for all domains.
     */
    getDomain(): string[] | undefined {
        return undefined;
    }

    getConfigUri(resourceUri?: string, sectionName?: string): URI | undefined {
        return undefined;
    }

    getContainingConfigUri?(resourceUri?: string, sectionName?: string): URI | undefined;

    protected getParsedContent(jsonData: unknown): { [key: string]: unknown } {
        const preferences: { [key: string]: unknown } = {};
        if (!isObject(jsonData)) {
            return preferences;
        }
        for (const [preferenceName, preferenceValue] of Object.entries(jsonData)) {
            if (PreferenceLanguageOverrideService.testOverrideValue(preferenceName, preferenceValue)) {
                for (const [overriddenPreferenceName, overriddenValue] of Object.entries(preferenceValue)) {
                    preferences[`${preferenceName}.${overriddenPreferenceName}`] = overriddenValue;
                }
            } else {
                preferences[preferenceName] = preferenceValue;
            }
        }
        return preferences;
    }

    canHandleScope(scope: PreferenceScope): boolean {
        return true;
    }
}
