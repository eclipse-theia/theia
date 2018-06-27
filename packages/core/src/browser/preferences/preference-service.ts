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

import { JSONExt } from '@phosphor/coreutils';
import { injectable, inject } from 'inversify';
import { FrontendApplicationContribution } from '../../browser';
import { Event, Emitter, DisposableCollection, Disposable, deepFreeze } from '../../common';
import { PreferenceProvider } from './preference-provider';

export enum PreferenceScope {
    User,
    Workspace
}

export interface PreferenceChangedEvent {
    changes: PreferenceChange[]
}

export interface PreferenceChange {
    readonly preferenceName: string;
    readonly newValue?: any;
    readonly oldValue?: any;
}

export const PreferenceService = Symbol('PreferenceService');
export interface PreferenceService extends Disposable {
    readonly ready: Promise<void>;
    get<T>(preferenceName: string): T | undefined;
    get<T>(preferenceName: string, defaultValue: T): T;
    get<T>(preferenceName: string, defaultValue?: T): T | undefined;
    set(preferenceName: string, value: any, scope?: PreferenceScope): Promise<void>;
    onPreferenceChanged: Event<PreferenceChange>;
}

export const PreferenceProviders = Symbol('PreferenceProviders');
export type PreferenceProviders = (scope: PreferenceScope) => PreferenceProvider;

@injectable()
export class PreferenceServiceImpl implements PreferenceService, FrontendApplicationContribution {

    protected preferences: { [key: string]: any } = {};

    protected readonly toDispose = new DisposableCollection();
    protected readonly onPreferenceChangedEmitter = new Emitter<PreferenceChange>();
    readonly onPreferenceChanged = this.onPreferenceChangedEmitter.event;

    @inject(PreferenceProviders)
    protected readonly getPreferenceProvider: PreferenceProviders;

    constructor() {
        this.toDispose.push(this.onPreferenceChangedEmitter);
    }

    protected _preferenceProviders: PreferenceProvider[] | undefined;
    protected get preferenceProviders(): PreferenceProvider[] {
        if (!this._preferenceProviders) {
            this._preferenceProviders = [
                this.getPreferenceProvider(PreferenceScope.User),
                this.getPreferenceProvider(PreferenceScope.Workspace)
            ];
        }
        return this._preferenceProviders;
    }

    onStart() {
        // tslint:disable-next-line:no-unused-expression
        this.ready;
    }

    protected _ready: Promise<void> | undefined;
    get ready(): Promise<void> {
        if (!this._ready) {
            this._ready = new Promise(async (resolve, reject) => {
                this.toDispose.push(Disposable.create(() => reject()));
                for (const preferenceProvider of this.preferenceProviders) {
                    this.toDispose.push(preferenceProvider);
                    preferenceProvider.onDidPreferencesChanged(event => this.reconcilePreferences());
                }

                // Wait until all the providers are ready to provide preferences.
                await Promise.all(this.preferenceProviders.map(p => p.ready));

                this.reconcilePreferences();
                resolve();
            });
        }
        return this._ready;
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected reconcilePreferences(): void {
        const preferenceChanges: { [preferenceName: string]: PreferenceChange } = {};
        const deleted = new Set(Object.keys(this.preferences));

        for (const preferenceProvider of this.preferenceProviders) {
            const preferences = preferenceProvider.getPreferences();
            // tslint:disable-next-line:forin
            for (const preferenceName in preferences) {
                deleted.delete(preferenceName);
                const oldValue = this.preferences[preferenceName];
                const newValue = deepFreeze(preferences[preferenceName]);
                if (oldValue !== undefined) {
                    /* Value changed */
                    if (!JSONExt.deepEqual(oldValue, newValue)) {
                        preferenceChanges[preferenceName] = { preferenceName, newValue, oldValue };
                        this.preferences[preferenceName] = newValue;
                    }
                    /* Value didn't change - Do nothing */
                } else {
                    /* New value without old value */
                    preferenceChanges[preferenceName] = { preferenceName, newValue };
                    this.preferences[preferenceName] = newValue;
                }
            }
        }

        /* Deleted values */
        for (const preferenceName of deleted) {
            const oldValue = this.preferences[preferenceName];
            preferenceChanges[preferenceName] = { preferenceName, oldValue };
            this.preferences[preferenceName] = undefined;
        }
        // tslint:disable-next-line:forin
        for (const preferenceName in preferenceChanges) {
            this.onPreferenceChangedEmitter.fire(preferenceChanges[preferenceName]);
        }
    }

    getPreferences(): { [key: string]: any } {
        return this.preferences;
    }

    has(preferenceName: string): boolean {
        return this.preferences[preferenceName] !== undefined;
    }

    get<T>(preferenceName: string): T | undefined;
    get<T>(preferenceName: string, defaultValue: T): T;
    get<T>(preferenceName: string, defaultValue?: T): T | undefined {
        const value = this.preferences[preferenceName];
        return value !== null && value !== undefined ? value : defaultValue;
    }

    set(preferenceName: string, value: any, scope: PreferenceScope = PreferenceScope.User): Promise<void> {
        return this.getPreferenceProvider(scope).setPreference(preferenceName, value);
    }

    getBoolean(preferenceName: string): boolean | undefined;
    getBoolean(preferenceName: string, defaultValue: boolean): boolean;
    getBoolean(preferenceName: string, defaultValue?: boolean): boolean | undefined {
        const value = this.preferences[preferenceName];
        return value !== null && value !== undefined ? !!value : defaultValue;
    }

    getString(preferenceName: string): string | undefined;
    getString(preferenceName: string, defaultValue: string): string;
    getString(preferenceName: string, defaultValue?: string): string | undefined {
        const value = this.preferences[preferenceName];
        if (value === null || value === undefined) {
            return defaultValue;
        }
        if (typeof value === "string") {
            return value;
        }
        return value.toString();
    }

    getNumber(preferenceName: string): number | undefined;
    getNumber(preferenceName: string, defaultValue: number): number;
    getNumber(preferenceName: string, defaultValue?: number): number | undefined {
        const value = this.preferences[preferenceName];

        if (value === null || value === undefined) {
            return defaultValue;
        }
        if (typeof value === "number") {
            return value;
        }
        return Number(value);
    }

}
