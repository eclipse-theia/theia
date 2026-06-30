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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { JSONValue } from '@lumino/coreutils';
import { inject, injectable, postConstruct } from 'inversify';
import { Disposable, DisposableCollection } from '../disposable';
import { Emitter, Event } from '../event';
import { Deferred } from '../promise-util';
import URI from '../uri';
import { PreferenceLanguageOverrideService } from './preference-language-override-service';
import { PreferenceProvider, PreferenceProviderDataChange, PreferenceProviderDataChanges, PreferenceResolveResult, PreferenceUtils } from './preference-provider';
import { PreferenceSchemaService } from './preference-schema';
import { PreferenceScope } from './preference-scope';
import { PreferenceConfigurations } from './preference-configurations';
import { deepFreeze } from '../objects';
import { unreachable } from '../types';

/**
 * Options for {@link PreferenceService.get()}.
 */
export interface PreferenceGetOptions<T> {
    /** Value to return when no stored value exists for the preference. */
    fallback?: T;
    /** URI of the resource for which to retrieve the preference. */
    resource?: string;
    /** Language-override identifier (e.g. `'typescript'`). */
    override?: string;
}

/**
 * Representation of a preference change. A preference value can be set to `undefined` for a specific scope.
 * This means that the value from a more general scope will be used.
 */
export interface PreferenceChange {
    readonly preferenceName: string;
    readonly scope: PreferenceScope;
    /**
     * URIs of the scopes in which this change applies.
     */
    readonly domain?: string[];

    /**
     * Tests wether the given resource is affected by the preference change.
     * @param resourceUri the uri of the resource to test.
     */
    affects(resourceUri?: string, overideIdentifier?: string): boolean;
    readonly affectedOverrides: readonly string[];
}

export class PreferenceChangeImpl implements PreferenceChange {
    protected readonly change: PreferenceProviderDataChange;
    constructor(change: PreferenceProviderDataChange, readonly affectedOverrides: readonly string[]) {
        this.change = deepFreeze(change);
    }

    get preferenceName(): string {
        return this.change.preferenceName;
    }
    get scope(): PreferenceScope {
        return this.change.scope;
    }
    get domain(): string[] | undefined {
        return this.change.domain;
    }

    get overrideIdentifier(): string | undefined {
        return this.change.overrideIdentifier;
    }

    // TODO add tests
    affects(resourceUri?: string, overideIdentifier?: string): boolean {
        const resourcePath = resourceUri && new URI(resourceUri).path;
        const domain = this.change.domain;
        const affectsResource = !resourcePath || !domain || domain.some(uri => new URI(uri).path.relativity(resourcePath) >= 0);
        const affectsOverride = !overideIdentifier || this.affectedOverrides.includes(overideIdentifier);
        return affectsResource && affectsOverride;
    }
}
/**
 * A key-value storage for {@link PreferenceChange}s. Used to aggregate multiple simultaneous preference changes.
 */
export type PreferenceChanges = PreferenceChange[];

export const PreferenceService = Symbol('PreferenceService');
/**
 * Service to manage preferences including, among others, getting and setting preference values as well
 * as listening to preference changes.
 *
 * Depending on your use case you might also want to look at {@link createPreferenceProxy} with which
 * you can easily create a typesafe schema-based interface for your preferences. Internally the proxy
 * uses the PreferenceService so both approaches are compatible.
 */
export interface PreferenceService extends Disposable {
    /**
     * Promise indicating whether the service successfully initialized.
     */
    readonly ready: Promise<void>;
    /**
     * Indicates whether the service has successfully initialized. Will be `true` when {@link PreferenceService.ready the `ready` Promise} resolves.
     */
    readonly isReady: boolean;
    /**
     * Retrieve the stored value for the given preference.
     *
     * @param preferenceName the preference identifier.
     * @param options optional lookup options.
     *   - `fallback` – value to return when no stored value exists.
     *   - `resource` – URI of the resource for which the preference is stored (enables per-resource values, e.g. `files.encoding`).
     *   - `override` – language-override identifier (e.g. `'typescript'`).
     *
     * @returns the stored value when it exists, otherwise `options.fallback` (or `undefined` when no fallback is given).
     */
    get(preferenceName: string, defaultValue: string): string;
    get(preferenceName: string, defaultValue: number): number;
    get(preferenceName: string, defaultValue: boolean): boolean;
    get<T>(preferenceName: string, defaultValue: T[]): T[];
    get<T>(preferenceName: string, options: PreferenceGetOptions<T> & { fallback: T }): T;
    get<T>(preferenceName: string, options?: PreferenceGetOptions<T>): T | undefined;
    /**
     * Sets the given preference to the given value.
     *
     * @param preferenceName the preference identifier.
     * @param value the new value of the preference.
     * @param scope the scope for which the value shall be set, i.e. user, workspace etc.
     * When the folder scope is specified a resourceUri must be provided.
     * @param resourceUri the uri of the resource for which the preference is stored. This used to store
     * a potentially different value for the same preference for different resources, for example `files.encoding`.
     * @param overrideIdentifier the identifier of the override to use.
     *
     * @returns a promise which resolves to `undefined` when setting the preference was successful. Otherwise it rejects
     * with an error.
     */
    set(preferenceName: string, value: any, scope?: PreferenceScope, resourceUri?: string, overrideIdentifier?: string): Promise<void>;

    /**
     * Determines and applies the changes necessary to apply `value` to either the `resourceUri` supplied or the active session.
     * If there is no setting for the `preferenceName`, the change will be applied in user scope.
     * If there is a setting conflicting with the specified `value`, the change will be applied in the most specific scope with a conflicting value.
     *
     * @param preferenceName the identifier of the preference to modify.
     * @param value the value to which to set the preference. `undefined` will reset the preference to its default value.
     * @param resourceUri the uri of the resource to which the change is to apply. If none is provided, folder scope will be ignored.
     * @param overrideIdentifier the identifier of the override to use.
     */
    updateValue(preferenceName: string, value: any, resourceUri?: string, overrideIdentifier?: string): Promise<void>

    /**
     * Registers a callback which will be called whenever a preference is changed.
     */
    onPreferenceChanged: Event<PreferenceChange>;
    /**
     * Registers a callback which will be called whenever one or more preferences are changed.
     */
    onPreferencesChanged: Event<PreferenceChanges>;
    /**
     * Retrieve the stored value for the given preference and resourceUri in all available scopes.
     *
     * @param preferenceName the preference identifier.
     * @param resourceUri the uri of the resource for which the preference is stored.
     * @param overrideIdentifier the identifier of the override to use.
     * Otherwise, values for the override will be returned where defined, and values from the base preference will be returned otherwise.
     *
     * @return an object containing the value of the given preference for all scopes.
     */
    inspect<T extends JSONValue>(preferenceName: string, resourceUri?: string, overrideIdentifier?: string): PreferenceInspection<T> | undefined;
    /**
     * For behavior, see {@link PreferenceService.inspect}.
     *
     * @returns the value in the scope specified.
     */
    inspectInScope<T extends JSONValue>(preferenceName: string, scope: PreferenceScope, resourceUri?: string, overrideIdentifier?: string): T | undefined

    /**
     * Retrieve the stored value for the given preference and resourceUri.
     *
     * @param preferenceName the preference identifier.
     * @param defaultValue the value to return when no value for the given preference is stored.
     * @param resourceUri the uri of the resource for which the preference is stored. This used to retrieve
     * a potentially different value for the same preference for different resources, for example `files.encoding`.
     * @param overrideIdentifier the identifier of the override to use.
     *
     * @returns an object containing the value stored for the given preference and resourceUri when it exists,
     * otherwise the given default value. If determinable the object will also contain the uri of the configuration
     * resource in which the preference was stored.
     */
    resolve<T>(preferenceName: string, defaultValue?: T, resourceUri?: string, overrideIdentifier?: string): PreferenceResolveResult<T>;
    /**
     * Returns the uri of the configuration resource for the given scope and optional resource uri.
     *
     * @param scope the PreferenceScope to query for.
     * @param resourceUri the optional uri of the resource-specific preference handling
     * @param sectionName the optional preference section to query for.
     *
     * @returns the uri of the configuration resource for the given scope and optional resource uri it it exists,
     * `undefined` otherwise.
     */
    getConfigUri(scope: PreferenceScope, resourceUri?: string, sectionName?: string): URI | undefined;
}

/**
 * Return type of the {@link PreferenceService.inspect} call.
 */
export interface PreferenceInspection<T = JSONValue> {
    /**
     * The preference identifier.
     */
    preferenceName: string,
    /**
     * Value in default scope.
     */
    defaultValue: T | undefined,
    /**
     * Value in user scope.
     */
    globalValue: T | undefined,
    /**
     * Value in workspace scope.
     */
    workspaceValue: T | undefined,
    /**
     * Value in folder scope.
     */
    workspaceFolderValue: T | undefined,
    /**
     * The value that is active, i.e. the value set in the lowest scope available.
     */
    value: T | undefined;
}

export type PreferenceInspectionScope = keyof Omit<PreferenceInspection<unknown>, 'preferenceName'>;

/**
 * We cannot load providers directly in the case if they depend on `PreferenceService` somehow.
 * It allows to load them lazily after DI is configured.
 */
export const PreferenceProviderProvider = Symbol('PreferenceProviderProvider');
export type PreferenceProviderProvider = (scope: PreferenceScope, uri?: URI) => PreferenceProvider | undefined;

@injectable()
export class PreferenceServiceImpl implements PreferenceService {

    protected readonly onPreferenceChangedEmitter = new Emitter<PreferenceChange>();
    readonly onPreferenceChanged = this.onPreferenceChangedEmitter.event;

    protected readonly onPreferencesChangedEmitter = new Emitter<PreferenceChanges>();
    readonly onPreferencesChanged = this.onPreferencesChangedEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onPreferenceChangedEmitter, this.onPreferencesChangedEmitter);

    @inject(PreferenceSchemaService)
    protected readonly schemaService: PreferenceSchemaService;

    @inject(PreferenceProviderProvider)
    protected readonly providerProvider: PreferenceProviderProvider;

    @inject(PreferenceConfigurations)
    protected readonly configurations: PreferenceConfigurations;

    @inject(PreferenceLanguageOverrideService)
    protected readonly preferenceOverrideService: PreferenceLanguageOverrideService;

    protected readonly preferenceProviders = new Map<PreferenceScope, PreferenceProvider>();

    protected async initializeProviders(): Promise<void> {
        try {
            for (const scope of this.schemaService.validScopes) {
                const provider = this.providerProvider(scope);
                if (provider) {
                    this.preferenceProviders.set(scope, provider);
                    this.toDispose.push(provider.onDidPreferencesChanged(changes =>
                        this.reconcilePreferences(changes)
                    ));
                    await provider.ready;
                } else {
                    console.warn(`No preference provider bound for ${PreferenceScope[scope]}`);
                }
            }
            this._ready.resolve();
            this._isReady = true;
        } catch (e) {
            this._ready.reject(e);
        }
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(Disposable.create(() => this._ready.reject(new Error('preference service is disposed'))));
        this.initializeProviders();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected readonly _ready = new Deferred<void>();
    get ready(): Promise<void> {
        return this._ready.promise;
    }

    protected _isReady = false;
    get isReady(): boolean {
        return this._isReady;
    }

    protected getAffectedOverrides(change: PreferenceProviderDataChange): string[] {
        if (change.overrideIdentifier) { // changes to overrides never affect other overrides
            return [change.overrideIdentifier];
        } else {
            const affectedOverrides = [];
            const preference = this.schemaService.getSchemaProperty(change.preferenceName);
            if (preference && preference.overridable) {

                for (const overrideId of this.schemaService.overrideIdentifiers) {
                    if (!this.doHas(change.preferenceName, undefined, overrideId)) {
                        affectedOverrides.push(overrideId);
                    }
                }
            }
            return affectedOverrides;
        }
    }

    protected reconcilePreferences(changes: PreferenceProviderDataChanges): void {
        const changesToEmit: PreferenceChanges = [];

        for (const change of changes) {
            for (const scope of [...this.schemaService.validScopes].reverse()) {
                const provider = this.getProvider(scope);
                if (provider) {
                    const scopeValue: JSONValue | undefined = provider.get(change.preferenceName, undefined, change.overrideIdentifier);
                    if (scope > change.scope && scopeValue !== undefined) {
                        const preference = this.schemaService.getSchemaProperty(change.preferenceName);
                        if (!preference?.type || preference.type === 'object' || preference.type === 'array'
                            || Array.isArray(preference.type) && preference.type.some(candidate => candidate === 'object' || candidate === 'array')) {
                            // Merge object/array preferences
                            changesToEmit.push(new PreferenceChangeImpl({ ...change }, this.getAffectedOverrides(change)));
                        }
                        break;
                    }
                    // Handle changes in the same scope
                    if (scope === change.scope) {
                        const hasNewValue = change.newValue !== undefined || scope === PreferenceScope.Default;
                        const isResetToUndefined = change.newValue === undefined && scopeValue === undefined; // is reset to undefined (no default value)
                        if (hasNewValue || isResetToUndefined) {
                            changesToEmit.push(new PreferenceChangeImpl({ ...change }, this.getAffectedOverrides(change)));
                            break;
                        }
                    }
                    // Handle fallback to more general scope when preference is reset
                    if (scope < change.scope && change.newValue === undefined && scopeValue !== undefined) {
                        // preference is changed to `undefined`, use the value from a more general scope
                        changesToEmit.push(new PreferenceChangeImpl({ ...change, scope }, this.getAffectedOverrides(change)));
                        break;
                    }
                }
            }
        }

        // emit the changes
        if (changesToEmit.length > 0) {
            this.onPreferencesChangedEmitter.fire(changesToEmit);
        }
        changesToEmit.forEach(change => this.onPreferenceChangedEmitter.fire(change));
    }

    protected getProvider(scope: PreferenceScope): PreferenceProvider | undefined {
        return this.preferenceProviders.get(scope);
    }

    has(preferenceName: string, resourceUri?: string, overrideIdentifier?: string): boolean {
        return this.get(preferenceName, { resource: resourceUri, override: overrideIdentifier }) !== undefined;
    }

    get(preferenceName: string, defaultValue: string): string;
    get(preferenceName: string, defaultValue: number): number;
    get(preferenceName: string, defaultValue: boolean): boolean;
    get<T>(preferenceName: string, defaultValue: T[]): T[];
    get<T>(preferenceName: string, options: PreferenceGetOptions<T> & { fallback: T }): T;
    get<T>(preferenceName: string, options?: PreferenceGetOptions<T>): T | undefined;
    get<T>(preferenceName: string, optionsOrFallback?: PreferenceGetOptions<T> | string | number | boolean | T[]): T | undefined {
        let fallback: T | undefined;
        let resource: string | undefined;
        let override: string | undefined;
        if (typeof optionsOrFallback === 'string'
            || typeof optionsOrFallback === 'number'
            || typeof optionsOrFallback === 'boolean'
            || Array.isArray(optionsOrFallback)) {
            fallback = optionsOrFallback as T;
        } else if (optionsOrFallback) {
            ({ fallback, resource, override } = optionsOrFallback);
        }
        return this.resolve<T>(preferenceName, fallback, resource, override).value;
    }

    resolve<T>(preferenceName: string, defaultValue?: T, resourceUri?: string, overrideIdentifier?: string): PreferenceResolveResult<T> {
        const { value, configUri } = this.doResolve(preferenceName, defaultValue, resourceUri, overrideIdentifier);
        if (value === undefined && overrideIdentifier && this.schemaService.overrideIdentifiers.has(overrideIdentifier)) {
            return this.doResolve(preferenceName, defaultValue, resourceUri, undefined);
        }
        return { value, configUri };
    }

    async set(preferenceName: string, value: any, scope: PreferenceScope | undefined, resourceUri?: string, overrideIdentifier?: string): Promise<void> {
        const resolvedScope = scope ?? (!resourceUri ? PreferenceScope.Workspace : PreferenceScope.Folder);
        if (resolvedScope === PreferenceScope.Folder && !resourceUri) {
            throw new Error('Unable to write to Folder Settings because no resource is provided.');
        }
        const provider = this.getProvider(resolvedScope);
        if (provider && await provider.setPreference(preferenceName, value, resourceUri, overrideIdentifier)) {
            return;
        }
        throw new Error(`Unable to write to ${PreferenceScope[resolvedScope]} Settings.`);
    }

    inspect<T extends JSONValue>(preferenceName: string, resourceUri?: string, overrideIdentifier?: string): PreferenceInspection<T> | undefined {
        const defaultValue = this.inspectInScope<T>(preferenceName, PreferenceScope.Default, resourceUri, overrideIdentifier);
        const globalValue = this.inspectInScope<T>(preferenceName, PreferenceScope.User, resourceUri, overrideIdentifier);
        const workspaceValue = this.inspectInScope<T>(preferenceName, PreferenceScope.Workspace, resourceUri, overrideIdentifier);
        const workspaceFolderValue = this.inspectInScope<T>(preferenceName, PreferenceScope.Folder, resourceUri, overrideIdentifier);

        const valueApplied = workspaceFolderValue ?? workspaceValue ?? globalValue ?? defaultValue;

        return { preferenceName, defaultValue, globalValue, workspaceValue, workspaceFolderValue, value: valueApplied };
    }

    inspectInScope<T extends JSONValue>(preferenceName: string, scope: PreferenceScope, resourceUri?: string, overrideIdentifier?: string): T | undefined {
        const value = this.doInspectInScope<T>(preferenceName, scope, resourceUri, overrideIdentifier);
        if (value === undefined && overrideIdentifier && this.schemaService.overrideIdentifiers.has(overrideIdentifier)) {
            return this.doInspectInScope<T>(preferenceName, scope, resourceUri, undefined);
        }
        return value;
    }

    protected getScopedValueFromInspection<T>(inspection: PreferenceInspection<T>, scope: PreferenceScope): T | undefined {
        switch (scope) {
            case PreferenceScope.Default:
                return inspection.defaultValue;
            case PreferenceScope.User:
                return inspection.globalValue;
            case PreferenceScope.Workspace:
                return inspection.workspaceValue;
            case PreferenceScope.Folder:
                return inspection.workspaceFolderValue;
        }
        unreachable(scope, 'Not all PreferenceScope enum variants handled.');
    }

    async updateValue(preferenceName: string, value: any, resourceUri?: string, overrideIdentifier?: string): Promise<void> {
        const inspection = this.inspect<any>(preferenceName, resourceUri, overrideIdentifier);
        if (inspection) {
            const scopesToChange = this.getScopesToChange(inspection, value);
            const isDeletion = value === undefined
                || (
                    scopesToChange.length === 1
                    && scopesToChange[0] === PreferenceScope.User
                    && PreferenceUtils.deepEqual(value, inspection.defaultValue)
                );
            const effectiveValue = isDeletion ? undefined : value;
            await Promise.all(scopesToChange.map(scope => this.set(preferenceName, effectiveValue, scope, resourceUri, overrideIdentifier)));
        }
    }

    protected getScopesToChange(inspection: PreferenceInspection<any>, intendedValue: any): PreferenceScope[] {
        if (PreferenceUtils.deepEqual(inspection.value, intendedValue)) {
            return [];
        }

        // Scopes in ascending order of scope breadth.
        const allScopes = [...this.schemaService.validScopes].reverse();
        // Get rid of Default scope. We can't set anything there.
        allScopes.pop();

        const isScopeDefined = (scope: PreferenceScope) => this.getScopedValueFromInspection(inspection, scope) !== undefined;

        if (intendedValue === undefined) {
            return allScopes.filter(isScopeDefined);
        }

        return [allScopes.find(isScopeDefined) ?? PreferenceScope.User];
    }

    protected doHas(preferenceName: string, resourceUri?: string, overrideIdentifier?: string): boolean {
        return this.doGet(preferenceName, undefined, resourceUri, overrideIdentifier) !== undefined;
    }
    protected doInspectInScope<T>(preferenceName: string, scope: PreferenceScope, resourceUri?: string, overrideIdentifier?: string): T | undefined {
        const provider = this.getProvider(scope);
        return provider && provider.get<T>(preferenceName, resourceUri, overrideIdentifier);
    }
    protected doGet<T>(preferenceName: string, defaultValue?: T, resourceUri?: string, overrideIdentifier?: string): T | undefined {
        return this.doResolve(preferenceName, defaultValue, resourceUri, overrideIdentifier).value;
    }
    protected doResolve<T>(preferenceName: string, defaultValue?: T, resourceUri?: string, overrideIdentifier?: string): PreferenceResolveResult<T> {
        const result: PreferenceResolveResult<T> = {};
        for (const scope of this.schemaService.validScopes) {
            const provider = this.getProvider(scope);
            if (provider?.canHandleScope(scope)) {
                const { configUri, value } = provider.resolve<T>(preferenceName, resourceUri, overrideIdentifier);
                if (value !== undefined) {
                    result.configUri = configUri;
                    result.value = PreferenceUtils.merge(result.value as any, value as any) as any;
                }
            }
        }
        return {
            configUri: result.configUri,
            value: result.value !== undefined ? deepFreeze(result.value) : defaultValue
        };
    }

    getConfigUri(scope: PreferenceScope, resourceUri?: string, sectionName: string = this.configurations.getConfigName()): URI | undefined {
        const provider = this.getProvider(scope);
        if (!provider || !this.configurations.isAnyConfig(sectionName)) {
            return undefined;
        }
        const configUri = provider.getConfigUri && provider.getConfigUri(resourceUri, sectionName);
        if (configUri) {
            return configUri;
        }
        return provider.getContainingConfigUri && provider.getContainingConfigUri(resourceUri, sectionName);
    }
}
