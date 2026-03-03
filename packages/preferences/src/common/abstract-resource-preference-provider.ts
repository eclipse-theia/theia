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
/* eslint-disable no-null/no-null */

import * as jsoncparser from 'jsonc-parser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core/lib/common/disposable';
import {
    PreferenceProviderImpl, PreferenceScope, PreferenceProviderDataChange, PreferenceSchemaService,
    PreferenceConfigurations, PreferenceUtils, PreferenceLanguageOverrideService,
    Listener
} from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { Emitter, Event } from '@theia/core';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
export interface FileContentStatus {
    content: string;
    fileOK: boolean
}
/**
 * Abtracts the way to read and write preferences to a given resource
 */
export interface PreferenceStorage extends Disposable {
    /**
     * Write a value to the underlying preference store
     * @param key the preference key
     * @param path the path to the JSON object to change
     * @param value the new preference value
     * @returns a promise that will resolve when all "onStored" listeners have finished
     */
    writeValue(key: string, path: string[], value: JSONValue): Promise<boolean>;
    /**
     * List of listeners that will get a string with the newly stored resource content and should return a promise that resolves when
     * they are done with their processing
     */
    onDidChangeFileContent: Listener.Registration<FileContentStatus, Promise<boolean>>;
    /**
     * Reds the content of the underlying resource
     */
    read(): Promise<string>;
};

export const PreferenceStorageFactory = Symbol('PreferenceStorageFactory');
export type PreferenceStorageFactory = (uri: URI, scope: PreferenceScope) => PreferenceStorage;

@injectable()
export abstract class AbstractResourcePreferenceProvider extends PreferenceProviderImpl {
    protected preferenceStorage: PreferenceStorage;

    protected preferences: Record<string, any> = {};
    protected _fileExists = false;
    protected readonly loading = new Deferred();
    protected readonly onDidChangeValidityEmitter = new Emitter<boolean>();

    set fileExists(exists: boolean) {
        if (exists !== this._fileExists) {
            this._fileExists = exists;
            this.onDidChangeValidityEmitter.fire(exists);
        }
    }

    get onDidChangeValidity(): Event<boolean> {
        return this.onDidChangeValidityEmitter.event;
    }

    @inject(PreferenceSchemaService)
    protected readonly schemaProvider: PreferenceSchemaService;
    @inject(PreferenceConfigurations)
    protected readonly configurations: PreferenceConfigurations;
    @inject(PreferenceLanguageOverrideService)
    protected readonly preferenceOverrideService: PreferenceLanguageOverrideService;
    @inject(PreferenceStorageFactory)
    protected readonly preferenceStorageFactory: PreferenceStorageFactory;

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        const uri = this.getUri();
        this.toDispose.push(Disposable.create(() => this.loading.reject(new Error(`Preference provider for '${uri}' was disposed.`))));

        this.preferenceStorage = this.preferenceStorageFactory(uri, this.getScope());
        this.preferenceStorage.onDidChangeFileContent(async ({ content, fileOK }) => {
            this.fileExists = fileOK;
            this.readPreferencesFromContent(content);
            await this.fireDidPreferencesChanged(); // Ensure all consumers of the event have received it.¨
            return true;
        });
        await this.readPreferencesFromFile();
        this._ready.resolve();
        this.loading.resolve();

        this.toDispose.pushAll([
            Disposable.create(() => this.reset()),
        ]);
    }

    protected abstract getUri(): URI;
    abstract getScope(): PreferenceScope;

    get valid(): boolean {
        return this._fileExists;
    }

    override getConfigUri(): URI;
    override getConfigUri(resourceUri: string | undefined): URI | undefined;
    override getConfigUri(resourceUri?: string): URI | undefined {
        if (!resourceUri) {
            return this.getUri();
        }
        return this.valid && this.contains(resourceUri) ? this.getUri() : undefined;
    }

    contains(resourceUri: string | undefined): boolean {
        if (!resourceUri) {
            return true;
        }
        const domain = this.getDomain();
        if (!domain) {
            return true;
        }
        const resourcePath = new URI(resourceUri).path;
        return domain.some(uri => new URI(uri).path.relativity(resourcePath) >= 0);
    }

    getPreferences(resourceUri?: string): { [key: string]: any } {
        return this.valid && this.contains(resourceUri) ? this.preferences : {};
    }

    async setPreference(key: string, value: any, resourceUri?: string): Promise<boolean> {
        let path: string[] | undefined;
        if (this.toDispose.disposed || !(path = this.getPath(key)) || !this.contains(resourceUri)) {
            return false;
        }
        return this.doSetPreference(key, path, value);
    }

    protected doSetPreference(key: string, path: string[], value: JSONValue): Promise<boolean> {
        return this.preferenceStorage.writeValue(key, path, value);
    }

    protected getPath(preferenceName: string): string[] | undefined {
        const asOverride = this.preferenceOverrideService.overriddenPreferenceName(preferenceName);
        if (asOverride?.overrideIdentifier) {
            return [this.preferenceOverrideService.markLanguageOverride(asOverride.overrideIdentifier), asOverride.preferenceName];
        }
        return [preferenceName];
    }

    protected readPreferencesFromFile(): Promise<void> {
        return this.preferenceStorage.read().then(value => {
            this.fileExists = true;
            this.readPreferencesFromContent(value);
        }).catch(() => {
            this.fileExists = false;
            this.readPreferencesFromContent('');
        });

    }
    protected readPreferencesFromContent(content: string): void {
        let preferencesInJson;
        try {
            preferencesInJson = this.parse(content);
        } catch {
            preferencesInJson = {};
        }
        const parsedPreferences = this.getParsedContent(preferencesInJson);
        this.handlePreferenceChanges(parsedPreferences);
    }

    protected parse(content: string): any {
        content = content.trim();
        if (!content) {
            return undefined;
        }
        const strippedContent = jsoncparser.stripComments(content);
        return jsoncparser.parse(strippedContent);
    }

    protected handlePreferenceChanges(newPrefs: { [key: string]: any }): void {
        const oldPrefs = Object.assign({}, this.preferences);
        this.preferences = newPrefs;
        const prefNames = new Set([...Object.keys(oldPrefs), ...Object.keys(newPrefs)]);
        const prefChanges: PreferenceProviderDataChange[] = [];
        const uri = this.getUri();
        for (const prefName of prefNames.values()) {
            const oldValue = oldPrefs[prefName];
            const newValue = newPrefs[prefName];
            const schemaProperty = this.schemaProvider.getSchemaProperty(prefName);
            if (schemaProperty && schemaProperty.included) {
                const scope = schemaProperty.scope;
                // do not emit the change event if the change is made out of the defined preference scope
                if (!this.schemaProvider.isValidInScope(prefName, this.getScope())) {
                    console.warn(`Preference ${prefName} in ${uri} can only be defined in scopes: ${PreferenceScope.getScopeNames(scope).join(', ')}.`);
                    continue;
                }
            }
            if (!PreferenceUtils.deepEqual(newValue, oldValue)) {
                prefChanges.push({
                    preferenceName: prefName, newValue, oldValue, scope: this.getScope(), domain: this.getDomain()
                });
            }
        }

        if (prefChanges.length > 0) {
            this.emitPreferencesChangedEvent(prefChanges);
        }
    }

    protected reset(): void {
        const preferences = this.preferences;
        this.preferences = {};
        const changes: PreferenceProviderDataChange[] = [];
        for (const prefName of Object.keys(preferences)) {
            const value = preferences[prefName];
            if (value !== undefined) {
                changes.push({
                    preferenceName: prefName, newValue: undefined, oldValue: value, scope: this.getScope(), domain: this.getDomain()
                });
            }
        }
        if (changes.length > 0) {
            this.emitPreferencesChangedEvent(changes);
        }
    }
}
