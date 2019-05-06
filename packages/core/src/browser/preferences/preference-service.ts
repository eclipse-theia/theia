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
import { JSONExt } from '@phosphor/coreutils/lib/json';
import { FrontendApplicationContribution } from '../../browser';
import { Event, Emitter, DisposableCollection, Disposable, deepFreeze } from '../../common';
import { Deferred } from '../../common/promise-util';
import { PreferenceProvider, PreferenceProviderDataChange, PreferenceProviderDataChanges, PreferenceResolveResult } from './preference-provider';
import { PreferenceSchemaProvider, OverridePreferenceName } from './preference-contribution';
import URI from '../../common/uri';
import { PreferenceScope } from './preference-scope';
import { PreferenceConfigurations } from './preference-configurations';

export { PreferenceScope };

export interface PreferenceChange {
    readonly preferenceName: string;
    readonly newValue?: any;
    readonly oldValue?: any;
    readonly scope: PreferenceScope;
    affects(resourceUri?: string): boolean;
}

export class PreferenceChangeImpl implements PreferenceChange {
    constructor(
        private change: PreferenceProviderDataChange
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
    get scope(): PreferenceScope {
        return this.change.scope;
    }

    // TODO add tests
    affects(resourceUri?: string): boolean {
        const resourcePath = resourceUri && new URI(resourceUri).path;
        const domain = this.change.domain;
        return !resourcePath || !domain || domain.some(uri => new URI(uri).path.relativity(resourcePath) >= 0);
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

    inspect<T>(preferenceName: string, resourceUri?: string): {
        preferenceName: string,
        defaultValue: T | undefined,
        globalValue: T | undefined, // User Preference
        workspaceValue: T | undefined, // Workspace Preference
        workspaceFolderValue: T | undefined // Folder Preference
    } | undefined;

    overridePreferenceName(options: OverridePreferenceName): string;
    overridenPreferenceName(preferenceName: string): OverridePreferenceName | undefined;

    resolve<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): PreferenceResolveResult<T>;
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

    @inject(PreferenceConfigurations)
    protected readonly configurations: PreferenceConfigurations;

    protected readonly providers: PreferenceProvider[] = [];
    protected providersMap: Map<PreferenceScope, PreferenceProvider> = new Map();

    /**
     * @deprecated Use getPreferences() instead
     */
    protected preferences: { [key: string]: any } = {};

    @postConstruct()
    protected init(): void {
        this.toDispose.push(Disposable.create(() => this._ready.reject(new Error('preference service is disposed'))));
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
        const acceptChange = (change: PreferenceProviderDataChange) =>
            this.getAffectedPreferenceNames(change, preferenceName =>
                changesToEmit[preferenceName] = new PreferenceChangeImpl({ ...change, preferenceName })
            );
        if (changes) {
            for (const preferenceName of Object.keys(changes)) {
                let change = changes[preferenceName];
                if (change.newValue === undefined) {
                    const overriden = this.overridenPreferenceName(change.preferenceName);
                    if (overriden) {
                        change = {
                            ...change, newValue: this.doGet(overriden.preferenceName)
                        };
                    }
                }
                if (this.schema.isValidInScope(preferenceName, PreferenceScope.Folder)) {
                    acceptChange(change);
                    continue;
                }
                for (const scope of PreferenceScope.getReversedScopes()) {
                    if (this.schema.isValidInScope(preferenceName, scope)) {
                        const provider = this.getProvider(scope);
                        if (provider) {
                            const value = provider.get(preferenceName);
                            if (scope > change.scope && value !== undefined) {
                                // preference defined in a more specific scope
                                break;
                            } else if (scope === change.scope) {
                                acceptChange(change);
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
                    acceptChange({ newValue, oldValue, preferenceName, scope: PreferenceScope.Workspace, domain: [] });
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
    protected getAffectedPreferenceNames(change: PreferenceProviderDataChange, accept: (affectedPreferenceName: string) => void): void {
        accept(change.preferenceName);
        for (const overridePreferenceName of this.schema.getOverridePreferenceNames(change.preferenceName)) {
            if (!this.doHas(overridePreferenceName)) {
                accept(overridePreferenceName);
            }
        }
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

    protected getProvider(scope: PreferenceScope): PreferenceProvider | undefined {
        return this.providersMap.get(scope);
    }

    getPreferences(resourceUri?: string): { [key: string]: any } {
        const preferences: { [key: string]: any } = {};
        for (const preferenceName of this.schema.getPreferenceNames()) {
            preferences[preferenceName] = this.get(preferenceName, undefined, resourceUri);
        }
        return preferences;
    }

    has(preferenceName: string, resourceUri?: string): boolean {
        return this.get(preferenceName, undefined, resourceUri) !== undefined;
    }

    get<T>(preferenceName: string): T | undefined;
    get<T>(preferenceName: string, defaultValue: T): T;
    get<T>(preferenceName: string, defaultValue: T, resourceUri: string): T;
    get<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): T | undefined;
    get<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): T | undefined {
        return this.resolve<T>(preferenceName, defaultValue, resourceUri).value;
    }

    resolve<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): {
        configUri?: URI,
        value?: T
    } {
        const { value, configUri } = this.doResolve(preferenceName, defaultValue, resourceUri);
        if (value === undefined) {
            const overriden = this.overridenPreferenceName(preferenceName);
            if (overriden) {
                return this.doResolve(overriden.preferenceName, defaultValue, resourceUri);
            }
        }
        return { value, configUri };
    }

    async set(preferenceName: string, value: any, scope: PreferenceScope | undefined, resourceUri?: string): Promise<void> {
        const resolvedScope = scope !== undefined ? scope : (!resourceUri ? PreferenceScope.Workspace : PreferenceScope.Folder);
        if (resolvedScope === PreferenceScope.User && this.configurations.isSectionName(preferenceName.split('.', 1)[0])) {
            throw new Error(`Unable to write to User Settings because ${preferenceName} does not support for global scope.`);
        }
        if (resolvedScope === PreferenceScope.Folder && !resourceUri) {
            throw new Error('Unable to write to Folder Settings because no resource is provided.');
        }
        const provider = this.getProvider(resolvedScope);
        if (provider && await provider.setPreference(preferenceName, value, resourceUri)) {
            return;
        }
        throw new Error(`Unable to write to ${PreferenceScope.getScopeNames(resolvedScope)[0]} Settings.`);
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

    inspect<T>(preferenceName: string, resourceUri?: string): {
        preferenceName: string,
        defaultValue: T | undefined,
        globalValue: T | undefined, // User Preference
        workspaceValue: T | undefined, // Workspace Preference
        workspaceFolderValue: T | undefined // Folder Preference
    } | undefined {
        const defaultValue = this.inspectInScope<T>(preferenceName, PreferenceScope.Default, resourceUri);
        const globalValue = this.inspectInScope<T>(preferenceName, PreferenceScope.User, resourceUri);
        const workspaceValue = this.inspectInScope<T>(preferenceName, PreferenceScope.Workspace, resourceUri);
        const workspaceFolderValue = this.inspectInScope<T>(preferenceName, PreferenceScope.Folder, resourceUri);

        return { preferenceName, defaultValue, globalValue, workspaceValue, workspaceFolderValue };
    }
    protected inspectInScope<T>(preferenceName: string, scope: PreferenceScope, resourceUri?: string): T | undefined {
        const value = this.doInspectInScope<T>(preferenceName, scope, resourceUri);
        if (value === undefined) {
            const overriden = this.overridenPreferenceName(preferenceName);
            if (overriden) {
                return this.doInspectInScope(overriden.preferenceName, scope, resourceUri);
            }
        }
        return value;
    }

    overridePreferenceName(options: OverridePreferenceName): string {
        return this.schema.overridePreferenceName(options);
    }
    overridenPreferenceName(preferenceName: string): OverridePreferenceName | undefined {
        return this.schema.overridenPreferenceName(preferenceName);
    }

    protected doHas(preferenceName: string, resourceUri?: string): boolean {
        return this.doGet(preferenceName, undefined, resourceUri) !== undefined;
    }
    protected doInspectInScope<T>(preferenceName: string, scope: PreferenceScope, resourceUri?: string): T | undefined {
        const provider = this.getProvider(scope);
        return provider && provider.get<T>(preferenceName, resourceUri);
    }
    protected doGet<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): T | undefined {
        return this.doResolve(preferenceName, defaultValue, resourceUri).value;
    }
    protected doResolve<T>(preferenceName: string, defaultValue?: T, resourceUri?: string): PreferenceResolveResult<T> {
        const result: PreferenceResolveResult<T> = {};
        for (const scope of PreferenceScope.getScopes()) {
            if (this.schema.isValidInScope(preferenceName, scope)) {
                const provider = this.getProvider(scope);
                if (provider) {
                    const { configUri, value } = provider.resolve<T>(preferenceName, resourceUri);
                    if (value !== undefined) {
                        result.configUri = configUri;
                        result.value = PreferenceProvider.merge(result.value as any, value as any) as any;
                    }
                }
            }
        }
        return {
            configUri: result.configUri,
            value: result.value !== undefined ? deepFreeze(result.value) : defaultValue
        };
    }

}
