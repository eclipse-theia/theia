// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

/* eslint-disable no-null/no-null */

import { URI as Uri } from '@theia/core/shared/vscode-uri';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { Emitter } from '@theia/core/lib/common/event';
import { FileSystemPreferences } from '@theia/filesystem/lib/browser';
import { EditorManager, EditorPreferences } from '@theia/editor/lib/browser';
import { MonacoTextModelService } from './monaco-text-model-service';
import { WillSaveMonacoModelEvent, MonacoEditorModel, MonacoModelContentChangedEvent } from './monaco-editor-model';
import { MonacoEditor } from './monaco-editor';
import { ProblemManager } from '@theia/markers/lib/browser';
import { ArrayUtils } from '@theia/core/lib/common/types';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileSystemProviderCapabilities } from '@theia/filesystem/lib/common/files';
import * as monaco from '@theia/monaco-editor-core';
import {
    IBulkEditOptions,
    IBulkEditResult, ResourceEdit, ResourceFileEdit as MonacoResourceFileEdit,
    ResourceTextEdit as MonacoResourceTextEdit
} from '@theia/monaco-editor-core/esm/vs/editor/browser/services/bulkEditService';
import { IEditorWorkerService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/editorWorker';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { EndOfLineSequence } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { SnippetParser } from '@theia/monaco-editor-core/esm/vs/editor/contrib/snippet/browser/snippetParser';
import { TextEdit } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { SnippetController2 } from '@theia/monaco-editor-core/esm/vs/editor/contrib/snippet/browser/snippetController2';
import { isObject, MaybePromise, nls } from '@theia/core/lib/common';
import { SaveableService } from '@theia/core/lib/browser';

export namespace WorkspaceFileEdit {
    export function is(arg: Edit): arg is monaco.languages.IWorkspaceFileEdit {
        return ('oldResource' in arg && monaco.Uri.isUri(arg.oldResource)) ||
            ('newResource' in arg && monaco.Uri.isUri(arg.newResource));
    }
}

export namespace WorkspaceTextEdit {
    export function is(arg: Edit): arg is monaco.languages.IWorkspaceTextEdit {
        return isObject<monaco.languages.IWorkspaceTextEdit>(arg)
            && monaco.Uri.isUri(arg.resource)
            && isObject(arg.textEdit);
    }
}

export type Edit = monaco.languages.IWorkspaceFileEdit | monaco.languages.IWorkspaceTextEdit;

export namespace ResourceFileEdit {
    export function is(arg: ResourceEdit): arg is MonacoResourceFileEdit {
        return isObject<MonacoResourceFileEdit>(arg) && (monaco.Uri.isUri(arg.oldResource) || monaco.Uri.isUri(arg.newResource));
    }
}

export namespace ResourceTextEdit {
    export function is(arg: ResourceEdit): arg is MonacoResourceTextEdit {
        return ('resource' in arg && monaco.Uri.isUri((arg as MonacoResourceTextEdit).resource));
    }
}

export interface WorkspaceFoldersChangeEvent {
    readonly added: WorkspaceFolder[];
    readonly removed: WorkspaceFolder[];
}

export interface WorkspaceFolder {
    readonly uri: Uri;
    readonly name: string;
    readonly index: number;
}

@injectable()
export class MonacoWorkspace {

    protected resolveReady: () => void;
    readonly ready = new Promise<void>(resolve => {
        this.resolveReady = resolve;
    });

    protected readonly onDidOpenTextDocumentEmitter = new Emitter<MonacoEditorModel>();
    readonly onDidOpenTextDocument = this.onDidOpenTextDocumentEmitter.event;

    protected readonly onDidCloseTextDocumentEmitter = new Emitter<MonacoEditorModel>();
    readonly onDidCloseTextDocument = this.onDidCloseTextDocumentEmitter.event;

    protected readonly onDidChangeTextDocumentEmitter = new Emitter<MonacoModelContentChangedEvent>();
    readonly onDidChangeTextDocument = this.onDidChangeTextDocumentEmitter.event;

    protected readonly onWillSaveTextDocumentEmitter = new Emitter<WillSaveMonacoModelEvent>();
    readonly onWillSaveTextDocument = this.onWillSaveTextDocumentEmitter.event;

    protected readonly onDidSaveTextDocumentEmitter = new Emitter<MonacoEditorModel>();
    readonly onDidSaveTextDocument = this.onDidSaveTextDocumentEmitter.event;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(FileSystemPreferences)
    protected readonly filePreferences: FileSystemPreferences;

    @inject(EditorPreferences)
    protected readonly editorPreferences: EditorPreferences;

    @inject(MonacoTextModelService)
    protected readonly textModelService: MonacoTextModelService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(ProblemManager)
    protected readonly problems: ProblemManager;

    @inject(SaveableService)
    protected readonly saveService: SaveableService;

    @postConstruct()
    protected init(): void {
        this.resolveReady();

        for (const model of this.textModelService.models) {
            this.fireDidOpen(model);
        }
        this.textModelService.onDidCreate(model => this.fireDidOpen(model));
    }

    get textDocuments(): MonacoEditorModel[] {
        return this.textModelService.models;
    }

    getTextDocument(uri: string): MonacoEditorModel | undefined {
        return this.textModelService.get(uri);
    }

    protected fireDidOpen(model: MonacoEditorModel): void {
        this.doFireDidOpen(model);
        model.textEditorModel.onDidChangeLanguage(e => {
            this.problems.cleanAllMarkers(new URI(model.uri));
            model.setLanguageId(e.oldLanguage);
            try {
                this.fireDidClose(model);
            } finally {
                model.setLanguageId(undefined);
            }
            this.doFireDidOpen(model);
        });
        model.onDidChangeContent(event => this.fireDidChangeContent(event));
        model.onDidSaveModel(() => this.fireDidSave(model));
        model.onWillSaveModel(event => this.fireWillSave(event));
        model.onDirtyChanged(() => this.openEditorIfDirty(model));
        model.onDispose(() => this.fireDidClose(model));
    }

    protected doFireDidOpen(model: MonacoEditorModel): void {
        this.onDidOpenTextDocumentEmitter.fire(model);
    }

    protected fireDidClose(model: MonacoEditorModel): void {
        this.onDidCloseTextDocumentEmitter.fire(model);
    }

    protected fireDidChangeContent(event: MonacoModelContentChangedEvent): void {
        this.onDidChangeTextDocumentEmitter.fire(event);
    }

    protected fireWillSave(event: WillSaveMonacoModelEvent): void {
        this.onWillSaveTextDocumentEmitter.fire(event);
    }

    protected fireDidSave(model: MonacoEditorModel): void {
        this.onDidSaveTextDocumentEmitter.fire(model);
    }

    protected readonly suppressedOpenIfDirty: MonacoEditorModel[] = [];

    protected openEditorIfDirty(model: MonacoEditorModel): void {
        if (model.suppressOpenEditorWhenDirty || this.suppressedOpenIfDirty.indexOf(model) !== -1) {
            return;
        }
        if (model.dirty && MonacoEditor.findByDocument(this.editorManager, model).length === 0) {
            // create a new reference to make sure the model is not disposed before it is
            // acquired by the editor, thus losing the changes that made it dirty.
            this.textModelService.createModelReference(model.textEditorModel.uri).then(ref => {
                (
                    this.saveService.autoSave !== 'off' ? new Promise(resolve => model.onDidSaveModel(resolve)) :
                        this.editorManager.open(new URI(model.uri), { mode: 'open' })
                ).then(
                    () => ref.dispose()
                );
            });
        }
    }

    protected async suppressOpenIfDirty(model: MonacoEditorModel, cb: () => MaybePromise<void>): Promise<void> {
        this.suppressedOpenIfDirty.push(model);
        try {
            await cb();
        } finally {
            const i = this.suppressedOpenIfDirty.indexOf(model);
            if (i !== -1) {
                this.suppressedOpenIfDirty.splice(i, 1);
            }
        }
    }

    /**
     * Applies given edits to the given model.
     * The model is saved if no editors is opened for it.
     */
    applyBackgroundEdit(model: MonacoEditorModel, editOperations: monaco.editor.IIdentifiedSingleEditOperation[], shouldSave = true): Promise<void> {
        return this.suppressOpenIfDirty(model, async () => {
            const editor = MonacoEditor.findByDocument(this.editorManager, model)[0];
            const cursorState = editor && editor.getControl().getSelections() || [];
            model.textEditorModel.pushStackElement();
            model.textEditorModel.pushEditOperations(cursorState, editOperations, () => cursorState);
            model.textEditorModel.pushStackElement();
            if (!editor && shouldSave) {
                await model.save();
            }
        });
    }

    async applyBulkEdit(edits: ResourceEdit[], options?: IBulkEditOptions): Promise<IBulkEditResult> {
        try {
            let totalEdits = 0;
            let totalFiles = 0;
            const fileEdits = edits.filter(edit => edit instanceof MonacoResourceFileEdit);
            const [snippetEdits, textEdits] = ArrayUtils.partition(edits.filter(edit => edit instanceof MonacoResourceTextEdit) as MonacoResourceTextEdit[],
                edit => edit.textEdit.insertAsSnippet && (edit.resource.toString() === this.editorManager.activeEditor?.getResourceUri()?.toString()));

            if (fileEdits.length > 0) {
                await this.performFileEdits(<MonacoResourceFileEdit[]>fileEdits);
            }

            if (textEdits.length > 0) {
                const result = await this.performTextEdits(<MonacoResourceTextEdit[]>textEdits);
                totalEdits += result.totalEdits;
                totalFiles += result.totalFiles;
            }

            if (snippetEdits.length > 0) {
                await this.performSnippetEdits(<MonacoResourceTextEdit[]>snippetEdits);
            }

            // when enabled (option AND setting) loop over all dirty working copies and trigger save
            // for those that were involved in this bulk edit operation.
            const resources = new Set<string>(
                edits
                    .filter((edit): edit is MonacoResourceTextEdit => edit instanceof MonacoResourceTextEdit)
                    .map(edit => edit.resource.toString())
            );
            if (resources.size > 0 && options?.respectAutoSaveConfig && this.editorPreferences.get('files.refactoring.autoSave') === true) {
                await this.saveAll(resources);
            }

            const ariaSummary = this.getAriaSummary(totalEdits, totalFiles);
            return { ariaSummary, isApplied: true };
        } catch (e) {
            console.error('Failed to apply Resource edits:', e);
            return {
                ariaSummary: `Error applying Resource edits: ${e.toString()}`,
                isApplied: false
            };
        }
    }

    protected async saveAll(resources: Set<string>): Promise<void> {
        await Promise.all(Array.from(resources.values()).map(uri => this.textModelService.get(uri)?.save()));
    }

    protected getAriaSummary(totalEdits: number, totalFiles: number): string {
        if (totalEdits === 0) {
            return nls.localizeByDefault('Made no edits');
        }
        if (totalEdits > 1 && totalFiles > 1) {
            return nls.localizeByDefault('Made {0} text edits in {1} files', totalEdits, totalFiles);
        }
        return nls.localizeByDefault('Made {0} text edits in one file', totalEdits);
    }

    protected async performTextEdits(edits: MonacoResourceTextEdit[]): Promise<{
        totalEdits: number,
        totalFiles: number
    }> {
        let totalEdits = 0;
        let totalFiles = 0;
        const resourceEdits = new Map<string, MonacoResourceTextEdit[]>();
        for (const edit of edits) {
            if (typeof edit.versionId === 'number') {
                const model = this.textModelService.get(edit.resource.toString());
                if (model && model.textEditorModel.getVersionId() !== edit.versionId) {
                    throw new Error(`${model.uri} has changed in the meantime`);
                }
            }
            const key = edit.resource.toString();
            let array = resourceEdits.get(key);
            if (!array) {
                array = [];
                resourceEdits.set(key, array);
            }
            array.push(edit);
        }
        const pending: Promise<void>[] = [];
        for (const [key, value] of resourceEdits) {
            pending.push((async () => {
                const uri = monaco.Uri.parse(key);
                let eol: EndOfLineSequence | undefined;
                const editOperations: monaco.editor.IIdentifiedSingleEditOperation[] = [];
                const minimalEdits = await StandaloneServices.get(IEditorWorkerService)
                    .computeMoreMinimalEdits(uri, value.map(edit => this.transformSnippetStringToInsertText(edit)));
                if (minimalEdits) {
                    for (const textEdit of minimalEdits) {
                        if (typeof textEdit.eol === 'number') {
                            eol = textEdit.eol;
                        }
                        if (monaco.Range.isEmpty(textEdit.range) && !textEdit.text) {
                            // skip no-op
                            continue;
                        }
                        editOperations.push({
                            forceMoveMarkers: false,
                            range: monaco.Range.lift(textEdit.range),
                            text: textEdit.text
                        });
                    }
                }
                if (!editOperations.length && eol === undefined) {
                    return;
                }
                const reference = await this.textModelService.createModelReference(uri);
                try {
                    const document = reference.object as MonacoEditorModel;
                    const model = document.textEditorModel;
                    const editor = MonacoEditor.findByDocument(this.editorManager, document)[0];
                    const cursorState = editor?.getControl().getSelections() ?? [];
                    // start a fresh operation
                    model.pushStackElement();
                    if (editOperations.length) {
                        model.pushEditOperations(cursorState, editOperations, () => cursorState);
                    }
                    if (eol !== undefined) {
                        model.pushEOL(eol);
                    }
                    // push again to make this change an undoable operation
                    model.pushStackElement();
                    totalFiles += 1;
                    totalEdits += editOperations.length;
                } finally {
                    reference.dispose();
                }
            })());
        }
        await Promise.all(pending);
        return { totalEdits, totalFiles };
    }

    protected async performFileEdits(edits: MonacoResourceFileEdit[]): Promise<void> {
        for (const edit of edits) {
            const options = edit.options || {};
            if (edit.newResource && edit.oldResource) {
                // rename
                if (options.overwrite === undefined && options.ignoreIfExists && await this.fileService.exists(URI.fromComponents(edit.newResource))) {
                    return; // not overwriting, but ignoring, and the target file exists
                }
                await this.fileService.move(URI.fromComponents(edit.oldResource), URI.fromComponents(edit.newResource), { overwrite: options.overwrite });
            } else if (!edit.newResource && edit.oldResource) {
                // delete file
                if (await this.fileService.exists(URI.fromComponents(edit.oldResource))) {
                    let useTrash = this.filePreferences['files.enableTrash'];
                    if (useTrash && !(this.fileService.hasCapability(URI.fromComponents(edit.oldResource), FileSystemProviderCapabilities.Trash))) {
                        useTrash = false; // not supported by provider
                    }
                    await this.fileService.delete(URI.fromComponents(edit.oldResource), { useTrash, recursive: options.recursive });
                } else if (!options.ignoreIfNotExists) {
                    throw new Error(`${edit.oldResource} does not exist and can not be deleted`);
                }
            } else if (edit.newResource && !edit.oldResource) {
                // create file
                if (options.overwrite === undefined && options.ignoreIfExists && await this.fileService.exists(URI.fromComponents(edit.newResource))) {
                    return; // not overwriting, but ignoring, and the target file exists
                }
                await this.fileService.create(URI.fromComponents(edit.newResource), undefined, { overwrite: options.overwrite });
            }
        }
    }

    protected async performSnippetEdits(edits: MonacoResourceTextEdit[]): Promise<void> {
        const activeEditor = MonacoEditor.getActive(this.editorManager)?.getControl();
        if (activeEditor) {
            const snippetController: SnippetController2 = activeEditor.getContribution('snippetController2')!;
            snippetController.apply(edits.map(edit => ({ range: monaco.Range.lift(edit.textEdit.range), template: edit.textEdit.text })));
        }
    }

    protected transformSnippetStringToInsertText(resourceEdit: MonacoResourceTextEdit): TextEdit & { insertAsSnippet?: boolean } {
        if (resourceEdit.textEdit.insertAsSnippet) {
            return { ...resourceEdit.textEdit, insertAsSnippet: false, text: SnippetParser.asInsertText(resourceEdit.textEdit.text) };
        } else {
            return resourceEdit.textEdit;
        }
    }
}
