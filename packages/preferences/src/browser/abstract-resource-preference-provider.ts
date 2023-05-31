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
import { PreferenceProvider, PreferenceSchemaProvider, PreferenceScope, PreferenceProviderDataChange } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { PreferenceContext, PreferenceTransaction, PreferenceTransactionFactory } from './preference-transaction-manager';
import { Emitter, Event } from '@theia/core';

@injectable()
export abstract class AbstractResourcePreferenceProvider extends PreferenceProvider {

    protected preferences: Record<string, any> = {};
    protected _fileExists = false;
    protected readonly loading = new Deferred();
    protected transaction: PreferenceTransaction | undefined;
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

    @inject(PreferenceTransactionFactory) protected readonly transactionFactory: PreferenceTransactionFactory;
    @inject(PreferenceSchemaProvider) protected readonly schemaProvider: PreferenceSchemaProvider;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(PreferenceConfigurations) protected readonly configurations: PreferenceConfigurations;

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        const uri = this.getUri();
        this.toDispose.push(Disposable.create(() => this.loading.reject(new Error(`Preference provider for '${uri}' was disposed.`))));
        await this.readPreferencesFromFile();
        this._ready.resolve();
        this.loading.resolve();
        const storageUri = this.toFileManager().getConfigUri();
        this.toDispose.pushAll([
            this.fileService.watch(storageUri),
            this.fileService.onDidFilesChange(e => {
                if (e.contains(storageUri)) {
                    this.readPreferencesFromFile();
                }
            }),
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

    protected async doSetPreference(key: string, path: string[], value: unknown): Promise<boolean> {
        if (!this.transaction?.open) {
            const current = this.transaction;
            this.transaction = this.transactionFactory(this.toFileManager(), current?.result);
            this.transaction.onWillConclude(({ status, waitUntil }) => {
                if (status) {
                    waitUntil((async () => {
                        await this.readPreferencesFromFile();
                        await this.fireDidPreferencesChanged(); // Ensure all consumers of the event have received it.
                    })());
                }
            });
            this.toDispose.push(this.transaction);
        }
        return this.transaction.enqueueAction(key, path, value);
    }

    /**
     * Use this method as intermediary for interactions with actual files.
     * Allows individual providers to modify where they store their files without disrupting the preference system's
     * conventions about scope and file location.
     */
    protected toFileManager(): PreferenceContext {
        return this;
    }

    protected getPath(preferenceName: string): string[] | undefined {
        const asOverride = this.preferenceOverrideService.overriddenPreferenceName(preferenceName);
        if (asOverride?.overrideIdentifier) {
            return [this.preferenceOverrideService.markLanguageOverride(asOverride.overrideIdentifier), asOverride.preferenceName];
        }
        return [preferenceName];
    }

    protected async readPreferencesFromFile(): Promise<void> {
        const content = await this.fileService.read(this.toFileManager().getConfigUri())
            .then(value => {
                this.fileExists = true;
                return value;
            })
            .catch(() => {
                this.fileExists = false;
                return { value: '' };
            });
        this.readPreferencesFromContent(content.value);
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
            const schemaProperties = this.schemaProvider.getCombinedSchema().properties[prefName];
            if (schemaProperties) {
                const scope = schemaProperties.scope;
                // do not emit the change event if the change is made out of the defined preference scope
                if (!this.schemaProvider.isValidInScope(prefName, this.getScope())) {
                    console.warn(`Preference ${prefName} in ${uri} can only be defined in scopes: ${PreferenceScope.getScopeNames(scope).join(', ')}.`);
                    continue;
                }
            }
            if (!PreferenceProvider.deepEqual(newValue, oldValue)) {
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
