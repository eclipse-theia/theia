// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { RPCProtocol } from '../../common/rpc-protocol';
import {
    MAIN_RPC_CONTEXT,
    EditorsAndDocumentsExt,
    EditorsAndDocumentsDelta,
    ModelAddedData,
    TextEditorAddData,
    EditorPosition
} from '../../common/plugin-api-rpc';
import { Disposable } from '@theia/core/lib/common/disposable';
import { EditorModelService } from './text-editor-model-service';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { TextEditorMain } from './text-editor-main';
import { DisposableCollection, Emitter } from '@theia/core';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';

export class EditorsAndDocumentsMain implements Disposable {

    private readonly proxy: EditorsAndDocumentsExt;

    private readonly stateComputer: EditorAndDocumentStateComputer;
    private readonly textEditors = new Map<string, TextEditorMain>();

    private readonly modelService: EditorModelService;
    private readonly editorService: EditorManager;

    private readonly onTextEditorAddEmitter = new Emitter<TextEditorMain[]>();
    private readonly onTextEditorRemoveEmitter = new Emitter<string[]>();
    private readonly onDocumentAddEmitter = new Emitter<MonacoEditorModel[]>();
    private readonly onDocumentRemoveEmitter = new Emitter<monaco.Uri[]>();

    readonly onTextEditorAdd = this.onTextEditorAddEmitter.event;
    readonly onTextEditorRemove = this.onTextEditorRemoveEmitter.event;
    readonly onDocumentAdd = this.onDocumentAddEmitter.event;
    readonly onDocumentRemove = this.onDocumentRemoveEmitter.event;

    private readonly toDispose = new DisposableCollection(
        Disposable.create(() => this.textEditors.clear())
    );

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.EDITORS_AND_DOCUMENTS_EXT);

        this.editorService = container.get(EditorManager);
        this.modelService = container.get(EditorModelService);

        this.stateComputer = new EditorAndDocumentStateComputer(d => this.onDelta(d), this.editorService, this.modelService);
        this.toDispose.push(this.stateComputer);
        this.toDispose.push(this.onTextEditorAddEmitter);
        this.toDispose.push(this.onTextEditorRemoveEmitter);
        this.toDispose.push(this.onDocumentAddEmitter);
        this.toDispose.push(this.onDocumentRemoveEmitter);
    }

    listen(): void {
        this.stateComputer.listen();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    private onDelta(delta: EditorAndDocumentStateDelta): void {
        const removedEditors = new Array<string>();
        const addedEditors = new Array<TextEditorMain>();

        const removedDocuments = delta.removedDocuments.map(d => d.textEditorModel.uri);

        for (const editor of delta.addedEditors) {
            const textEditorMain = new TextEditorMain(editor.id, editor.editor.getControl().getModel()!, editor.editor);
            this.textEditors.set(editor.id, textEditorMain);
            this.toDispose.push(textEditorMain);
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

    hideEditor(id: string): Promise<void> {
        for (const editorWidget of this.editorService.all) {
            const monacoEditor = MonacoEditor.get(editorWidget);
            if (monacoEditor) {
                if (id === new EditorSnapshot(monacoEditor).id) {
                    editorWidget.close();
                    break;
                }
            }
        }
        return Promise.resolve();
    }
}

class EditorAndDocumentStateComputer implements Disposable {
    private currentState: EditorAndDocumentState | undefined;
    private readonly editors = new Map<string, DisposableCollection>();
    private readonly toDispose = new DisposableCollection(
        Disposable.create(() => this.currentState = undefined)
    );

    constructor(
        private callback: (delta: EditorAndDocumentStateDelta) => void,
        private readonly editorService: EditorManager,
        private readonly modelService: EditorModelService
    ) { }

    listen(): void {
        if (this.toDispose.disposed) {
            return;
        }
        this.toDispose.push(this.editorService.onCreated(widget => {
            this.onTextEditorAdd(widget);
            this.update();
        }));
        this.toDispose.push(this.editorService.onCurrentEditorChanged(() => this.update()));
        this.toDispose.push(this.modelService.onModelAdded(this.onModelAdded, this));
        this.toDispose.push(this.modelService.onModelRemoved(() => this.update()));

        for (const widget of this.editorService.all) {
            this.onTextEditorAdd(widget);
        }
        this.update();
    }

    dispose(): void {
        this.toDispose.dispose();
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

    private onTextEditorAdd(widget: EditorWidget): void {
        const editor = MonacoEditor.get(widget);
        if (!editor) {
            return;
        }
        const id = editor.getControl().getId();
        const toDispose = new DisposableCollection(
            editor.onDispose(() => this.onTextEditorRemove(editor)),
            Disposable.create(() => this.editors.delete(id))
        );
        this.editors.set(id, toDispose);
        this.toDispose.push(toDispose);
    }

    private onTextEditorRemove(e: MonacoEditor): void {
        const toDispose = this.editors.get(e.getControl().getId());
        if (toDispose) {
            toDispose.dispose();
            this.update();
        }
    }

    private update(): void {
        const models = new Set<MonacoEditorModel>();
        for (const model of this.modelService.getModels()) {
            models.add(model);
        }

        let activeId: string | null = null;
        const activeEditor = MonacoEditor.getCurrent(this.editorService);

        const editors = new Map<string, EditorSnapshot>();
        for (const widget of this.editorService.all) {
            const editor = MonacoEditor.get(widget);
            // VS Code tracks only visible widgets
            if (!editor || !widget.isVisible) {
                continue;
            }
            const model = editor.getControl().getModel();
            if (model && !model.isDisposed()) {
                const editorSnapshot = new EditorSnapshot(editor);
                editors.set(editorSnapshot.id, editorSnapshot);
                if (activeEditor === editor) {
                    activeId = editorSnapshot.id;
                }
            }
        }

        const newState = new EditorAndDocumentState(models, editors, activeId);
        const delta = EditorAndDocumentState.compute(this.currentState, newState);
        if (!delta.isEmpty) {
            this.currentState = newState;
            this.callback(delta);
        }
    }

}

class EditorAndDocumentStateDelta {
    readonly isEmpty: boolean;

    constructor(
        readonly removedDocuments: MonacoEditorModel[],
        readonly addedDocuments: MonacoEditorModel[],
        readonly removedEditors: EditorSnapshot[],
        readonly addedEditors: EditorSnapshot[],
        readonly oldActiveEditor: string | null | undefined,
        readonly newActiveEditor: string | null | undefined
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
        readonly activeEditor: string | null | undefined) {
    }

    static compute(before: EditorAndDocumentState | undefined, after: EditorAndDocumentState): EditorAndDocumentStateDelta {
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
        this.id = `${editor.getControl().getId()},${editor.getControl().getModel()!.id}`;
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
