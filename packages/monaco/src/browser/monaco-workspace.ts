/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

/* eslint-disable no-null/no-null */

import { URI as Uri } from 'vscode-uri';
import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Emitter } from '@theia/core/lib/common/event';
import { FileSystemPreferences } from '@theia/filesystem/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { MonacoTextModelService } from './monaco-text-model-service';
import { WillSaveMonacoModelEvent, MonacoEditorModel, MonacoModelContentChangedEvent } from './monaco-editor-model';
import { MonacoEditor } from './monaco-editor';
import { ProblemManager } from '@theia/markers/lib/browser';
import { MaybePromise } from '@theia/core/lib/common/types';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileSystemProviderCapabilities } from '@theia/filesystem/lib/common/files';

export interface CreateResourceEdit extends monaco.languages.WorkspaceFileEdit {
    readonly newUri: monaco.Uri;
}

export namespace CreateResourceEdit {
    export function is(arg: Edit): arg is CreateResourceEdit {
        return 'newUri' in arg
            && monaco.Uri.isUri(arg.newUri)
            && (!('oldUri' in arg) || !monaco.Uri.isUri(arg.oldUri));
    }
}

export interface DeleteResourceEdit extends monaco.languages.WorkspaceFileEdit {
    readonly oldUri: monaco.Uri;
}
export namespace DeleteResourceEdit {
    export function is(arg: Edit): arg is DeleteResourceEdit {
        return 'oldUri' in arg
            && monaco.Uri.isUri(arg.oldUri)
            && (!('newUri' in arg) || !monaco.Uri.isUri(arg.newUri));
    }
}

export interface RenameResourceEdit extends monaco.languages.WorkspaceFileEdit {
    readonly newUri: monaco.Uri;
    readonly oldUri: monaco.Uri;
}
export namespace RenameResourceEdit {
    export function is(arg: Edit): arg is RenameResourceEdit {
        return 'oldUri' in arg
            && monaco.Uri.isUri(arg.oldUri)
            && 'newUri' in arg
            && monaco.Uri.isUri(arg.newUri);
    }
}

export namespace WorkspaceTextEdit {
    export function is(arg: Edit): arg is monaco.languages.WorkspaceTextEdit {
        return !!arg && typeof arg === 'object'
            && 'resource' in arg
            && monaco.Uri.isUri(arg.resource)
            && 'edit' in arg
            && arg.edit !== null
            && typeof arg.edit === 'object';
    }
    export function isVersioned(arg: monaco.languages.WorkspaceTextEdit): boolean {
        return is(arg) && typeof arg.modelVersionId === 'number';
    }
}

export interface EditsByEditor extends monaco.languages.WorkspaceTextEdit {
    readonly editor: MonacoEditor;
}
export namespace EditsByEditor {
    export function is(arg: Edit): arg is EditsByEditor {
        return WorkspaceTextEdit.is(arg)
            && 'editor' in arg
            && (arg as any).editor instanceof MonacoEditor; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
}

export type Edit = monaco.languages.WorkspaceFileEdit | monaco.languages.WorkspaceTextEdit;

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

    @inject(MonacoTextModelService)
    protected readonly textModelService: MonacoTextModelService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(ProblemManager)
    protected readonly problems: ProblemManager;

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
        if (this.suppressedOpenIfDirty.indexOf(model) !== -1) {
            return;
        }
        if (model.dirty && MonacoEditor.findByDocument(this.editorManager, model).length === 0) {
            // create a new reference to make sure the model is not disposed before it is
            // acquired by the editor, thus losing the changes that made it dirty.
            this.textModelService.createModelReference(model.textEditorModel.uri).then(ref => {
                (
                    model.autoSave === 'on' ? new Promise(resolve => model.onDidSaveModel(resolve)) :
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
    applyBackgroundEdit(model: MonacoEditorModel, editOperations: monaco.editor.IIdentifiedSingleEditOperation[]): Promise<void> {
        return this.suppressOpenIfDirty(model, async () => {
            const editor = MonacoEditor.findByDocument(this.editorManager, model)[0];
            const cursorState = editor && editor.getControl().getSelections() || [];
            model.textEditorModel.pushStackElement();
            model.textEditorModel.pushEditOperations(cursorState, editOperations, () => cursorState);
            model.textEditorModel.pushStackElement();
            if (!editor) {
                await model.save();
            }
        });
    }

    async applyBulkEdit(workspaceEdit: monaco.languages.WorkspaceEdit): Promise<monaco.editor.IBulkEditResult & { success: boolean }> {
        try {
            const edits = this.groupEdits(workspaceEdit);
            this.checkVersions(edits);
            let totalEdits = 0;
            let totalFiles = 0;
            for (const edit of edits) {
                if (WorkspaceTextEdit.is(edit)) {
                    let eol: monaco.editor.EndOfLineSequence | undefined;
                    const editOperations: monaco.editor.IIdentifiedSingleEditOperation[] = [];
                    const minimalEdits = await monaco.services.StaticServices.editorWorkerService.get().computeMoreMinimalEdits(edit.resource, [edit.edit]);
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
                        continue;
                    }
                    const reference = await this.textModelService.createModelReference(edit.resource);
                    try {
                        const model = reference.object.textEditorModel;
                        const editor = MonacoEditor.findByDocument(this.editorManager, reference.object)[0];
                        const cursorState = editor?.getControl().getSelections() || [];
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
                } else if (CreateResourceEdit.is(edit) || DeleteResourceEdit.is(edit) || RenameResourceEdit.is(edit)) {
                    await this.performResourceEdit(edit);
                } else {
                    throw new Error(`Unexpected edit type: ${JSON.stringify(edit)}`);
                }
            }
            const ariaSummary = this.getAriaSummary(totalEdits, totalFiles);
            return { ariaSummary, success: true };
        } catch (e) {
            console.error('Failed to apply workspace edits:', e);
            return {
                ariaSummary: `Error applying workspace edits: ${e.toString()}`,
                success: false
            };
        }
    }

    protected checkVersions(edits: Edit[]): void {
        for (const textEdit of edits.filter(WorkspaceTextEdit.is).filter(WorkspaceTextEdit.isVersioned)) {
            if (typeof textEdit.modelVersionId === 'number') {
                const model = this.textModelService.get(textEdit.resource.toString());
                if (model && model.textEditorModel.getVersionId() !== textEdit.modelVersionId) {
                    throw new Error(`${model.uri} has changed in the meantime`);
                }
            }
        }
    }

    protected getAriaSummary(totalEdits: number, totalFiles: number): string {
        if (totalEdits === 0) {
            return 'Made no edits';
        }
        if (totalEdits > 1 && totalFiles > 1) {
            return `Made ${totalEdits} text edits in ${totalFiles} files`;
        }
        return `Made ${totalEdits} text edits in one file`;
    }

    protected groupEdits(workspaceEdit: monaco.languages.WorkspaceEdit): Edit[] {
        const map = new Map<monaco.Uri, monaco.languages.WorkspaceTextEdit>();
        const result = [];
        for (const edit of workspaceEdit.edits) {
            if (WorkspaceTextEdit.is(edit)) {
                const resourceTextEdit = edit;
                const uri = resourceTextEdit.resource;
                const version = resourceTextEdit.modelVersionId;
                let editorEdit = map.get(uri);
                if (!editorEdit) {
                    editorEdit = {
                        resource: uri,
                        modelVersionId: version,
                        edit: resourceTextEdit.edit
                    };
                    map.set(uri, editorEdit);
                    result.push(editorEdit);
                } else {
                    if (editorEdit.modelVersionId !== version) {
                        throw Error(`Multiple versions for the same URI '${uri}' within the same workspace edit.`);
                    }
                }
            } else {
                const { options } = edit;
                const oldUri = !!edit.oldUri ? edit.oldUri : undefined;
                const newUri = !!edit.newUri ? edit.newUri : undefined;
                result.push({
                    oldUri,
                    newUri,
                    options
                });
            }
        }
        return result;
    }

    protected async performResourceEdit(edit: CreateResourceEdit | RenameResourceEdit | DeleteResourceEdit): Promise<void> {
        const options = edit.options || {};
        if (RenameResourceEdit.is(edit)) {
            // rename
            if (options.overwrite === undefined && options.ignoreIfExists && await this.fileService.exists(new URI(edit.newUri))) {
                return; // not overwriting, but ignoring, and the target file exists
            }
            await this.fileService.move(new URI(edit.oldUri), new URI(edit.newUri), { overwrite: options.overwrite });
        } else if (DeleteResourceEdit.is(edit)) {
            // delete file
            if (await this.fileService.exists(new URI(edit.oldUri))) {
                let useTrash = this.filePreferences['files.enableTrash'];
                if (useTrash && !(this.fileService.hasCapability(new URI(edit.oldUri), FileSystemProviderCapabilities.Trash))) {
                    useTrash = false; // not supported by provider
                }
                await this.fileService.delete(new URI(edit.oldUri), { useTrash, recursive: options.recursive });
            } else if (!options.ignoreIfNotExists) {
                throw new Error(`${edit.oldUri} does not exist and can not be deleted`);
            }
        } else if (CreateResourceEdit.is(edit)) {
            // create file
            if (options.overwrite === undefined && options.ignoreIfExists && await this.fileService.exists(new URI(edit.newUri))) {
                return; // not overwriting, but ignoring, and the target file exists
            }
            await this.fileService.create(new URI(edit.newUri), undefined, { overwrite: options.overwrite });
        }
    }
}
