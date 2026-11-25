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
import { inject, injectable, postConstruct, named } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core/lib/common/disposable';
import {
    PreferenceProviderImpl, PreferenceScope, PreferenceProviderDataChange, PreferenceSchemaService,
    PreferenceConfigurations, PreferenceUtils, PreferenceLanguageOverrideService,
    PreferenceExclusionService, ExcludedPreference, Listener
} from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { Emitter, Event, ILogger } from '@theia/core';
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

const OVERRIDDEN_PREFERENCE_PATTERN = /^((?:\[[^\]]+\])+)\.(.+)$/;
@injectable()
export abstract class AbstractResourcePreferenceProvider extends PreferenceProviderImpl {
    protected preferenceStorage: PreferenceStorage;

    protected preferences: Record<string, any> = {};
    /** The content of the settings file, including the values the {@link PreferenceExclusionService} omits from {@link preferences}. */
    protected fileContent: Record<string, any> = {};
    protected appliedExclusions: { fileContent: Record<string, any>, excluded: string } | undefined;
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
    @inject(PreferenceExclusionService)
    protected readonly exclusionService: PreferenceExclusionService;

    @inject(ILogger) @named('preferences:AbstractResourcePreferenceProvider')
    protected readonly logger: ILogger;

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        const uri = this.getUri();
        this.toDispose.push(Disposable.create(() => this.loading.reject(new Error(`Preference provider for '${uri}' was disposed.`))));

        this.preferenceStorage = this.preferenceStorageFactory(uri, this.getScope());
        this.toDispose.push(this.preferenceStorage);
        this.preferenceStorage.onDidChangeFileContent(async ({ content, fileOK }) => {
            this.fileExists = fileOK;
            this.readPreferencesFromContent(content);
            await this.fireDidPreferencesChanged(); // Ensure all consumers of the event have received it.¨
            return true;
        });
        this.toDispose.pushAll([
            this.exclusionService.onDidChange(() => this.applyExclusions()),
            this.schemaProvider.onDidChangeSchema(() => this.applyExclusions())
        ]);
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

    async setPreference(key: string, value: any, resourceUri?: string, overrideIdentifier?: string): Promise<boolean> {
        let path: string[] | undefined;
        if (this.toDispose.disposed || !(path = this.getPath(key, overrideIdentifier)) || !this.contains(resourceUri)) {
            return false;
        }
        return this.doSetPreference(key, path, value);
    }

    protected doSetPreference(key: string, path: string[], value: JSONValue): Promise<boolean> {
        return this.preferenceStorage.writeValue(key, path, value);
    }

    protected getPath(preferenceName: string, overrideIdentifier?: string): string[] | undefined {
        if (overrideIdentifier) {
            return [`[${overrideIdentifier}]`, preferenceName];
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
        if (this.toDispose.disposed) {
            return;
        }
        this.fileContent = this.getParsedContent(preferencesInJson);
        this.applyExclusions();
    }

    /**
     * Applies the {@link PreferenceExclusionService} to the content of the settings file. Values that become
     * excluded or included fire the same change events as an edit of the file.
     */
    protected applyExclusions(): void {
        const configUri = this.getUri();
        const scope = this.getScope();
        const preferences: Record<string, any> = {};
        const excluded: ExcludedPreference[] = [];
        for (const [key, value] of Object.entries(this.fileContent)) {
            const { preferenceName, overrideIdentifier } = this.parsePreferenceKey(key);
            const property = this.schemaProvider.getSchemaProperty(preferenceName);
            if (this.exclusionService.isExcluded(preferenceName, { scope, configUri, property, overrideIdentifier })) {
                excluded.push({ preferenceName, overrideIdentifier, scope, configUri });
            } else {
                preferences[key] = value;
            }
        }
        const applied = {
            fileContent: this.fileContent,
            excluded: JSON.stringify([scope, excluded.map(({ preferenceName, overrideIdentifier }) => [preferenceName, overrideIdentifier])])
        };
        if (this.appliedExclusions?.fileContent === applied.fileContent && this.appliedExclusions.excluded === applied.excluded) {
            return;
        }
        this.appliedExclusions = applied;
        this.exclusionService.setExcludedPreferences(configUri, excluded);
        this.handlePreferenceChanges(preferences);
    }

    protected parsePreferenceKey(key: string): { preferenceName: string, overrideIdentifier?: string } {
        const match = OVERRIDDEN_PREFERENCE_PATTERN.exec(key);
        return match ? { preferenceName: match[2], overrideIdentifier: match[1].slice(1, -1) } : { preferenceName: key };
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
            const { preferenceName: realName, overrideIdentifier } = this.parsePreferenceKey(prefName);

            const oldValue = oldPrefs[prefName];
            const newValue = newPrefs[prefName];
            const schemaProperty = this.schemaProvider.getSchemaProperty(realName);
            if (schemaProperty && schemaProperty.included) {
                const scope = schemaProperty.scope;
                // do not emit the change event if the change is made out of the defined preference scope
                if (!this.schemaProvider.isValidInScope(realName, this.getScope())) {
                    this.logger.warn(`Preference ${realName} in ${uri} can only be defined in scopes: ${PreferenceScope.getScopeNames(scope).join(', ')}.`);
                    continue;
                }
            }
            if (!PreferenceUtils.deepEqual(newValue, oldValue)) {
                prefChanges.push({
                    preferenceName: realName, newValue, oldValue, scope: this.getScope(), overrideIdentifier, domain: this.getDomain()
                });
            }
        }

        if (prefChanges.length > 0) {
            this.emitPreferencesChangedEvent(prefChanges);
        }
    }

    protected reset(): void {
        this.fileContent = {};
        this.applyExclusions();
    }
}
