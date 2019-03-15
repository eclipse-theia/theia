/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { interfaces } from 'inversify';
import { RPCProtocol } from '../../api/rpc-protocol';
import { TextEditorService } from './text-editor-service';
import { MAIN_RPC_CONTEXT, EditorsAndDocumentsExt, EditorsAndDocumentsDelta, ModelAddedData, TextEditorAddData, EditorPosition, PLUGIN_RPC_CONTEXT } from '../../api/plugin-api';
import { Disposable } from '@theia/core/lib/common/disposable';
import { EditorModelService } from './text-editor-model-service';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { TextEditorMain } from './text-editor-main';
import { Emitter, Event } from '@theia/core';
import { DisposableCollection } from '@theia/core';
import { DocumentsMainImpl } from './documents-main';
import { TextEditorsMainImpl } from './text-editors-main';
import { EditorManager } from '@theia/editor/lib/browser';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { MonacoBulkEditService } from '@theia/monaco/lib/browser/monaco-bulk-edit-service';

export class EditorsAndDocumentsMain {
    private toDispose = new DisposableCollection();
    private stateComputer: EditorAndDocumentStateComputer;
    private proxy: EditorsAndDocumentsExt;
    private textEditors = new Map<string, TextEditorMain>();

    private readonly modelService: EditorModelService;

    private onTextEditorAddEmitter = new Emitter<TextEditorMain[]>();
    private onTextEditorRemoveEmitter = new Emitter<string[]>();
    private onDocumentAddEmitter = new Emitter<MonacoEditorModel[]>();
    private onDocumentRemoveEmitter = new Emitter<monaco.Uri[]>();

    readonly onTextEditorAdd: Event<TextEditorMain[]> = this.onTextEditorAddEmitter.event;
    readonly onTextEditorRemove = this.onTextEditorRemoveEmitter.event;
    readonly onDocumentAdd = this.onDocumentAddEmitter.event;
    readonly onDocumentRemove = this.onDocumentRemoveEmitter.event;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.EDITORS_AND_DOCUMENTS_EXT);

        const editorService = container.get<TextEditorService>(TextEditorService);
        this.modelService = container.get<EditorModelService>(EditorModelService);
        const editorManager = container.get<EditorManager>(EditorManager);
        const openerService = container.get<OpenerService>(OpenerService);
        const bulkEditService = container.get<MonacoBulkEditService>(MonacoBulkEditService);

        const documentsMain = new DocumentsMainImpl(this, this.modelService, rpc, editorManager, openerService);
        rpc.set(PLUGIN_RPC_CONTEXT.DOCUMENTS_MAIN, documentsMain);

        const editorsMain = new TextEditorsMainImpl(this, rpc, bulkEditService);
        rpc.set(PLUGIN_RPC_CONTEXT.TEXT_EDITORS_MAIN, editorsMain);

        this.stateComputer = new EditorAndDocumentStateComputer(d => this.onDelta(d), editorService, this.modelService);
        this.toDispose.push(documentsMain);
        this.toDispose.push(editorsMain);
        this.toDispose.push(this.stateComputer);
        this.toDispose.push(this.onTextEditorAddEmitter);
        this.toDispose.push(this.onTextEditorRemoveEmitter);
        this.toDispose.push(this.onDocumentAddEmitter);
        this.toDispose.push(this.onDocumentRemoveEmitter);

    }

    private onDelta(delta: EditorAndDocumentStateDelta): void {
        const removedEditors = new Array<string>();
        const addedEditors = new Array<TextEditorMain>();

        const removedDocuments = delta.removedDocuments.map(d => d.textEditorModel.uri);

        for (const editor of delta.addedEditors) {
            const textEditorMain = new TextEditorMain(editor.id, editor.editor.getControl().getModel(), editor.editor);
            this.textEditors.set(editor.id, textEditorMain);
            addedEditors.push(textEditorMain);
        }

        for (const { id } of delta.removedEditors) {
            const textEditorMain = this.textEditors.get(id);
            if (textEditorMain) {
                textEditorMain.dispose();
                this.textEditors.delete(id);
                removedEditors.push(id);
            }
        }

        const deltaExt: EditorsAndDocumentsDelta = {};
        let empty = true;

        if (delta.newActiveEditor !== undefined) {
            empty = false;
            deltaExt.newActiveEditor = delta.newActiveEditor;
        }
        if (removedDocuments.length > 0) {
            empty = false;
            deltaExt.removedDocuments = removedDocuments;
        }
        if (removedEditors.length > 0) {
            empty = false;
            deltaExt.removedEditors = removedEditors;
        }
        if (delta.addedDocuments.length > 0) {
            empty = false;
            deltaExt.addedDocuments = delta.addedDocuments.map(d => this.toModelAddData(d));
        }
        if (delta.addedEditors.length > 0) {
            empty = false;
            deltaExt.addedEditors = addedEditors.map(e => this.toTextEditorAddData(e));
        }

        if (!empty) {
            this.proxy.$acceptEditorsAndDocumentsDelta(deltaExt);
            this.onDocumentRemoveEmitter.fire(removedDocuments);
            this.onDocumentAddEmitter.fire(delta.addedDocuments);
            this.onTextEditorRemoveEmitter.fire(removedEditors);
            this.onTextEditorAddEmitter.fire(addedEditors);
        }
    }

    private toModelAddData(model: MonacoEditorModel): ModelAddedData {
        return {
            uri: model.textEditorModel.uri,
            versionId: model.textEditorModel.getVersionId(),
            lines: model.textEditorModel.getLinesContent(),
            EOL: model.textEditorModel.getEOL(),
            modeId: model.languageId,
            isDirty: model.dirty
        };
    }

    private toTextEditorAddData(textEditor: TextEditorMain): TextEditorAddData {
        const properties = textEditor.getProperties();
        return {
            id: textEditor.getId(),
            documentUri: textEditor.getModel().uri,
            options: properties!.options,
            selections: properties!.selections,
            visibleRanges: properties!.visibleRanges,
            editorPosition: this.findEditorPosition(textEditor)
        };

    }

    private findEditorPosition(editor: TextEditorMain): EditorPosition | undefined {
        return EditorPosition.ONE; // TODO: fix this when Theia has support splitting editors
    }

    getEditor(id: string): TextEditorMain | undefined {
        return this.textEditors.get(id);
    }

    saveAll(includeUntitled?: boolean): Promise<boolean> {
        return this.modelService.saveAll(includeUntitled);
    }
}

class EditorAndDocumentStateComputer {
    private toDispose = new Array<Disposable>();
    private disposeOnEditorRemove = new Map<string, Disposable[]>();
    private currentState: EditorAndDocumentState;

    constructor(private callback: (delta: EditorAndDocumentStateDelta) => void, private editorService: TextEditorService, private modelService: EditorModelService) {
        editorService.onTextEditorAdd(e => {
            this.onTextEditorAdd(e);
        });
        editorService.onTextEditorRemove(e => {
            this.onTextEditorRemove(e);
        });
        modelService.onModelAdded(this.onModelAdded, this, this.toDispose);
        modelService.onModelRemoved(e => {
            this.update();
        });

        editorService.listTextEditors().forEach(e => this.onTextEditorAdd(e));
        this.update();
    }

    private onModelAdded(model: MonacoEditorModel): void {
        if (!this.currentState) {
            this.update();
            return;
        }
        this.currentState = new EditorAndDocumentState(
            this.currentState.documents.add(model),
            this.currentState.editors,
            this.currentState.activeEditor);

        this.callback(new EditorAndDocumentStateDelta(
            [],
            [model],
            [],
            [],
            undefined,
            undefined
        ));
    }

    private onTextEditorAdd(e: MonacoEditor): void {
        const disposables: Disposable[] = [];
        disposables.push(e.onFocusChanged(_ => this.update()));
        this.disposeOnEditorRemove.set(e.getControl().getId(), disposables);
        this.update();
    }

    private onTextEditorRemove(e: MonacoEditor): void {
        const dis = this.disposeOnEditorRemove.get(e.getControl().getId());
        if (dis) {
            this.disposeOnEditorRemove.delete(e.getControl().getId());
            dis.forEach(d => d.dispose());
            this.update();
        }
    }

    private update(): void {
        const models = new Set<MonacoEditorModel>();
        for (const model of this.modelService.getModels()) {
            models.add(model);
        }

        let activeEditor: string | undefined = undefined;

        const editors = new Map<string, EditorSnapshot>();
        for (const editor of this.editorService.listTextEditors()) {
            const model = editor.getControl().getModel();
            if (model && !model.isDisposed()) {
                const editorSnapshot = new EditorSnapshot(editor);
                editors.set(editorSnapshot.id, editorSnapshot);
                if (editor.isFocused()) {
                    activeEditor = editorSnapshot.id;
                }
            }
        }

        if (!activeEditor) {
            const managerEditor = this.editorService.getActiveEditor();
            if (managerEditor) {
                editors.forEach(snapshot => {
                    if (managerEditor.editor === snapshot.editor) {
                        activeEditor = snapshot.id;
                    }
                });
            }
        }

        const newState = new EditorAndDocumentState(models, editors, activeEditor);
        const delta = EditorAndDocumentState.compute(this.currentState, newState);
        if (!delta.isEmpty) {
            this.currentState = newState;
            this.callback(delta);
        }
    }

    dispose(): void {
        this.toDispose.forEach(element => {
            element.dispose();
        });
    }

}

class EditorAndDocumentStateDelta {
    readonly isEmpty: boolean;

    constructor(
        readonly removedDocuments: MonacoEditorModel[],
        readonly addedDocuments: MonacoEditorModel[],
        readonly removedEditors: EditorSnapshot[],
        readonly addedEditors: EditorSnapshot[],
        readonly oldActiveEditor: string | undefined,
        readonly newActiveEditor: string | undefined
    ) {
        this.isEmpty = this.removedDocuments.length === 0
            && this.addedDocuments.length === 0
            && this.addedEditors.length === 0
            && this.removedEditors.length === 0
            && this.newActiveEditor === this.oldActiveEditor;
    }
}

class EditorAndDocumentState {

    constructor(
        readonly documents: Set<MonacoEditorModel>,
        readonly editors: Map<string, EditorSnapshot>,
        readonly activeEditor: string | undefined) {
    }

    static compute(before: EditorAndDocumentState, after: EditorAndDocumentState): EditorAndDocumentStateDelta {
        if (!before) {
            return new EditorAndDocumentStateDelta(
                [],
                Array.from(after.documents),
                [],
                Array.from(after.editors.values()),
                undefined,
                after.activeEditor
            );
        }

        const documentDelta = Delta.ofSets(before.documents, after.documents);
        const editorDelta = Delta.ofMaps(before.editors, after.editors);
        const oldActiveEditor = before.activeEditor !== after.activeEditor ? before.activeEditor : undefined;
        const newActiveEditor = before.activeEditor !== after.activeEditor ? after.activeEditor : undefined;
        return new EditorAndDocumentStateDelta(
            documentDelta.removed,
            documentDelta.added,
            editorDelta.removed,
            editorDelta.added,
            oldActiveEditor,
            newActiveEditor
        );
    }
}

class EditorSnapshot {
    readonly id: string;
    constructor(readonly editor: MonacoEditor) {
        this.id = `${editor.getControl().getId()},${editor.getControl().getModel().id}`;
    }
}

namespace Delta {

    export function ofSets<T>(before: Set<T>, after: Set<T>): { removed: T[], added: T[] } {
        const removed: T[] = [];
        const added: T[] = [];
        before.forEach(element => {
            if (!after.has(element)) {
                removed.push(element);
            }
        });
        after.forEach(element => {
            if (!before.has(element)) {
                added.push(element);
            }
        });
        return { removed, added };
    }

    export function ofMaps<K, V>(before: Map<K, V>, after: Map<K, V>): { removed: V[], added: V[] } {
        const removed: V[] = [];
        const added: V[] = [];
        before.forEach((value, index) => {
            if (!after.has(index)) {
                removed.push(value);
            }
        });
        after.forEach((value, index) => {
            if (!before.has(index)) {
                added.push(value);
            }
        });
        return { removed, added };
    }
}
