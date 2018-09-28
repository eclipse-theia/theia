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
import { inject, injectable, postConstruct } from 'inversify';
import * as jsoncparser from 'jsonc-parser';
import URI from '@theia/core/lib/common/uri';
import { ILogger, Resource, ResourceProvider, MaybePromise } from '@theia/core/lib/common';
import { PreferenceProvider, PreferenceSchemaProvider, PreferenceScope } from '@theia/core/lib/browser/preferences';

@injectable()
export abstract class AbstractResourcePreferenceProvider extends PreferenceProvider {

    protected preferences: { [key: string]: any } = {};
    protected resource: Promise<Resource>;

    @inject(ILogger) protected readonly logger: ILogger;
    @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider;
    @inject(PreferenceSchemaProvider) protected readonly schemaProvider: PreferenceSchemaProvider;

    @postConstruct()
    protected async init(): Promise<void> {
        const uri = await this.getUri();

        // In case if no workspace is opened there are no workspace settings.
        // There is nothing to contribute to preferences and we just skip it.
        if (!uri) {
            this._ready.resolve();
            return;
        }
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
            this.toDispose.push(resource.onDidChangeContents(content => {
                this.readPreferences();
            }));
        }
    }

    abstract getUri(root?: URI): MaybePromise<URI | undefined>;

    getPreferences(resourceUri?: string): { [key: string]: any } {
        return this.preferences;
    }

    async setPreference(key: string, value: any): Promise<void> {
        // TODO who called this function? should have a scope, or call from the concrete class
        // Maybe we don't need to worry about it in this patch - only change read(), as UI functionalities will be done in the next
        const resource = await this.resource;
        if (resource.saveContents) {
            const content = await this.readContents();
            const formattingOptions = { tabSize: 3, insertSpaces: true, eol: '' };
            const edits = jsoncparser.modify(content, this.getPath(key), value, { formattingOptions });
            const result = jsoncparser.applyEdits(content, edits);

            await resource.saveContents(result);
            const oldValue = this.preferences[key];
            if (JSONExt.deepEqual(value, oldValue)) {
                return;
            }
            this.preferences[key] = value;
            this.onDidPreferencesChangedEmitter.fire({
                preferenceName: key,
                newValue: value,
                oldValue,
                scope: this.getScope(),
                folderUris: this.getFolderUris()
            });
            this.emitPreferenceChangedEvent(key, value, oldValue);
        }
    }

    protected getPath(preferenceName: string): string[] {
        return [preferenceName];
    }

    protected async readPreferences(): Promise<void> {
        const newContent = await this.readContents();
        const newPrefs = this.getParsedContent(newContent);
        await this.handlePreferenceChanges(newPrefs);
    }

    protected async readContents(): Promise<string> {
        try {
            const resource = await this.resource;
            return await resource.readContents();
        } catch {
            return '';
        }
    }

    protected getParsedContent(content: string): { [key: string]: any } {
        const strippedContent = jsoncparser.stripComments(content);
        const newPrefs = jsoncparser.parse(strippedContent) || {};
        return newPrefs;
    }

    protected async handlePreferenceChanges(newPrefs: { [key: string]: any }): Promise<void> {
        const oldPrefs = Object.assign({}, this.preferences);
        this.preferences = newPrefs;
        const prefNames = new Set([...Object.keys(oldPrefs), ...Object.keys(newPrefs)]);
        for (const prefName of prefNames.values()) {
            const oldValue = oldPrefs[prefName];
            const newValue = newPrefs[prefName];
            const prefNameAndFile = `Preference ${prefName} in ${(await this.resource).uri.toString()}`;
            if (!this.schemaProvider.validate(prefName, newValue) && newValue !== undefined) { // do not emit the change event if pref is not defined in schema
                this.logger.warn(`${prefNameAndFile} is invalid.`);
                continue;
            }
            const schemaProperties = this.schemaProvider.getCombinedSchema().properties[prefName];
            if (schemaProperties) {
                const scopes = schemaProperties.scopes;
                // do not emit the change event if the change is made out of the defined preference scope
                if (!this.schemaProvider.isValidInScope(prefName, this.getScope())) {
                    this.logger.warn(`${prefNameAndFile} can only be defined in scopes: ${PreferenceScope.getScopeNames(scopes).join(', ')}.`);
                    continue;
                }
            }

            if (!JSONExt.deepEqual(oldValue, newValue)) { // do not emit the change event if the pref value is not changed
                this.emitPreferenceChangedEvent(prefName, newValue, oldValue);
            }
        }
    }

    protected emitPreferenceChangedEvent(preferenceName: string, newValue: any, oldValue: any): void {
        this.onDidPreferencesChangedEmitter.fire({
            preferenceName,
            newValue,
            oldValue,
            scope: this.getScope(),
            folderUris: this.getFolderUris()
        });
    }

    protected getFolderUris(): string[] {
        return [];
    }

    dispose(): void {
        for (const prefName of Object.keys(this.preferences)) {
            const value = this.preferences[prefName];
            if (value !== undefined || value !== null) {
                this.emitPreferenceChangedEvent(prefName, undefined, value);
            }
        }
        super.dispose();
    }
}
