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

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as jsoncparser from 'jsonc-parser';
import { JSONExt } from '@phosphor/coreutils/lib/json';
import { inject, injectable, postConstruct } from 'inversify';
import { MessageService, Resource, ResourceProvider, Disposable } from '@theia/core';
import { PreferenceProvider, PreferenceSchemaProvider, PreferenceScope, PreferenceProviderDataChange, PreferenceService } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';

@injectable()
export abstract class AbstractResourcePreferenceProvider extends PreferenceProvider {

    protected preferences: { [key: string]: any } = {};
    protected resource: Promise<Resource>;

    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(PreferenceSchemaProvider) protected readonly schemaProvider: PreferenceSchemaProvider;

    @inject(PreferenceConfigurations)
    protected readonly configurations: PreferenceConfigurations;

    @postConstruct()
    protected async init(): Promise<void> {
        const uri = this.getUri();
        this.resource = this.resourceProvider(uri);

        // Try to read the initial content of the preferences.  The provider
        // becomes ready even if we fail reading the preferences, so we don't
        // hang the preference service.
        this.readPreferences()
            .then(() => this._ready.resolve())
            .catch(() => this._ready.resolve());

        const resource = await this.resource;
        this.toDispose.push(resource);
        if (resource.onDidChangeContents) {
            this.toDispose.push(resource.onDidChangeContents(() => this.readPreferences()));
        }
        this.toDispose.push(Disposable.create(() => this.reset()));
    }

    protected abstract getUri(): URI;
    protected abstract getScope(): PreferenceScope;

    getConfigUri(): URI;
    getConfigUri(resourceUri: string | undefined): URI | undefined;
    getConfigUri(resourceUri?: string): URI | undefined {
        if (!resourceUri) {
            return this.getUri();
        }
        return this.loaded && this.contains(resourceUri) ? this.getUri() : undefined;
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
        return this.loaded && this.contains(resourceUri) ? this.preferences : {};
    }

    async setPreference(key: string, value: any, resourceUri?: string): Promise<boolean> {
        if (!this.contains(resourceUri)) {
            return false;
        }
        const path = this.getPath(key);
        if (!path) {
            return false;
        }
        const resource = await this.resource;
        if (!resource.saveContents) {
            return false;
        }
        const content = ((await this.readContents()) || '').trim();
        if (!content && value === undefined) {
            return true;
        }
        try {
            let newContent = '';
            if (path.length || value !== undefined) {
                const formattingOptions = this.getFormattingOptions(resourceUri);
                const edits = jsoncparser.modify(content, path, value, { formattingOptions });
                newContent = jsoncparser.applyEdits(content, edits);
            }
            await resource.saveContents(newContent);
        } catch (e) {
            const message = `Failed to update the value of ${key}.`;
            this.messageService.error(`${message} Please check if ${resource.uri.toString()} is corrupted.`);
            console.error(`${message} ${e.toString()}`);
            return false;
        }
        await this.readPreferences();
        return true;
    }

    protected getPath(preferenceName: string): string[] | undefined {
        return [preferenceName];
    }

    protected loaded = false;
    protected async readPreferences(): Promise<void> {
        const newContent = await this.readContents();
        this.loaded = newContent !== undefined;
        const newPrefs = newContent ? this.getParsedContent(newContent) : {};
        this.handlePreferenceChanges(newPrefs);
    }

    protected async readContents(): Promise<string | undefined> {
        try {
            const resource = await this.resource;
            return await resource.readContents();
        } catch {
            return undefined;
        }
    }

    protected getParsedContent(content: string): { [key: string]: any } {
        const jsonData = this.parse(content);

        const preferences: { [key: string]: any } = {};
        if (typeof jsonData !== 'object') {
            return preferences;
        }
        // eslint-disable-next-line guard-for-in
        for (const preferenceName in jsonData) {
            const preferenceValue = jsonData[preferenceName];
            if (this.schemaProvider.testOverrideValue(preferenceName, preferenceValue)) {
                // eslint-disable-next-line guard-for-in
                for (const overriddenPreferenceName in preferenceValue) {
                    const overriddenValue = preferenceValue[overriddenPreferenceName];
                    preferences[`${preferenceName}.${overriddenPreferenceName}`] = overriddenValue;
                }
            } else {
                preferences[preferenceName] = preferenceValue;
            }
        }
        return preferences;
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
            if (newValue === undefined && oldValue !== newValue
                || oldValue === undefined && newValue !== oldValue // JSONExt.deepEqual() does not support handling `undefined`
                || !JSONExt.deepEqual(oldValue, newValue)) {
                prefChanges.push({
                    preferenceName: prefName, newValue, oldValue, scope: this.getScope(), domain: this.getDomain()
                });
            }
        }

        if (prefChanges.length > 0) { // do not emit the change event if the pref value is not changed
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

    /**
     * Get the formatting options to be used when calling `jsoncparser`.
     * The formatting options are based on the corresponding preference values.
     *
     * The formatting options should attempt to obtain the preference values from JSONC,
     * and if necessary fallback to JSON and the global values.
     * @param uri the preference settings URI.
     *
     * @returns a tuple representing the tab indentation size, and if it is spaces.
     */
    protected getFormattingOptions(uri?: string): jsoncparser.FormattingOptions {
        // Get the global formatting options for both `tabSize` and `insertSpaces`.
        const globalTabSize = this.preferenceService.get('editor.tabSize', 2, uri);
        const globalInsertSpaces = this.preferenceService.get('editor.insertSpaces', true, uri);

        // Get the superset JSON formatting options for both `tabSize` and `insertSpaces`.
        const jsonTabSize = this.preferenceService.get('[json].editor.tabSize', globalTabSize, uri);
        const jsonInsertSpaces = this.preferenceService.get('[json].editor.insertSpaces', globalInsertSpaces, uri);

        return {
            tabSize: this.preferenceService.get('[jsonc].editor.tabSize', jsonTabSize, uri),
            insertSpaces: this.preferenceService.get('[jsonc].editor.insertSpaces', jsonInsertSpaces, uri),
            eol: ''
        };
    }

}
