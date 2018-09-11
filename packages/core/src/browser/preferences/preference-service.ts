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

import { JSONExt } from '@phosphor/coreutils';
import { injectable, inject, postConstruct } from 'inversify';
import { FrontendApplicationContribution } from '../../browser';
import { Event, Emitter, DisposableCollection, Disposable, deepFreeze } from '../../common';
import { Deferred } from '../../common/promise-util';
import { PreferenceProvider } from './preference-provider';
import { PreferenceSchemaProvider } from './preference-contribution';

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

export interface PreferenceChanges {
    [preferenceName: string]: PreferenceChange
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

/**
 * We cannot load providers directly in the case if they depend on `PreferenceService` somehow.
 * It allows to load them lazilly after DI is configured.
 */
export const PreferenceProviderProvider = Symbol('PreferenceProviderProvider');
export type PreferenceProviderProvider = (scope: PreferenceScope) => PreferenceProvider;

@injectable()
export class PreferenceServiceImpl implements PreferenceService, FrontendApplicationContribution {

    protected preferences: { [key: string]: any } = {};

    protected readonly onPreferenceChangedEmitter = new Emitter<PreferenceChange>();
    readonly onPreferenceChanged = this.onPreferenceChangedEmitter.event;

    protected readonly onPreferencesChangedEmitter = new Emitter<PreferenceChanges>();
    readonly onPreferencesChanged = this.onPreferencesChangedEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onPreferenceChangedEmitter, this.onPreferencesChangedEmitter);

    @inject(PreferenceSchemaProvider)
    protected readonly schema: PreferenceSchemaProvider;

    @inject(PreferenceProviderProvider)
    protected readonly providerProvider: PreferenceProviderProvider;

    protected readonly providers: PreferenceProvider[] = [];

    @postConstruct()
    protected init(): void {
        this.toDispose.push(Disposable.create(() => this._ready.reject()));
        this.providers.push(this.schema);
        this.preferences = this.parsePreferences();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected readonly _ready = new Deferred<void>();
    get ready(): Promise<void> {
        return this._ready.promise;
    }

    initialize(): void {
        this.initializeProviders();
    }
    protected async initializeProviders(): Promise<void> {
        try {
            const providers = this.createProviders();
            this.toDispose.pushAll(providers);
            await Promise.all(providers.map(p => p.ready));
            if (this.toDispose.disposed) {
                return;
            }
            this.providers.push(...providers);
            for (const provider of providers) {
                provider.onDidPreferencesChanged(_ => this.reconcilePreferences());
            }
            this.reconcilePreferences();
            this._ready.resolve();
        } catch (e) {
            this._ready.reject(e);
        }
    }
    protected createProviders(): PreferenceProvider[] {
        return [
            this.providerProvider(PreferenceScope.User),
            this.providerProvider(PreferenceScope.Workspace)
        ];
    }

    protected reconcilePreferences(): void {
        const changes: PreferenceChanges = {};
        const deleted = new Set(Object.keys(this.preferences));
        const preferences = this.parsePreferences();
        // tslint:disable-next-line:forin
        for (const preferenceName in preferences) {
            deleted.delete(preferenceName);
            const oldValue = this.preferences[preferenceName];
            const newValue = preferences[preferenceName];
            if (oldValue !== undefined) {
                if (!JSONExt.deepEqual(oldValue, newValue)) {
                    changes[preferenceName] = { preferenceName, newValue, oldValue };
                    this.preferences[preferenceName] = deepFreeze(newValue);
                }
            } else {
                changes[preferenceName] = { preferenceName, newValue };
                this.preferences[preferenceName] = deepFreeze(newValue);
            }
        }
        for (const preferenceName of deleted) {
            const oldValue = this.preferences[preferenceName];
            changes[preferenceName] = { preferenceName, oldValue };
            this.preferences[preferenceName] = undefined;
        }
        this.onPreferencesChangedEmitter.fire(changes);
        // tslint:disable-next-line:forin
        for (const preferenceName in changes) {
            this.onPreferenceChangedEmitter.fire(changes[preferenceName]);
        }
    }
    protected parsePreferences(): { [name: string]: any } {
        const result: { [name: string]: any } = {};
        for (const provider of this.providers) {
            const preferences = provider.getPreferences();
            // tslint:disable-next-line:forin
            for (const preferenceName in preferences) {
                if (this.schema.validate(preferenceName, preferences[preferenceName])) {
                    result[preferenceName] = preferences[preferenceName];
                }
            }
        }
        return result;
    }

    getPreferences(): { [key: string]: Object | undefined } {
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
        return this.providerProvider(scope).setPreference(preferenceName, value);
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
        if (typeof value === 'string') {
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
        if (typeof value === 'number') {
            return value;
        }
        return Number(value);
    }

}
