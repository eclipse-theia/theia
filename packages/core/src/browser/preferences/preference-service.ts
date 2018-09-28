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

import { injectable, inject, postConstruct } from 'inversify';
import { FrontendApplicationContribution } from '../../browser';
import { Event, Emitter, DisposableCollection, Disposable } from '../../common';
import { Deferred } from '../../common/promise-util';
import { PreferenceProvider } from './preference-provider';
import { PreferenceSchemaProvider } from './preference-contribution';
import URI from '../../common/uri';

export namespace PreferenceScope {
    export function getScopes(): PreferenceScope[] {
        return Object.keys(PreferenceScope)
            .filter(k => typeof PreferenceScope[k as any] === 'string')
            .map(v => <PreferenceScope>Number(v));
    }

    export function getReversedScopes(): PreferenceScope[] {
        return getScopes().reverse();
    }

    export function getScopeNames(scopes?: number): string[] {
        const names: string[] = [];
        const allNames = Object.keys(PreferenceScope)
            .filter(k => typeof PreferenceScope[k as any] === 'number');
        if (scopes) {
            for (const name of allNames) {
                if (((<any>PreferenceScope)[name] & scopes) > 0) {
                    names.push(name);
                }
            }
        }
        return names;
    }
}

export enum PreferenceScope {
    Default = 1,
    User = 2,
    Workspace = 4,
    Folders = 8
}

export interface PreferenceChange {
    readonly preferenceName: string;
    readonly scope: PreferenceScope
    readonly folderUris: string[];
    readonly newValue?: any;
    readonly oldValue?: any;
}

export interface PreferenceChanges {
    [preferenceName: string]: PreferenceChange
}

export class PreferenceDataChange implements PreferenceChange {

    constructor(
        private readonly change: PreferenceChange,
        private readonly providers: Map<PreferenceScope, PreferenceProvider>
    ) { }

    get preferenceName() {
        return this.change.preferenceName;
    }
    get scope() {
        return this.change.scope;
    }
    get folderUris() {
        return this.change.folderUris;
    }
    get newValue() {
        return this.change.newValue;
    }
    get oldValue() {
        return this.change.oldValue;
    }

    canAffect(resourceUri?: string): boolean {
        if (this.folderUris && resourceUri &&
            this.folderUris.length !== 0 &&
            this.folderUris.map(uriStr => new URI(uriStr))
                .every(folderUri => folderUri.path.relativity(new URI(resourceUri).path) < 0)
        ) {
            return false;
        }
        for (const [scope, provider] of this.providers.entries()) {
            if (!resourceUri && scope === PreferenceScope.Folders) {
                continue;
            }
            if (provider.canProvide(this.preferenceName, resourceUri) >= 0 && scope > this.scope) {
                return false;
            }
        }
        return true;
    }
}

export const PreferenceService = Symbol('PreferenceService');
export interface PreferenceService extends Disposable {
    readonly ready: Promise<void>;
    get<T>(preferenceName: string): T | undefined;
    get<T>(preferenceName: string, defaultValue: T): T;
    get<T>(preferenceName: string, defaultValue: T, resourceUri: string): T;
    get<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): T | undefined
    set(preferenceName: string, value: any, scope?: PreferenceScope): Promise<void>;
    onPreferenceChanged: Event<PreferenceDataChange>;
}

/**
 * We cannot load providers directly in the case if they depend on `PreferenceService` somehow.
 * It allows to load them lazilly after DI is configured.
 */
export const PreferenceProviderProvider = Symbol('PreferenceProviderProvider');
export type PreferenceProviderProvider = (scope: PreferenceScope, uri?: URI) => PreferenceProvider;

@injectable()
export class PreferenceServiceImpl implements PreferenceService, FrontendApplicationContribution {

    protected preferences: { [key: string]: any } = {};

    protected readonly onPreferenceChangedEmitter = new Emitter<PreferenceDataChange>();
    readonly onPreferenceChanged = this.onPreferenceChangedEmitter.event;

    protected readonly onPreferencesChangedEmitter = new Emitter<PreferenceChanges>();
    readonly onPreferencesChanged = this.onPreferencesChangedEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onPreferenceChangedEmitter, this.onPreferencesChangedEmitter);

    @inject(PreferenceSchemaProvider)
    protected readonly schema: PreferenceSchemaProvider;

    @inject(PreferenceProviderProvider)
    protected readonly providerProvider: PreferenceProviderProvider;

    protected readonly providers: PreferenceProvider[] = [];
    protected providersMap: Map<PreferenceScope, PreferenceProvider>;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(Disposable.create(() => this._ready.reject()));
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
            this.providersMap = this.createProviders();
            for (const p of this.providersMap.values()) {
                this.providers.push(p);
                this.toDispose.push(p);
            }

            const defaultProvider = this.providersMap.get(PreferenceScope.Default);
            if (defaultProvider) {
                defaultProvider.ready.then(() => this._ready.resolve());
            }

            if (this.toDispose.disposed) {
                return;
            }
            for (const [scope, provider] of this.providersMap.entries()) {
                if (scope !== PreferenceScope.Default) {
                    provider.onDidPreferencesChanged(change => {
                        this.onPreferenceChangedEmitter.fire(new PreferenceDataChange(change, this.providersMap));
                    });
                }
            }
        } catch (e) {
            this._ready.reject(e);
        }
    }

    protected createProviders(): Map<PreferenceScope, PreferenceProvider> {
        const providers = new Map();
        PreferenceScope.getScopes().forEach(s =>
            providers.set(s, this.providerProvider(s))
        );
        return providers;
    }

    getPreferences(resourceUri?: string): { [key: string]: Object | undefined } {
        const prefs: { [key: string]: Object | undefined } = {};
        Object.keys(this.schema.getCombinedSchema().properties).forEach(p => {
            prefs[p] = resourceUri ? this.get(p, undefined, resourceUri) : this.get(p, undefined);
        });
        return prefs;
    }

    has(preferenceName: string): boolean {
        return this.preferences[preferenceName] !== undefined;
    }

    get<T>(preferenceName: string): T | undefined;
    get<T>(preferenceName: string, defaultValue: T): T;
    get<T>(preferenceName: string, defaultValue: T, resourceUri: string): T;
    get<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): T | undefined {
        for (const s of PreferenceScope.getReversedScopes()) {
            if (this.schema.isValidInScope(preferenceName, s)) {
                const p = this.providersMap.get(s);
                if (p && p.canProvide(preferenceName, resourceUri) >= 0) {
                    const value = p.get<T>(preferenceName, resourceUri);
                    return value !== null && value !== undefined ? value : defaultValue;
                }
            }
        }
    }

    set(preferenceName: string, value: any, scope: PreferenceScope = PreferenceScope.User): Promise<void> {
        return this.providerProvider(scope).setPreference(preferenceName, value);
    }

    getBoolean(preferenceName: string): boolean | undefined;
    getBoolean(preferenceName: string, defaultValue: boolean): boolean;
    getBoolean(preferenceName: string, defaultValue: boolean, resourceUri: string): boolean;
    getBoolean(preferenceName: string, defaultValue?: boolean, resourceUri?: string): boolean | undefined {
        const value = this.preferences.get(preferenceName, defaultValue, resourceUri);
        return value !== null && value !== undefined ? !!value : defaultValue;
    }

    getString(preferenceName: string): string | undefined;
    getString(preferenceName: string, defaultValue: string): string;
    getString(preferenceName: string, defaultValue: string, resourceUri: string): string;
    getString(preferenceName: string, defaultValue?: string, resourceUri?: string): string | undefined {
        const value = this.preferences.get(preferenceName, defaultValue, resourceUri);
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
    getNumber(preferenceName: string, defaultValue: number, resourceUri: string): number;
    getNumber(preferenceName: string, defaultValue?: number, resourceUri?: string): number | undefined {
        const value = this.preferences.get(preferenceName, defaultValue, resourceUri);

        if (value === null || value === undefined) {
            return defaultValue;
        }
        if (typeof value === 'number') {
            return value;
        }
        return Number(value);
    }

    inspect<T>(preferenceName: string, resourceUri?: string): {
        preferenceName: string,
        values: Map<PreferenceScope, T>
    } {
        const result = { preferenceName, values: new Map() };
        const schemaProps = this.schema.getCombinedSchema().properties[preferenceName];
        if (schemaProps) {
            const scopes = schemaProps.scopes;
            for (const s of PreferenceScope.getScopes()) {
                if ((scopes & s) > 0) {
                    const p = this.providersMap.get(s);
                    if (p && p.canProvide(preferenceName, resourceUri) >= 0) {
                        const value = p.get<T>(preferenceName, resourceUri);
                        if (value !== null && value !== undefined) {
                            result.values.set(s, value);
                        }
                    }
                }
            }
        }
        return result;
    }
}
