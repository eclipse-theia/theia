// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableCollection } from '@theia/core';
import { interfaces } from '@theia/core/shared/inversify';
import { UriComponents } from '@theia/core/lib/common/uri';
import { NotebookEditorWidget, NotebookService, NotebookEditorWidgetService, NotebookCellEditorService } from '@theia/notebook/lib/browser';
import { NotebookModel } from '@theia/notebook/lib/browser/view-model/notebook-model';
import { MAIN_RPC_CONTEXT, NotebookDocumentsAndEditorsDelta, NotebookDocumentsAndEditorsMain, NotebookEditorAddData, NotebookModelAddedData, NotebooksExt } from '../../../common';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { NotebookDto } from './notebook-dto';
import { WidgetManager } from '@theia/core/lib/browser';
import { NotebookEditorsMainImpl } from './notebook-editors-main';
import { NotebookDocumentsMainImpl } from './notebook-documents-main';
import { diffMaps, diffSets } from '../../../common/collections';
import { Mutex } from 'async-mutex';

interface NotebookAndEditorDelta {
    removedDocuments: UriComponents[];
    addedDocuments: NotebookModel[];
    removedEditors: string[];
    addedEditors: NotebookEditorWidget[];
    newActiveEditor?: string | null;
    visibleEditors?: string[];
}

class NotebookAndEditorState {
    static computeDelta(before: NotebookAndEditorState | undefined, after: NotebookAndEditorState): NotebookAndEditorDelta {
        if (!before) {
            return {
                addedDocuments: [...after.documents],
                removedDocuments: [],
                addedEditors: [...after.textEditors.values()],
                removedEditors: [],
                visibleEditors: [...after.visibleEditors].map(editor => editor[0])
            };
        }
        const documentDelta = diffSets(before.documents, after.documents);
        const editorDelta = diffMaps(before.textEditors, after.textEditors);

        const visibleEditorDelta = diffMaps(before.visibleEditors, after.visibleEditors);

        return {
            addedDocuments: documentDelta.added,
            removedDocuments: documentDelta.removed.map(e => e.uri.toComponents()),
            addedEditors: editorDelta.added,
            removedEditors: editorDelta.removed.map(removed => removed.id),
            newActiveEditor: after.activeEditor,
            visibleEditors: visibleEditorDelta.added.length === 0 && visibleEditorDelta.removed.length === 0
                ? undefined
                : [...after.visibleEditors].map(editor => editor[0])
        };
    }

    constructor(
        readonly documents: Set<NotebookModel>,
        readonly textEditors: Map<string, NotebookEditorWidget>,
        readonly activeEditor: string | null | undefined,
        readonly visibleEditors: Map<string, NotebookEditorWidget>
    ) {
        //
    }
}

export class NotebooksAndEditorsMain implements NotebookDocumentsAndEditorsMain {

    protected readonly proxy: NotebooksExt;
    protected readonly disposables = new DisposableCollection();

    protected readonly editorListeners = new Map<string, Disposable[]>();

    protected currentState?: NotebookAndEditorState;
    protected readonly updateMutex = new Mutex();

    protected readonly notebookService: NotebookService;
    protected readonly notebookEditorService: NotebookEditorWidgetService;
    protected readonly WidgetManager: WidgetManager;

    constructor(
        rpc: RPCProtocol,
        container: interfaces.Container,
        protected readonly notebookDocumentsMain: NotebookDocumentsMainImpl,
        protected readonly notebookEditorsMain: NotebookEditorsMainImpl
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.NOTEBOOKS_EXT);

        this.notebookService = container.get(NotebookService);
        this.notebookEditorService = container.get(NotebookEditorWidgetService);
        this.WidgetManager = container.get(WidgetManager);
        const notebookCellEditorService = container.get(NotebookCellEditorService);

        notebookCellEditorService.onDidChangeFocusedCellEditor(editor => this.proxy.$acceptActiveCellEditorChange(editor?.uri.toString() ?? null), this, this.disposables);

        this.notebookService.onDidAddNotebookDocument(async () => this.updateState(), this, this.disposables);
        this.notebookService.onDidRemoveNotebookDocument(async () => this.updateState(), this, this.disposables);
        // this.WidgetManager.onActiveEditorChanged(() => this.updateState(), this, this.disposables);
        this.notebookEditorService.onDidAddNotebookEditor(async editor => this.handleEditorAdd(editor), this, this.disposables);
        this.notebookEditorService.onDidRemoveNotebookEditor(async editor => this.handleEditorRemove(editor), this, this.disposables);
        this.notebookEditorService.onDidChangeCurrentEditor(async editor => this.updateState(editor), this, this.disposables);
    }

    dispose(): void {
        this.notebookDocumentsMain.dispose();
        this.notebookEditorsMain.dispose();
        this.disposables.dispose();
        this.editorListeners.forEach(listeners => listeners.forEach(listener => listener.dispose()));
    }

    private async handleEditorAdd(editor: NotebookEditorWidget): Promise<void> {
        const listeners = this.editorListeners.get(editor.id);
        const disposable = editor.onDidChangeModel(() => this.updateState());
        if (listeners) {
            listeners.push(disposable);
        } else {
            this.editorListeners.set(editor.id, [disposable]);
        }
        await this.updateState();
    }

    private handleEditorRemove(editor: NotebookEditorWidget): void {
        const listeners = this.editorListeners.get(editor.id);
        listeners?.forEach(listener => listener.dispose());
        this.editorListeners.delete(editor.id);
        this.updateState();
    }

    private async updateState(focusedEditor?: NotebookEditorWidget): Promise<void> {
        await this.updateMutex.runExclusive(async () => this.doUpdateState(focusedEditor));
    }

    private async doUpdateState(focusedEditor?: NotebookEditorWidget): Promise<void> {

        const editors = new Map<string, NotebookEditorWidget>();
        const visibleEditorsMap = new Map<string, NotebookEditorWidget>();

        for (const editor of this.notebookEditorService.getNotebookEditors()) {
            editors.set(editor.id, editor);
        }

        const activeNotebookEditor = this.notebookEditorService.focusedEditor;
        let activeEditor: string | null = null;
        if (activeNotebookEditor) {
            activeEditor = activeNotebookEditor.id;
        } else if (focusedEditor?.model) {
            activeEditor = focusedEditor.id;
        }
        if (activeEditor && !editors.has(activeEditor)) {
            activeEditor = null;
        }

        const notebookEditors = this.WidgetManager.getWidgets(NotebookEditorWidget.ID) as NotebookEditorWidget[];
        for (const notebookEditor of notebookEditors) {
            if (editors.has(notebookEditor.id) && notebookEditor.isVisible) {
                visibleEditorsMap.set(notebookEditor.id, notebookEditor);
            }
        }

        const newState = new NotebookAndEditorState(
            new Set(this.notebookService.listNotebookDocuments()),
            editors,
            activeEditor, visibleEditorsMap);
        await this.onDelta(NotebookAndEditorState.computeDelta(this.currentState, newState));
        this.currentState = newState;
    }

    private async onDelta(delta: NotebookAndEditorDelta): Promise<void> {
        if (NotebooksAndEditorsMain.isDeltaEmpty(delta)) {
            return;
        }

        const dto: NotebookDocumentsAndEditorsDelta = {
            removedDocuments: delta.removedDocuments,
            removedEditors: delta.removedEditors,
            newActiveEditor: delta.newActiveEditor,
            visibleEditors: delta.visibleEditors,
            addedDocuments: delta.addedDocuments.map(NotebooksAndEditorsMain.asModelAddData),
            addedEditors: delta.addedEditors.map(NotebooksAndEditorsMain.asEditorAddData),
        };

        // Handle internally first
        // In case the plugin wants to perform documents edits immediately
        // we want to make sure that all events have already been setup
        this.notebookEditorsMain.handleEditorsRemoved(delta.removedEditors);
        this.notebookDocumentsMain.handleNotebooksRemoved(delta.removedDocuments);
        this.notebookDocumentsMain.handleNotebooksAdded(delta.addedDocuments);
        this.notebookEditorsMain.handleEditorsAdded(delta.addedEditors);

        // Send to plugin last
        await this.proxy.$acceptDocumentsAndEditorsDelta(dto);
    }

    private static isDeltaEmpty(delta: NotebookAndEditorDelta): boolean {
        if (delta.addedDocuments?.length) {
            return false;
        }
        if (delta.removedDocuments?.length) {
            return false;
        }
        if (delta.addedEditors?.length) {
            return false;
        }
        if (delta.removedEditors?.length) {
            return false;
        }
        if (delta.visibleEditors?.length) {
            return false;
        }
        if (delta.newActiveEditor !== undefined) {
            return false;
        }
        return true;
    }

    private static asModelAddData(e: NotebookModel): NotebookModelAddedData {
        return {
            viewType: e.viewType,
            uri: e.uri.toComponents(),
            metadata: e.metadata,
            versionId: 1, // TODO implement versionID support
            cells: e.cells.map(NotebookDto.toNotebookCellDto)
        };
    }

    private static asEditorAddData(notebookEditor: NotebookEditorWidget): NotebookEditorAddData {
        const uri = notebookEditor.getResourceUri();
        if (!uri) {
            throw new Error('Notebook editor without resource URI');
        }
        return {
            id: notebookEditor.id,
            documentUri: uri.toComponents(),
            selections: [{ start: 0, end: 0 }],
            visibleRanges: []
        };
    }
}
