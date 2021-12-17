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
import { Mutex, MutexInterface } from 'async-mutex';
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
import { CancellationError, nls } from '@theia/core';
import { EditorManager } from '@theia/editor/lib/browser';

export interface FilePreferenceProviderLocks {
    /**
     * Defined if the current operation is the first operation in a new transaction.
     * The first operation is responsible for checking whether the underlying editor is dirty
     * and for saving the file when the transaction is complete.
     */
    releaseTransaction?: MutexInterface.Releaser | undefined;
    /**
     * A lock on the queue for single operations.
     */
    releaseChange: MutexInterface.Releaser;
}

@injectable()
export abstract class AbstractResourcePreferenceProvider extends PreferenceProvider {

    protected preferences: Record<string, any> = {};
    protected fileExists = false;
    protected modelReference: monaco.editor.IReference<MonacoEditorModel> | undefined;
    protected readonly loading = new Deferred();
    protected readonly singleChangeLock = new Mutex();
    protected readonly transactionLock = new Mutex();
    protected pendingTransaction = new Deferred<boolean>();

    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(PreferenceSchemaProvider) protected readonly schemaProvider: PreferenceSchemaProvider;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;

    @inject(PreferenceConfigurations)
    protected readonly configurations: PreferenceConfigurations;

    @inject(MonacoTextModelService)
    protected readonly textModelService: MonacoTextModelService;

    @inject(MonacoWorkspace)
    protected readonly workspace: MonacoWorkspace;

    @postConstruct()
    protected async init(): Promise<void> {
        this.pendingTransaction.resolve(true);
        const uri = this.getUri();
        this.toDispose.push(Disposable.create(() => this.loading.reject(new Error(`preference provider for '${uri}' was disposed`))));
        await this.readPreferencesFromFile();
        this._ready.resolve();
        this.loading.resolve();
        this.toDispose.pushAll([
            this.fileService.watch(uri),
            this.fileService.onDidFilesChange(e => {
                if (e.contains(uri)) {
                    this.readPreferencesFromFile();
                }
            }),
            Disposable.create(() => this.disposeModel()),
            Disposable.create(() => this.reset()),
        ]);
    }

    protected abstract getUri(): URI;
    protected abstract getScope(): PreferenceScope;

    protected get valid(): boolean {
        return this.fileExists;
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
        const locks = await this.acquireLocks();
        let shouldSave = Boolean(locks?.releaseTransaction);
        const model = this.modelReference?.object;
        try {
            await this.loading.promise;
            let path: string[] | undefined;
            if (this.toDispose.disposed || !model || !(path = this.getPath(key)) || !this.contains(resourceUri)) {
                return false;
            }
            if (!locks) {
                throw new CancellationError();
            }
            if (shouldSave) {
                if (model.dirty) {
                    shouldSave = await this.handleDirtyEditor();
                }
                if (!shouldSave) {
                    throw new CancellationError();
                }
            }
            const editOperations = this.getEditOperations(path, value);
            if (editOperations.length > 0) {
                await this.workspace.applyBackgroundEdit(model, editOperations, false);
            }
            return this.pendingTransaction.promise;
        } catch (e) {
            if (e instanceof CancellationError) {
                throw e;
            }
            const message = `Failed to update the value of '${key}' in '${this.getUri()}'.`;
            this.messageService.error(`${message} Please check if it is corrupted.`);
            console.error(`${message}`, e);
            return false;
        } finally {
            this.releaseLocks(locks, shouldSave);
        }
    }

    /**
     * @returns `undefined` if the queue has been cleared by a user action.
     */
    protected async acquireLocks(): Promise<FilePreferenceProviderLocks | undefined> {
        // Request locks immediately
        const releaseTransactionPromise = this.transactionLock.isLocked() ? undefined : this.transactionLock.acquire();
        const releaseChangePromise = this.singleChangeLock.acquire().catch(() => {
            releaseTransactionPromise?.then(release => release());
            return undefined;
        });
        if (releaseTransactionPromise) {
            await this.pendingTransaction.promise; // Ensure previous transaction complete before starting a new one.
            this.modelReference = await this.textModelService.createModelReference(this.getUri());
            this.toDispose.push(this.modelReference);
            this.pendingTransaction = new Deferred();
        }
        // Wait to acquire locks
        const [releaseTransaction, releaseChange] = await Promise.all([releaseTransactionPromise, releaseChangePromise]);
        return releaseChange && { releaseTransaction, releaseChange };
    }

    protected releaseLocks(locks: FilePreferenceProviderLocks | undefined, shouldSave: boolean): void {
        if (locks?.releaseTransaction) {
            if (shouldSave) {
                this.singleChangeLock.waitForUnlock().then(() => this.singleChangeLock.runExclusive(async () => {
                    locks.releaseTransaction!(); // Release lock so that no new changes join this transaction.
                    let success = false;
                    try {
                        await this.modelReference?.object.save();
                        success = true;
                    } finally {
                        await this.readPreferencesFromFile();
                        await this.fireDidPreferencesChanged(); // Ensure all consumers of the event have received it.
                        this.disposeModel();
                        this.pendingTransaction.resolve(success);
                    }
                }));
            } else { // User canceled the operation.
                this.singleChangeLock.cancel();
                locks.releaseTransaction!();
                this.pendingTransaction.resolve(false);
            }
        }
        locks?.releaseChange();
    }

    protected disposeModel(): void {
        this.modelReference?.dispose();
        this.modelReference = undefined;
    }

    protected getEditOperations(path: string[], value: any): monaco.editor.IIdentifiedSingleEditOperation[] {
        const textModel = this.modelReference!.object.textEditorModel;
        const content = this.modelReference!.object.getText().trim();
        // Everything is already undefined - no need for changes.
        if (!content && value === undefined) {
            return [];
        }
        // Delete the entire document.
        if (!path.length && value === undefined) {
            return [{
                range: textModel.getFullModelRange(),
                text: null,
                forceMoveMarkers: false
            }];
        }
        const { insertSpaces, tabSize, defaultEOL } = textModel.getOptions();
        const jsonCOptions = {
            formattingOptions: {
                insertSpaces,
                tabSize,
                eol: defaultEOL === monaco.editor.DefaultEndOfLine.LF ? '\n' : '\r\n'
            }
        };
        return jsoncparser.modify(content, path, value, jsonCOptions).map(edit => {
            const start = textModel.getPositionAt(edit.offset);
            const end = textModel.getPositionAt(edit.offset + edit.length);
            return {
                range: monaco.Range.fromPositions(start, end),
                text: edit.content || null,
                forceMoveMarkers: false
            };
        });
    }

    protected getPath(preferenceName: string): string[] | undefined {
        return [preferenceName];
    }

    protected async readPreferencesFromFile(): Promise<void> {
        const content = await this.fileService.read(this.getUri())
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

    /**
     * It HAS to be sync to ensure that `setPreference` returns only when values are updated
     * or any other operation modifying the monaco model content.
     */
    protected readPreferences(): void {
        const model = this.modelReference?.object;
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

    /**
     * @returns whether the setting operation in progress, and any others started in the meantime, should continue.
     */
    protected async handleDirtyEditor(): Promise<boolean> {
        const saveAndRetry = nls.localizeByDefault('Save and Retry');
        const open = nls.localizeByDefault('Open File');
        const msg = await this.messageService.error(
            nls.localizeByDefault('Unable to write into {0} settings because the file has unsaved changes. Please save the {0} settings file first and then try again.',
                nls.localizeByDefault(PreferenceScope[this.getScope()].toLocaleLowerCase())
            ),
            saveAndRetry, open);

        if (this.modelReference?.object) {
            if (msg === open) {
                this.editorManager.open(new URI(this.modelReference.object.uri));
                return false;
            } else if (msg === saveAndRetry) {
                await this.modelReference.object.save();
                return true;
            }
        }
        return false;
    }
}
