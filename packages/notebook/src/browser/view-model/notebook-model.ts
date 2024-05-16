// *****************************************************************************
// Copyright (C) 2023 Typefox and others.
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

import { Disposable, Emitter, Event, QueueableEmitter, Resource, URI } from '@theia/core';
import { Saveable, SaveOptions } from '@theia/core/lib/browser';
import {
    CellData, CellEditType, CellUri, NotebookCellInternalMetadata,
    NotebookCellMetadata,
    NotebookCellsChangeType, NotebookCellTextModelSplice, NotebookData,
    NotebookDocumentMetadata,
} from '../../common';
import {
    NotebookContentChangedEvent, NotebookModelWillAddRemoveEvent,
    CellEditOperation, NullablePartialNotebookCellInternalMetadata,
    NullablePartialNotebookCellMetadata
} from '../notebook-types';
import { NotebookSerializer } from '../service/notebook-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { NotebookCellModel, NotebookCellModelFactory } from './notebook-cell-model';
import { inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import { UndoRedoService } from '@theia/editor/lib/browser/undo-redo-service';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';

export const NotebookModelFactory = Symbol('NotebookModelFactory');

export function createNotebookModelContainer(parent: interfaces.Container, props: NotebookModelProps): interfaces.Container {
    const child = parent.createChild();

    child.bind(NotebookModelProps).toConstantValue(props);
    child.bind(NotebookModel).toSelf();

    return child;
}

const NotebookModelProps = Symbol('NotebookModelProps');
export interface NotebookModelProps {
    data: NotebookData;
    resource: Resource;
    viewType: string;
    serializer: NotebookSerializer;
}

@injectable()
export class NotebookModel implements Saveable, Disposable {

    protected readonly onDirtyChangedEmitter = new Emitter<void>();
    readonly onDirtyChanged = this.onDirtyChangedEmitter.event;

    protected readonly onDidSaveNotebookEmitter = new Emitter<void>();
    readonly onDidSaveNotebook = this.onDidSaveNotebookEmitter.event;

    protected readonly onDidAddOrRemoveCellEmitter = new Emitter<NotebookModelWillAddRemoveEvent>();
    readonly onDidAddOrRemoveCell = this.onDidAddOrRemoveCellEmitter.event;

    protected readonly onDidChangeContentEmitter = new QueueableEmitter<NotebookContentChangedEvent>();
    readonly onDidChangeContent = this.onDidChangeContentEmitter.event;

    protected readonly onDidChangeSelectedCellEmitter = new Emitter<NotebookCellModel | undefined>();
    readonly onDidChangeSelectedCell = this.onDidChangeSelectedCellEmitter.event;

    protected readonly onDidDisposeEmitter = new Emitter<void>();
    readonly onDidDispose = this.onDidDisposeEmitter.event;

    get onDidChangeReadOnly(): Event<boolean | MarkdownString> {
        return this.props.resource.onDidChangeReadOnly ?? Event.None;
    }

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(UndoRedoService)
    protected readonly undoRedoService: UndoRedoService;

    @inject(NotebookModelProps)
    protected props: NotebookModelProps;

    @inject(NotebookCellModelFactory)
    protected cellModelFactory: NotebookCellModelFactory;
    readonly autoSave: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';

    protected nextHandle: number = 0;

    protected _dirty = false;

    set dirty(dirty: boolean) {
        this._dirty = dirty;
        this.onDirtyChangedEmitter.fire();
    }

    get dirty(): boolean {
        return this._dirty;
    }

    get readOnly(): boolean | MarkdownString {
        return this.props.resource.readOnly ?? false;
    }

    selectedCell?: NotebookCellModel;
    protected dirtyCells: NotebookCellModel[] = [];

    cells: NotebookCellModel[];

    get uri(): URI {
        return this.props.resource.uri;
    }

    get viewType(): string {
        return this.props.viewType;
    }

    metadata: NotebookDocumentMetadata = {};

    @postConstruct()
    initialize(): void {
        this.dirty = false;

        this.cells = this.props.data.cells.map((cell, index) => this.cellModelFactory({
            uri: CellUri.generate(this.props.resource.uri, index),
            handle: index,
            source: cell.source,
            language: cell.language,
            cellKind: cell.cellKind,
            outputs: cell.outputs,
            metadata: cell.metadata,
            internalMetadata: cell.internalMetadata,
            collapseState: cell.collapseState
        }));

        this.addCellOutputListeners(this.cells);

        this.metadata = this.props.data.metadata;

        this.nextHandle = this.cells.length;
    }

    dispose(): void {
        this.onDirtyChangedEmitter.dispose();
        this.onDidSaveNotebookEmitter.dispose();
        this.onDidAddOrRemoveCellEmitter.dispose();
        this.onDidChangeContentEmitter.dispose();
        this.onDidChangeSelectedCellEmitter.dispose();
        this.cells.forEach(cell => cell.dispose());
        this.onDidDisposeEmitter.fire();
    }

    async save(options?: SaveOptions): Promise<void> {
        this.dirtyCells = [];
        this.dirty = false;

        const serializedNotebook = await this.props.serializer.fromNotebook({
            cells: this.cells.map(cell => cell.getData()),
            metadata: this.metadata
        });
        this.fileService.writeFile(this.uri, serializedNotebook);

        this.onDidSaveNotebookEmitter.fire();
    }

    createSnapshot(): Saveable.Snapshot {
        const model = this;
        return {
            read(): string {
                return JSON.stringify({
                    cells: model.cells.map(cell => cell.getData()),
                    metadata: model.metadata
                });
            }
        };
    }

    async applySnapshot(snapshot: Saveable.Snapshot): Promise<void> {
        const rawData = 'read' in snapshot ? snapshot.read() : snapshot.value;
        if (!rawData) {
            throw new Error('could not read notebook snapshot');
        }
        const data = JSON.parse(rawData) as NotebookData;
        this.setData(data);
    }

    async revert(options?: Saveable.RevertOptions): Promise<void> {
        this.dirty = false;
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

        const oldDirtyState = this._dirty;
        this._dirty = this.dirtyCells.length > 0;
        if (this.dirty !== oldDirtyState) {
            this.onDirtyChangedEmitter.fire();
        }
    }

    setData(data: NotebookData): void {
        // Replace all cells in the model
        this.replaceCells(0, this.cells.length, data.cells, false);
        this.metadata = data.metadata;
        this.dirty = false;
        this.onDidChangeContentEmitter.fire();
    }

    undo(): void {
        // TODO we probably need to check if a monaco editor is focused and if so, not undo
        this.undoRedoService.undo(this.uri);
    }

    redo(): void {
        // TODO see undo
        this.undoRedoService.redo(this.uri);
    }

    setSelectedCell(cell: NotebookCellModel): void {
        if (this.selectedCell !== cell) {
            this.selectedCell = cell;
            this.onDidChangeSelectedCellEmitter.fire(cell);
        }
    }

    private addCellOutputListeners(cells: NotebookCellModel[]): void {
        for (const cell of cells) {
            cell.onDidChangeOutputs(() => {
                this.dirty = true;
            });
        }
    }

    applyEdits(rawEdits: CellEditOperation[], computeUndoRedo: boolean): void {
        const editsWithDetails = rawEdits.map((edit, index) => {
            let cellIndex: number = -1;
            if ('index' in edit) {
                cellIndex = edit.index;
            } else if ('handle' in edit) {
                cellIndex = this.getCellIndexByHandle(edit.handle);
            } else if ('outputId' in edit) {
                cellIndex = this.cells.findIndex(cell => cell.outputs.some(output => output.outputId === edit.outputId));
            }

            return {
                edit,
                cellIndex,
                end: edit.editType === CellEditType.Replace ? edit.index + edit.count : cellIndex,
                originalIndex: index
            };
        }).filter(edit => !!edit);

        for (const { edit, cellIndex } of editsWithDetails) {
            const cell = this.cells[cellIndex];
            if (cell) {
                this.cellDirtyChanged(cell, true);
            }
            switch (edit.editType) {
                case CellEditType.Replace:
                    this.replaceCells(edit.index, edit.count, edit.cells, computeUndoRedo);
                    break;
                case CellEditType.Output: {
                    if (edit.append) {
                        cell.spliceNotebookCellOutputs({ deleteCount: 0, newOutputs: edit.outputs, start: cell.outputs.length });
                    } else {
                        // could definitely be more efficient. See vscode __spliceNotebookCellOutputs2
                        // For now, just replace the whole existing output with the new output
                        cell.spliceNotebookCellOutputs({ start: 0, deleteCount: edit.deleteCount ?? cell.outputs.length, newOutputs: edit.outputs });
                    }
                    this.onDidChangeContentEmitter.queue({ kind: NotebookCellsChangeType.Output, index: cellIndex, outputs: cell.outputs, append: edit.append ?? false });
                    break;
                }
                case CellEditType.OutputItems:
                    cell.changeOutputItems(edit.outputId, !!edit.append, edit.items);
                    this.onDidChangeContentEmitter.queue({
                        kind: NotebookCellsChangeType.OutputItem, index: cellIndex, outputItems: edit.items,
                        outputId: edit.outputId, append: edit.append ?? false
                    });

                    break;
                case CellEditType.Metadata:
                    this.changeCellMetadata(this.cells[cellIndex], edit.metadata, computeUndoRedo);
                    break;
                case CellEditType.PartialMetadata:
                    this.changeCellMetadataPartial(this.cells[cellIndex], edit.metadata, computeUndoRedo);
                    break;
                case CellEditType.PartialInternalMetadata:
                    this.changeCellInternalMetadataPartial(this.cells[cellIndex], edit.internalMetadata);
                    break;
                case CellEditType.CellLanguage:
                    this.changeCellLanguage(this.cells[cellIndex], edit.language, computeUndoRedo);
                    break;
                case CellEditType.DocumentMetadata:
                    this.updateNotebookMetadata(edit.metadata, computeUndoRedo);
                    break;
                case CellEditType.Move:
                    this.moveCellToIndex(cellIndex, edit.length, edit.newIdx, computeUndoRedo);
                    break;
            }

            // if selected cell is affected update it because it can potentially have been replaced
            if (cell === this.selectedCell) {
                this.setSelectedCell(this.cells[Math.min(cellIndex, this.cells.length - 1)]);
            }
        }

        this.onDidChangeContentEmitter.fire();

    }

    protected replaceCells(start: number, deleteCount: number, newCells: CellData[], computeUndoRedo: boolean): void {
        const cells = newCells.map(cell => {
            const handle = this.nextHandle++;
            return this.cellModelFactory({
                uri: CellUri.generate(this.uri, handle),
                handle: handle,
                source: cell.source,
                language: cell.language,
                cellKind: cell.cellKind,
                outputs: cell.outputs,
                metadata: cell.metadata,
                internalMetadata: cell.internalMetadata,
                collapseState: cell.collapseState
            });
        });
        this.addCellOutputListeners(cells);

        const changes: NotebookCellTextModelSplice<NotebookCellModel>[] = [{ start, deleteCount, newItems: cells }];

        const deletedCells = this.cells.splice(start, deleteCount, ...cells);

        for (const cell of deletedCells) {
            cell.dispose();
        }

        if (computeUndoRedo) {
            this.undoRedoService.pushElement(this.uri,
                async () => this.replaceCells(start, newCells.length, deletedCells.map(cell => cell.getData()), false),
                async () => this.replaceCells(start, deleteCount, newCells, false));
        }

        this.onDidAddOrRemoveCellEmitter.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes }, newCellIds: cells.map(cell => cell.handle) });
        this.onDidChangeContentEmitter.queue({ kind: NotebookCellsChangeType.ModelChange, changes });
        if (cells.length > 0) {
            this.setSelectedCell(cells[cells.length - 1]);
            cells[cells.length - 1].requestEdit();
        }
    }

    protected changeCellInternalMetadataPartial(cell: NotebookCellModel, internalMetadata: NullablePartialNotebookCellInternalMetadata): void {
        const newInternalMetadata: NotebookCellInternalMetadata = {
            ...cell.internalMetadata
        };
        let k: keyof NotebookCellInternalMetadata;
        // eslint-disable-next-line guard-for-in
        for (k in internalMetadata) {
            newInternalMetadata[k] = (internalMetadata[k] ?? undefined) as never;
        }

        cell.internalMetadata = newInternalMetadata;
        this.onDidChangeContentEmitter.queue({ kind: NotebookCellsChangeType.ChangeCellInternalMetadata, index: this.cells.indexOf(cell), internalMetadata: newInternalMetadata });
    }

    protected updateNotebookMetadata(metadata: NotebookDocumentMetadata, computeUndoRedo: boolean): void {
        const oldMetadata = this.metadata;
        if (computeUndoRedo) {
            this.undoRedoService.pushElement(this.uri,
                async () => this.updateNotebookMetadata(oldMetadata, false),
                async () => this.updateNotebookMetadata(metadata, false)
            );
        }

        this.metadata = metadata;
        this.onDidChangeContentEmitter.queue({ kind: NotebookCellsChangeType.ChangeDocumentMetadata, metadata: this.metadata });
    }

    protected changeCellMetadataPartial(cell: NotebookCellModel, metadata: NullablePartialNotebookCellMetadata, computeUndoRedo: boolean): void {
        const newMetadata: NotebookCellMetadata = {
            ...cell.metadata
        };
        let k: keyof NullablePartialNotebookCellMetadata;
        // eslint-disable-next-line guard-for-in
        for (k in metadata) {
            const value = metadata[k] ?? undefined;
            newMetadata[k] = value as unknown;
        }

        this.changeCellMetadata(cell, newMetadata, computeUndoRedo);
    }

    protected changeCellMetadata(cell: NotebookCellModel, metadata: NotebookCellMetadata, computeUndoRedo: boolean): void {
        const triggerDirtyChange = this.isCellMetadataChanged(cell.metadata, metadata);

        if (triggerDirtyChange) {
            if (computeUndoRedo) {
                const oldMetadata = cell.metadata;
                cell.metadata = metadata;
                this.undoRedoService.pushElement(this.uri,
                    async () => { cell.metadata = oldMetadata; },
                    async () => { cell.metadata = metadata; }
                );
            }
        }

        cell.metadata = metadata;
        this.onDidChangeContentEmitter.queue({ kind: NotebookCellsChangeType.ChangeCellMetadata, index: this.cells.indexOf(cell), metadata: cell.metadata });
    }

    protected changeCellLanguage(cell: NotebookCellModel, languageId: string, computeUndoRedo: boolean): void {
        if (cell.language === languageId) {
            return;
        }

        cell.language = languageId;

        this.onDidChangeContentEmitter.queue({ kind: NotebookCellsChangeType.ChangeCellLanguage, index: this.cells.indexOf(cell), language: languageId });
    }

    protected moveCellToIndex(fromIndex: number, length: number, toIndex: number, computeUndoRedo: boolean): boolean {
        if (computeUndoRedo) {
            this.undoRedoService.pushElement(this.uri,
                async () => { this.moveCellToIndex(toIndex, length, fromIndex, false); },
                async () => { this.moveCellToIndex(fromIndex, length, toIndex, false); }
            );
        }

        const cells = this.cells.splice(fromIndex, length);
        this.cells.splice(toIndex, 0, ...cells);
        this.onDidChangeContentEmitter.queue({ kind: NotebookCellsChangeType.Move, index: fromIndex, length, newIdx: toIndex, cells });

        return true;
    }

    protected getCellIndexByHandle(handle: number): number {
        return this.cells.findIndex(c => c.handle === handle);
    }

    protected isCellMetadataChanged(a: NotebookCellMetadata, b: NotebookCellMetadata): boolean {
        const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
        for (const key of keys) {
            if (
                (a[key as keyof NotebookCellMetadata] !== b[key as keyof NotebookCellMetadata])
            ) {
                return true;
            }
        }

        return false;
    }

}
