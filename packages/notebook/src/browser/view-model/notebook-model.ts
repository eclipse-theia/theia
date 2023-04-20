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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, URI } from '@theia/core';
import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';
import { Saveable, SaveOptions } from '@theia/core/lib/browser';
import { Cell, CellUri, NotebookCellsChangeType, NotebookCellTextModelSplice, NotebookData, NotebookModelWillAddRemoveEvent } from '../../common';
import { NotebookSerializer } from '../service/notebook-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { NotebookCellModel, NotebookCellModelFactory, NotebookCellModelProps } from './notebook-cell-model';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';

export const NotebookModelFactory = Symbol('NotebookModelFactory');

export function createNotebookModelContainer(parent: interfaces.Container, props: NotebookModelProps): interfaces.Container {
    const child = parent.createChild();

    child.bind(NotebookModelProps).toConstantValue(props);
    child.bind(NotebookModel).toSelf();

    return child;
}

const NotebookModelProps = Symbol('NotebookModelProps');
export interface NotebookModelProps {
    data: NotebookData,
    uri: URI,
    viewType: string,
    serializer: NotebookSerializer,
}

@injectable()
export class NotebookModel implements Saveable, Disposable {

    private readonly dirtyChangedEmitter = new Emitter<void>();
    readonly onDirtyChanged = this.dirtyChangedEmitter.event;

    private readonly saveEmitter = new Emitter<void>();
    readonly onDidSaveNotebook = this.saveEmitter.event;

    private readonly didAddRemoveCellEmitter = new Emitter<NotebookModelWillAddRemoveEvent>();
    readonly onDidAddOrRemoveCell = this.didAddRemoveCellEmitter.event;

    @inject(FileService)
    private readonly fileService: FileService;

    readonly autoSave: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';

    dirty: boolean;
    selectedCell?: NotebookCellModel;
    private dirtyCells: NotebookCellModel[] = [];

    cells: NotebookCellModel[];

    get data(): NotebookData {
        return this.props.data;
    }

    get uri(): URI {
        return this.props.uri;
    }

    get viewType(): string {
        return this.props.viewType;
    }

    constructor(@inject(NotebookModelProps) private props: NotebookModelProps,
        @inject(MonacoTextModelService) modelService: MonacoTextModelService,
        @inject(NotebookCellModelFactory) cellModelFactory: (props: NotebookCellModelProps) => NotebookCellModel) {
        this.dirty = false;

        this.cells = props.data.cells.map((cell, index) => cellModelFactory({
            uri: CellUri.generate(props.uri, index),
            handle: index,
            source: cell.source,
            language: cell.language,
            cellKind: cell.cellKind,
            outputs: cell.outputs,
            metadata: cell.metadata,
            internalMetadata: cell.internalMetadata,
            collapseState: cell.collapseState
        }));

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
        this.dirty = false;
        this.dirtyChangedEmitter.fire();

        const serializedNotebook = await this.props.serializer.notebookToData({
            cells: this.cells.map(cell => cell.toDto()),
            metadata: this.data.metadata
        });
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
