// *****************************************************************************
// Copyright (C) 2023 Red Hat, Inc. and others.
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

import { Disposable, URI } from '@theia/core';
import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';
import { Saveable, SaveOptions } from '@theia/core/lib/browser';
import { Cell, CellUri, NotebookCellsChangeType, NotebookCellTextModelSplice, NotebookData, NotebookModelWillAddRemoveEvent } from '../../common';
import { NotebookSerializer } from '../service/notebook-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { NotebookCellModel } from './notebook-cell-model';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';

export class NotebookModel implements Saveable, Disposable {

    private readonly dirtyChangedEmitter = new Emitter<void>();
    readonly onDirtyChanged = this.dirtyChangedEmitter.event;

    private readonly saveEmitter = new Emitter<void>();
    readonly onDidSaveNotebook = this.saveEmitter.event;

    private readonly didAddRemoveCellEmitter = new Emitter<NotebookModelWillAddRemoveEvent>();
    readonly onDidAddOrRemoveCell = this.didAddRemoveCellEmitter.event;

    readonly autoSave: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';

    dirty: boolean;
    selectedCell?: NotebookCellModel;
    private dirtyCells: NotebookCellModel[] = [];

    cells: NotebookCellModel[];

    constructor(public data: NotebookData,
        public uri: URI,
        public viewType: string,
        private serializer: NotebookSerializer,
        private fileService: FileService,
        modelService: MonacoTextModelService) {
        this.dirty = false;

        this.cells = data.cells.map((cell, index) => new NotebookCellModel(CellUri.generate(uri, index),
            index,
            cell.source,
            cell.language,
            cell.cellKind,
            cell.outputs,
            cell.metadata,
            cell.internalMetadata,
            cell.collapseState));

        modelService.onDidCreate(editorModel => {
            const modelUri = new URI(editorModel.uri);
            if (modelUri.scheme === CellUri.scheme) {
                const cellUri = CellUri.parse(modelUri);
                if (cellUri && cellUri.notebook.isEqual(this.uri)) {
                    const cell = this.cells.find(c => c.handle === cellUri.handle);
                    if (cell) {
                        cell.textModel = editorModel;
                    }
                }
            }
        });
    }

    dispose(): void {
        this.dirtyChangedEmitter.dispose();
        this.saveEmitter.dispose();
        this.didAddRemoveCellEmitter.dispose();
    }

    async save(options: SaveOptions): Promise<void> {
        this.dirtyCells = [];

        const serializedNotebook = await this.serializer.notebookToData(this.data);
        this.fileService.writeFile(this.uri, serializedNotebook);

        this.saveEmitter.fire();
    }

    isDirty(): boolean {
        return this.dirty;
    }

    cellDirtyChanged(cell: NotebookCellModel, dirtyState: boolean): void {
        if (dirtyState) {
            this.dirtyCells.push(cell);
        } else {
            this.dirtyCells.splice(this.dirtyCells.indexOf(cell), 1);
        }

        const oldDirtyState = this.dirty;
        this.dirty = this.dirtyCells.length > 0;
        if (this.dirty !== oldDirtyState) {
            this.dirtyChangedEmitter.fire();
        }
    }

    setSelectedCell(cell: NotebookCellModel): void {
        this.selectedCell = cell;
    }

    insertNewCell(index: number, cells: NotebookCellModel[]): void {
        const changes: NotebookCellTextModelSplice<Cell>[] = [[index, 0, cells]];
        this.cells.splice(index, 0, ...cells);
        this.didAddRemoveCellEmitter.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes } });
        return;
    }

    removeCell(index: number, count: number): void {
        const changes: NotebookCellTextModelSplice<Cell>[] = [[index, count, []]];
        this.cells.splice(index, count);
        this.didAddRemoveCellEmitter.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes } });
    }
}
