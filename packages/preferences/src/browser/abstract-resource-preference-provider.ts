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
/* eslint-disable no-null/no-null */

import * as jsoncparser from 'jsonc-parser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { MessageService } from '@theia/core/lib/common/message-service';
import { Disposable } from '@theia/core/lib/common/disposable';
import { PreferenceProvider, PreferenceSchemaProvider, PreferenceScope, PreferenceProviderDataChange } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

@injectable()
export abstract class AbstractResourcePreferenceProvider extends PreferenceProvider {

    protected preferences: { [key: string]: any } = {};
    protected model: MonacoEditorModel | undefined;
    protected readonly loading = new Deferred();
    protected modelInitialized = false;

    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(PreferenceSchemaProvider) protected readonly schemaProvider: PreferenceSchemaProvider;
    @inject(FileService) protected readonly fileService: FileService;

    @inject(PreferenceConfigurations)
    protected readonly configurations: PreferenceConfigurations;

    @inject(MonacoTextModelService)
    protected readonly textModelService: MonacoTextModelService;

    @inject(MonacoWorkspace)
    protected readonly workspace: MonacoWorkspace;

    @postConstruct()
    protected async init(): Promise<void> {
        const uri = this.getUri();
        this.toDispose.push(Disposable.create(() => this.loading.reject(new Error(`preference provider for '${uri}' was disposed`))));
        await this.readPreferencesFromFile();
        this._ready.resolve();

        const reference = await this.textModelService.createModelReference(uri);
        if (this.toDispose.disposed) {
            reference.dispose();
            return;
        }

        this.model = reference.object;
        this.loading.resolve();
        this.modelInitialized = true;

        this.toDispose.push(reference);
        this.toDispose.push(Disposable.create(() => this.model = undefined));

        this.toDispose.push(this.model.onDidChangeContent(() => this.readPreferences()));
        this.toDispose.push(this.model.onDirtyChanged(() => this.readPreferences()));
        this.toDispose.push(this.model.onDidChangeValid(() => this.readPreferences()));

        this.toDispose.push(Disposable.create(() => this.reset()));
    }

    protected abstract getUri(): URI;
    protected abstract getScope(): PreferenceScope;

    protected get valid(): boolean {
        return this.modelInitialized ? !!this.model?.valid : Object.keys(this.preferences).length > 0;
    }

    getConfigUri(): URI;
    getConfigUri(resourceUri: string | undefined): URI | undefined;
    getConfigUri(resourceUri?: string): URI | undefined {
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
        await this.loading.promise;
        if (!this.model) {
            return false;
        }
        if (!this.contains(resourceUri)) {
            return false;
        }
        const path = this.getPath(key);
        if (!path) {
            return false;
        }
        try {
            const content = this.model.getText().trim();
            if (!content && value === undefined) {
                return true;
            }
            const textModel = this.model.textEditorModel;
            const editOperations: monaco.editor.IIdentifiedSingleEditOperation[] = [];
            if (path.length || value !== undefined) {
                const { insertSpaces, tabSize, defaultEOL } = textModel.getOptions();
                for (const edit of jsoncparser.modify(content, path, value, {
                    formattingOptions: {
                        insertSpaces,
                        tabSize,
                        eol: defaultEOL === monaco.editor.DefaultEndOfLine.LF ? '\n' : '\r\n'
                    }
                })) {
                    const start = textModel.getPositionAt(edit.offset);
                    const end = textModel.getPositionAt(edit.offset + edit.length);
                    editOperations.push({
                        range: monaco.Range.fromPositions(start, end),
                        text: edit.content || null,
                        forceMoveMarkers: false
                    });
                }
            } else {
                editOperations.push({
                    range: textModel.getFullModelRange(),
                    text: null,
                    forceMoveMarkers: false
                });
            }
            await this.workspace.applyBackgroundEdit(this.model, editOperations);
            return await this.pendingChanges;
        } catch (e) {
            const message = `Failed to update the value of '${key}' in '${this.getUri()}'.`;
            this.messageService.error(`${message} Please check if it is corrupted.`);
            console.error(`${message}`, e);
            return false;
        }
    }

    protected getPath(preferenceName: string): string[] | undefined {
        return [preferenceName];
    }

    protected async readPreferencesFromFile(): Promise<void> {
        const content = await this.fileService.read(this.getUri()).catch(() => ({ value: '' }));
        this.readPreferencesFromContent(content.value);
    }

    /**
     * It HAS to be sync to ensure that `setPreference` returns only when values are updated
     * or any other operation modifying the monaco model content.
     */
    protected readPreferences(): void {
        const model = this.model;
        if (!model || model.dirty) {
            return;
        }
        try {
            const content = model.valid ? model.getText() : '';
            this.readPreferencesFromContent(content);
        } catch (e) {
            console.error(`Failed to load preferences from '${this.getUri()}'.`, e);
        }
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

}
