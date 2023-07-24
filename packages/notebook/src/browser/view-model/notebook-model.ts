// *****************************************************************************
// Copyright (C) 20023 Typefox and others.
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

import { Disposable, Emitter, URI } from '@theia/core';
import { Saveable, SaveOptions } from '@theia/core/lib/browser';
import {
    CellEditOperation, CellEditType, CellUri, NotebookCellInternalMetadata,
    NotebookCellsChangeType, NotebookCellTextModelSplice, NotebookData, NotebookModelWillAddRemoveEvent, NotebookTextModelChangedEvent, NullablePartialNotebookCellInternalMetadata
} from '../../common';
import { NotebookSerializer } from '../service/notebook-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { NotebookCellModel, NotebookCellModelFactory, NotebookCellModelProps } from './notebook-cell-model';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { NotebookKernel } from '../service/notebook-kernel-service';

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

    private readonly onDidChangeContentEmitter = new Emitter<NotebookTextModelChangedEvent>();
    readonly onDidChangeContent = this.onDidChangeContentEmitter.event;

    @inject(FileService)
    private readonly fileService: FileService;

    readonly autoSave: 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';

    nextHandle: number = 0;

    kernel?: NotebookKernel;

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
        this.nextHandle = this.cells.length;
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
        const changes: NotebookCellTextModelSplice<NotebookCellModel>[] = [[index, 0, cells]];
        this.cells.splice(index, 0, ...cells);
        this.didAddRemoveCellEmitter.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes } });
        return;
    }

    removeCell(index: number, count: number): void {
        const changes: NotebookCellTextModelSplice<NotebookCellModel>[] = [[index, count, []]];
        this.cells.splice(index, count);
        this.didAddRemoveCellEmitter.fire({ rawEvent: { kind: NotebookCellsChangeType.ModelChange, changes } });
    }

    applyEdits(rawEdits: CellEditOperation[]): void {
        const editsWithDetails = rawEdits.map((edit, index) => {
            let cellIndex: number = -1;
            if ('index' in edit) {
                cellIndex = edit.index;
            } else if ('handle' in edit) {
                cellIndex = this.getCellIndexByHandle(edit.handle);
            }

            return {
                edit,
                cellIndex,
                end: edit.editType === CellEditType.Replace ? edit.index + edit.count : cellIndex,
                originalIndex: index
            };
        }).filter(edit => !!edit);

        for (const { edit, cellIndex } of editsWithDetails) {
            switch (edit.editType) {
                case CellEditType.Replace:
                    break;
                case CellEditType.Output: {
                    const cell = this.cells[cellIndex];
                    if (edit.append) {
                        cell.spliceNotebookCellOutputs({ deleteCount: 0, newOutputs: edit.outputs, start: cell.outputs.length });
                    } else {
                        // could definitely be more efficient. See vscode __spliceNotebookCellOutputs2
                        for (const output of edit.outputs) {
                            cell.spliceNotebookCellOutputs({
                                deleteCount: 1,
                                newOutputs: [output],
                                start: cell.outputs.findIndex(outputModel => outputModel.outputId === output.outputId)
                            });
                        }
                    }

                    break;
                }
                // case CellEditType.OutputItems:
                //     break;
                // case CellEditType.Metadata:
                //     break;
                // case CellEditType.PartialMetadata:
                //     break;
                case CellEditType.PartialInternalMetadata:
                    this.changeCellInternalMetadataPartial(this.cells[cellIndex], edit.internalMetadata);
                    break;
                // case CellEditType.CellLanguage:
                //     break;
                // case CellEditType.DocumentMetadata:
                //     break;
                // case CellEditType.Move:
                //     break;

            }
        }
    }

    private changeCellInternalMetadataPartial(cell: NotebookCellModel, internalMetadata: NullablePartialNotebookCellInternalMetadata): void {
        const newInternalMetadata: NotebookCellInternalMetadata = {
            ...cell.internalMetadata
        };
        let k: keyof NotebookCellInternalMetadata;
        // eslint-disable-next-line guard-for-in
        for (k in internalMetadata) {
            newInternalMetadata[k] = (internalMetadata[k] ?? undefined) as never;
        }

        cell.internalMetadata = newInternalMetadata;
    }

    private getCellIndexByHandle(handle: number): number {
        return this.cells.findIndex(c => c.handle === handle);
    }
}
