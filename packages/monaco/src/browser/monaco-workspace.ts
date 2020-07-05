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
import { FileSystem } from '@theia/filesystem/lib/common';
import { EditorManager, EditorOpenerOptions } from '@theia/editor/lib/browser';
import { MonacoTextModelService } from './monaco-text-model-service';
import { WillSaveMonacoModelEvent, MonacoEditorModel, MonacoModelContentChangedEvent } from './monaco-editor-model';
import { MonacoEditor } from './monaco-editor';
import { ProblemManager } from '@theia/markers/lib/browser';
import { MaybePromise } from '@theia/core/lib/common/types';

// Note: `newUri` and `oldUri` are both optional although it is mandatory in `monaco.languages.ResourceFileEdit`.
// See: https://github.com/microsoft/monaco-editor/issues/1396
export interface ResourceEdit {
    readonly newUri?: string;
    readonly oldUri?: string;
    readonly options?: {
        readonly overwrite?: boolean;
        readonly ignoreIfNotExists?: boolean;
        readonly ignoreIfExists?: boolean;
        readonly recursive?: boolean;
    }
}

export interface CreateResourceEdit extends ResourceEdit {
    readonly newUri: string;
}
export namespace CreateResourceEdit {
    export function is(arg: Edit): arg is CreateResourceEdit {
        return 'newUri' in arg
            && typeof (arg as any).newUri === 'string' // eslint-disable-line @typescript-eslint/no-explicit-any
            && (!('oldUri' in arg) || typeof (arg as any).oldUri === 'undefined'); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
}

export interface DeleteResourceEdit extends ResourceEdit {
    readonly oldUri: string;
}
export namespace DeleteResourceEdit {
    export function is(arg: Edit): arg is DeleteResourceEdit {
        return 'oldUri' in arg
            && typeof (arg as any).oldUri === 'string' // eslint-disable-line @typescript-eslint/no-explicit-any
            && (!('newUri' in arg) || typeof (arg as any).newUri === 'undefined'); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
}

export interface RenameResourceEdit extends ResourceEdit {
    readonly newUri: string;
    readonly oldUri: string;
}
export namespace RenameResourceEdit {
    export function is(arg: Edit): arg is RenameResourceEdit {
        return 'oldUri' in arg
            && typeof (arg as any).oldUri === 'string' // eslint-disable-line @typescript-eslint/no-explicit-any
            && 'newUri' in arg
            && typeof (arg as any).newUri === 'string'; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
}

export interface TextEdits {
    readonly uri: string
    readonly version: number | undefined
    readonly textEdits: monaco.languages.TextEdit[]
}
export namespace TextEdits {
    export function is(arg: Edit): arg is TextEdits {
        return 'uri' in arg
            && typeof (arg as any).uri === 'string'; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    export function isVersioned(arg: TextEdits): boolean {
        return is(arg) && arg.version !== undefined;
    }
}

export interface EditsByEditor extends TextEdits {
    readonly editor: MonacoEditor;
}
export namespace EditsByEditor {
    export function is(arg: Edit): arg is EditsByEditor {
        return TextEdits.is(arg)
            && 'editor' in arg
            && (arg as any).editor instanceof MonacoEditor; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
}

export type Edit = TextEdits | ResourceEdit;

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

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

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
                this.editorManager.open(new URI(model.uri), {
                    mode: 'open',
                }).then(editor => ref.dispose());
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

    async applyBulkEdit(workspaceEdit: monaco.languages.WorkspaceEdit, options?: EditorOpenerOptions): Promise<monaco.editor.IBulkEditResult> {
        try {
            const unresolvedEdits = this.groupEdits(workspaceEdit);
            const edits = await this.openEditors(unresolvedEdits, options);
            this.checkVersions(edits);
            let totalEdits = 0;
            let totalFiles = 0;
            for (const edit of edits) {
                if (TextEdits.is(edit)) {
                    const { editor } = (await this.toTextEditWithEditor(edit));
                    const model = editor.document.textEditorModel;
                    const currentSelections = editor.getControl().getSelections() || [];
                    const editOperations: monaco.editor.IIdentifiedSingleEditOperation[] = edit.textEdits.map(e => ({
                        identifier: undefined,
                        forceMoveMarkers: false,
                        range: new monaco.Range(e.range.startLineNumber, e.range.startColumn, e.range.endLineNumber, e.range.endColumn),
                        text: e.text
                    }));
                    // start a fresh operation
                    model.pushStackElement();
                    model.pushEditOperations(currentSelections, editOperations, (_: monaco.editor.IIdentifiedSingleEditOperation[]) => currentSelections);
                    // push again to make this change an undoable operation
                    model.pushStackElement();
                    totalFiles += 1;
                    totalEdits += editOperations.length;
                } else if (CreateResourceEdit.is(edit) || DeleteResourceEdit.is(edit) || RenameResourceEdit.is(edit)) {
                    await this.performResourceEdit(edit);
                } else {
                    throw new Error(`Unexpected edit type: ${JSON.stringify(edit)}`);
                }
            }
            const ariaSummary = this.getAriaSummary(totalEdits, totalFiles);
            return { ariaSummary };
        } catch (e) {
            const ariaSummary = `Error applying workspace edits: ${e.toString()}`;
            console.error(ariaSummary);
            return { ariaSummary };
        }
    }

    protected async openEditors(edits: Edit[], options?: EditorOpenerOptions): Promise<Edit[]> {
        const result = [];
        for (const edit of edits) {
            if (TextEdits.is(edit) && TextEdits.isVersioned(edit) && !EditsByEditor.is(edit)) {
                result.push(await this.toTextEditWithEditor(edit, options));
            } else {
                result.push(edit);
            }
        }
        return result;
    }

    protected async toTextEditWithEditor(textEdit: TextEdits, options?: EditorOpenerOptions): Promise<EditsByEditor> {
        if (EditsByEditor.is(textEdit)) {
            return textEdit;
        }
        const editorWidget = await this.editorManager.open(new URI(textEdit.uri), options);
        const editor = MonacoEditor.get(editorWidget);
        if (!editor) {
            throw Error(`Could not open editor. URI: ${textEdit.uri}`);
        }
        const textEditWithEditor = { ...textEdit, editor };
        return textEditWithEditor;
    }

    protected checkVersions(edits: Edit[]): void {
        for (const textEdit of edits.filter(TextEdits.is).filter(TextEdits.isVersioned)) {
            if (!EditsByEditor.is(textEdit)) {
                throw Error(`Could not open editor for URI: ${textEdit.uri}.`);
            }
            const model = textEdit.editor.document.textEditorModel;
            if (textEdit.version !== undefined && model.getVersionId() !== textEdit.version) {
                throw Error(`Version conflict in editor. URI: ${textEdit.uri}`);
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
        const map = new Map<string, TextEdits>();
        const result = [];
        for (const edit of workspaceEdit.edits) {
            if (this.isResourceFileEdit(edit)) {
                const resourceTextEdit = edit;
                const uri = resourceTextEdit.resource.toString();
                const version = resourceTextEdit.modelVersionId;
                let editorEdit = map.get(uri);
                if (!editorEdit) {
                    editorEdit = {
                        uri,
                        version,
                        textEdits: []
                    };
                    map.set(uri, editorEdit);
                    result.push(editorEdit);
                } else {
                    if (editorEdit.version !== version) {
                        throw Error(`Multiple versions for the same URI '${uri}' within the same workspace edit.`);
                    }
                }
                editorEdit.textEdits.push(...resourceTextEdit.edits);
            } else {
                const { options } = edit;
                const oldUri = !!edit.oldUri ? edit.oldUri.toString() : undefined;
                const newUri = !!edit.newUri ? edit.newUri.toString() : undefined;
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
            if (options.overwrite === undefined && options.ignoreIfExists && await this.fileSystem.exists(edit.newUri)) {
                return; // not overwriting, but ignoring, and the target file exists
            }
            await this.fileSystem.move(edit.oldUri, edit.newUri, { overwrite: options.overwrite });
        } else if (DeleteResourceEdit.is(edit)) {
            // delete file
            if (!options.ignoreIfNotExists || await this.fileSystem.exists(edit.oldUri)) {
                if (options.recursive === false) {
                    console.warn("Ignored 'recursive': 'false' option. Deleting recursively.");
                }
                await this.fileSystem.delete(edit.oldUri);
            }
        } else if (CreateResourceEdit.is(edit)) {
            const exists = await this.fileSystem.exists(edit.newUri);
            // create file
            if (options.overwrite === undefined && options.ignoreIfExists && exists) {
                return; // not overwriting, but ignoring, and the target file exists
            }
            if (exists && options.overwrite) {
                const stat = await this.fileSystem.getFileStat(edit.newUri);
                if (!stat) {
                    throw new Error(`Cannot get file stat for the resource: ${edit.newUri}.`);
                }
                await this.fileSystem.setContent(stat, '');
            } else {
                await this.fileSystem.createFile(edit.newUri);
            }
        }
    }

    protected isResourceFileEdit(edit: monaco.languages.ResourceFileEdit | monaco.languages.ResourceTextEdit): edit is monaco.languages.ResourceTextEdit {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return 'resource' in edit && (edit as any).resource instanceof monaco.Uri;
    }

}
