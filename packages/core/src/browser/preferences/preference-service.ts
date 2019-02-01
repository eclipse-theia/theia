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
import { JSONExt } from '@phosphor/coreutils';
import { FrontendApplicationContribution } from '../../browser';
import { Event, Emitter, DisposableCollection, Disposable, deepFreeze } from '../../common';
import { Deferred } from '../../common/promise-util';
import { PreferenceProvider, PreferenceProviderDataChange, PreferenceProviderDataChanges } from './preference-provider';
import { PreferenceSchemaProvider } from './preference-contribution';
import URI from '../../common/uri';

export enum PreferenceScope {
    Default,
    User,
    Workspace,
    Folder
}

export namespace PreferenceScope {
    export function is(scope: any): scope is PreferenceScope {
        return typeof scope === 'number' && getScopes().findIndex(s => s === scope) >= 0;
    }

    export function getScopes(): PreferenceScope[] {
        return Object.keys(PreferenceScope)
            .filter(k => typeof PreferenceScope[k as any] === 'string')
            .map(v => <PreferenceScope>Number(v));
    }

    export function getReversedScopes(): PreferenceScope[] {
        return getScopes().reverse();
    }

    export function getScopeNames(scope?: PreferenceScope): string[] {
        const names: string[] = [];
        const allNames = Object.keys(PreferenceScope)
            .filter(k => typeof PreferenceScope[k as any] === 'number');
        if (scope) {
            for (const name of allNames) {
                if ((<any>PreferenceScope)[name] <= scope) {
                    names.push(name);
                }
            }
        }
        return names;
    }

    export function fromString(strScope: string): PreferenceScope | undefined {
        switch (strScope) {
            case 'application':
                return PreferenceScope.User;
            case 'window':
                return PreferenceScope.Workspace;
            case 'resource':
                return PreferenceScope.Folder;
        }
    }
}

export interface PreferenceChange {
    readonly preferenceName: string;
    readonly newValue?: any;
    readonly oldValue?: any;
    affects(resourceUri?: string): boolean;
}

export class PreferenceChangeImpl implements PreferenceChange {
    constructor(
        private change: PreferenceProviderDataChange,
        private providers: Map<PreferenceScope, PreferenceProvider>
    ) { }

    get preferenceName() {
        return this.change.preferenceName;
    }
    get newValue() {
        return this.change.newValue;
    }
    get oldValue() {
        return this.change.oldValue;
    }

    affects(resourceUri?: string): boolean {
        if (this.change.domain && resourceUri &&
            this.change.domain.length !== 0 &&
            this.change.domain.map(uriStr => new URI(uriStr))
                .every(folderUri => folderUri.path.relativity(new URI(resourceUri).path) < 0)
        ) {
            return false;
        }
        for (const [scope, provider] of this.providers.entries()) {
            if (!resourceUri && scope === PreferenceScope.Folder) {
                continue;
            }
            const providerInfo = provider.canProvide(this.preferenceName, resourceUri);
            const priority = providerInfo.priority;
            if (priority >= 0 && scope > this.change.scope) {
                return false;
            }
            if (scope === this.change.scope && this.change.domain.some(d => providerInfo.provider.getDomain().findIndex(pd => pd === d) < 0)) {
                return false;
            }
        }
        return true;
    }
}

export interface PreferenceChanges {
    [preferenceName: string]: PreferenceChange
}

export const PreferenceService = Symbol('PreferenceService');
export interface PreferenceService extends Disposable {
    readonly ready: Promise<void>;
    get<T>(preferenceName: string): T | undefined;
    get<T>(preferenceName: string, defaultValue: T): T;
    get<T>(preferenceName: string, defaultValue: T, resourceUri: string): T;
    get<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): T | undefined;
    set(preferenceName: string, value: any, scope?: PreferenceScope, resourceUri?: string): Promise<void>;
    onPreferenceChanged: Event<PreferenceChange>;
}

/**
 * We cannot load providers directly in the case if they depend on `PreferenceService` somehow.
 * It allows to load them lazilly after DI is configured.
 */
export const PreferenceProviderProvider = Symbol('PreferenceProviderProvider');
export type PreferenceProviderProvider = (scope: PreferenceScope, uri?: URI) => PreferenceProvider;

@injectable()
export class PreferenceServiceImpl implements PreferenceService, FrontendApplicationContribution {

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
    protected providersMap: Map<PreferenceScope, PreferenceProvider> = new Map();

    /**
     * @deprecated Use getPreferences() instead
     */
    protected preferences: { [key: string]: any } = {};

    @postConstruct()
    protected init(): void {
        this.toDispose.push(Disposable.create(() => this._ready.reject()));
        this.doSetProvider(PreferenceScope.Default, this.schema);
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

    protected initializeProviders(): void {
        try {
            this.createProviders();
            if (this.toDispose.disposed) {
                return;
            }
            for (const provider of this.providersMap.values()) {
                this.toDispose.push(provider.onDidPreferencesChanged(changes =>
                    this.reconcilePreferences(changes)
                ));
            }
            Promise.all(this.providers.map(p => p.ready)).then(() => this._ready.resolve());
        } catch (e) {
            this._ready.reject(e);
        }
    }

    protected createProviders(): PreferenceProvider[] {
        const providers: PreferenceProvider[] = [];
        PreferenceScope.getScopes().forEach(scope => {
            const p = this.doCreateProvider(scope);
            if (p) {
                providers.push(p);
            }
        });
        return providers;
    }

    protected reconcilePreferences(changes?: PreferenceProviderDataChanges): void {
        const changesToEmit: PreferenceChanges = {};
        if (changes) {
            for (const prefName of Object.keys(changes)) {
                const change = changes[prefName];
                if (this.schema.isValidInScope(prefName, PreferenceScope.Folder)) {
                    const toEmit = new PreferenceChangeImpl(change, this.providersMap);
                    changesToEmit[prefName] = toEmit;
                    continue;
                }
                for (const s of PreferenceScope.getReversedScopes()) {
                    if (this.schema.isValidInScope(prefName, s)) {
                        const p = this.providersMap.get(s);
                        if (p) {
                            const value = p.get(prefName);
                            if (s > change.scope && value !== undefined && value !== null) {
                                // preference defined in a more specific scope
                                break;
                            } else if (s === change.scope) {
                                const toEmit = new PreferenceChangeImpl(change, this.providersMap);
                                changesToEmit[prefName] = toEmit;
                            }
                        }
                    }
                }
            }
        } else { // go through providers for the Default, User, and Workspace Scopes to find delta
            const newPrefs = this.getPreferences();
            const oldPrefs = this.preferences;
            for (const preferenceName of Object.keys(newPrefs)) {
                const newValue = newPrefs[preferenceName];
                const oldValue = oldPrefs[preferenceName];
                if (newValue === undefined && oldValue !== newValue
                    || oldValue === undefined && newValue !== oldValue // JSONExt.deepEqual() does not support handling `undefined`
                    || !JSONExt.deepEqual(oldValue, newValue)) {
                    const toEmit = new PreferenceChangeImpl({
                        newValue, oldValue, preferenceName, scope: PreferenceScope.Workspace, domain: []
                    }, this.providersMap);
                    changesToEmit[preferenceName] = toEmit;
                }
            }
            this.preferences = newPrefs;
        }

        // emit the changes
        const changedPreferenceNames = Object.keys(changesToEmit);
        if (changedPreferenceNames.length > 0) {
            this.onPreferencesChangedEmitter.fire(changesToEmit);
        }
        changedPreferenceNames.forEach(preferenceName => this.onPreferenceChangedEmitter.fire(changesToEmit[preferenceName]));
    }

    protected doCreateProvider(scope: PreferenceScope): PreferenceProvider | undefined {
        if (!this.providersMap.has(scope)) {
            const provider = this.providerProvider(scope);
            this.doSetProvider(scope, provider);
            return provider;
        }
        return this.providersMap.get(scope);
    }

    private doSetProvider(scope: PreferenceScope, provider: PreferenceProvider): void {
        this.providersMap.set(scope, provider);
        this.providers.push(provider);
        this.toDispose.push(provider);
    }

    getPreferences(resourceUri?: string): { [key: string]: any } {
        const prefs: { [key: string]: any } = {};
        Object.keys(this.schema.getCombinedSchema().properties).forEach(p => {
            prefs[p] = resourceUri ? this.get(p, undefined, resourceUri) : this.get(p, undefined);
        });
        return prefs;
    }

    has(preferenceName: string, resourceUri?: string): boolean {
        return resourceUri ? this.get(preferenceName, undefined, resourceUri) !== undefined : this.get(preferenceName, undefined) !== undefined;
    }

    get<T>(preferenceName: string): T | undefined;
    get<T>(preferenceName: string, defaultValue: T): T;
    get<T>(preferenceName: string, defaultValue: T, resourceUri: string): T;
    get<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): T | undefined {
        for (const s of PreferenceScope.getReversedScopes()) {
            if (this.schema.isValidInScope(preferenceName, s)) {
                const p = this.providersMap.get(s);
                if (p && p.canProvide(preferenceName, resourceUri).priority >= 0) {
                    const value = p.get<T>(preferenceName, resourceUri);
                    const ret = value !== null && value !== undefined ? value : defaultValue;
                    return deepFreeze(ret);
                }
            }
        }
    }

    set(preferenceName: string, value: any, scope: PreferenceScope = PreferenceScope.User, resourceUri?: string): Promise<void> {
        return this.providerProvider(scope).setPreference(preferenceName, value, resourceUri);
    }

    getBoolean(preferenceName: string): boolean | undefined;
    getBoolean(preferenceName: string, defaultValue: boolean): boolean;
    getBoolean(preferenceName: string, defaultValue: boolean, resourceUri: string): boolean;
    getBoolean(preferenceName: string, defaultValue?: boolean, resourceUri?: string): boolean | undefined {
        const value = resourceUri ? this.get(preferenceName, defaultValue, resourceUri) : this.get(preferenceName, defaultValue);
        return value !== null && value !== undefined ? !!value : defaultValue;
    }

    getString(preferenceName: string): string | undefined;
    getString(preferenceName: string, defaultValue: string): string;
    getString(preferenceName: string, defaultValue: string, resourceUri: string): string;
    getString(preferenceName: string, defaultValue?: string, resourceUri?: string): string | undefined {
        const value = resourceUri ? this.get(preferenceName, defaultValue, resourceUri) : this.get(preferenceName, defaultValue);
        if (value === null || value === undefined) {
            return defaultValue;
        }
        return value.toString();
    }

    getNumber(preferenceName: string): number | undefined;
    getNumber(preferenceName: string, defaultValue: number): number;
    getNumber(preferenceName: string, defaultValue: number, resourceUri: string): number;
    getNumber(preferenceName: string, defaultValue?: number, resourceUri?: string): number | undefined {
        const value = resourceUri ? this.get(preferenceName, defaultValue, resourceUri) : this.get(preferenceName, defaultValue);
        if (value === null || value === undefined) {
            return defaultValue;
        }
        if (typeof value === 'number') {
            return value;
        }
        return Number(value);
    }

    protected inpsectInScope<T>(preferenceName: string, scope: PreferenceScope, resourceUri?: string): T | undefined {
        const val = this.inspect<T>(preferenceName, resourceUri);
        if (val) {
            switch (scope) {
                case PreferenceScope.Default:
                    return val.defaultValue;
                case PreferenceScope.User:
                    return val.globalValue;
                case PreferenceScope.Workspace:
                    return val.workspaceValue;
                case PreferenceScope.Folder:
                    return val.workspaceFolderValue;
            }
        }
    }

    inspect<T>(preferenceName: string, resourceUri?: string): {
        preferenceName: string,
        defaultValue: T | undefined,
        globalValue: T | undefined, // User Preference
        workspaceValue: T | undefined, // Workspace Preference
        workspaceFolderValue: T | undefined // Folder Preference
    } | undefined {
        const schemaProps = this.schema.getCombinedSchema().properties[preferenceName];
        if (schemaProps) {
            const defaultValue = schemaProps.default;
            const userProvider = this.providersMap.get(PreferenceScope.User);
            const globalValue = userProvider && userProvider.canProvide(preferenceName, resourceUri).priority >= 0
                ? userProvider.get<T>(preferenceName, resourceUri) : undefined;

            const workspaceProvider = this.providersMap.get(PreferenceScope.Workspace);
            const workspaceValue = workspaceProvider && workspaceProvider.canProvide(preferenceName, resourceUri).priority >= 0
                ? workspaceProvider.get<T>(preferenceName, resourceUri) : undefined;

            const folderProvider = this.providersMap.get(PreferenceScope.Folder);
            const workspaceFolderValue = folderProvider && folderProvider.canProvide(preferenceName, resourceUri).priority >= 0
                ? folderProvider.get<T>(preferenceName, resourceUri) : undefined;

            return { preferenceName, defaultValue, globalValue, workspaceValue, workspaceFolderValue };
        }
    }
}
