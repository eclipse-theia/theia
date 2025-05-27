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

import * as theia from '@theia/plugin';
import * as rpc from '../../common';
import { EditorsAndDocumentsExtImpl } from '../editors-and-documents';
import * as notebookCommon from '@theia/notebook/lib/common';
import { Disposable, URI } from '@theia/core';
import * as typeConverters from '../type-converters';
import { ModelAddedData, NotebookCellDto, NotebookCellsChangedEventDto, NotebookModelAddedData, NotebookOutputDto } from '../../common';
import { NotebookRange } from '../types-impl';
import { DocumentsExtImpl } from '../documents';
import { UriComponents } from '../../common/uri-components';

class RawContentChangeEvent {

    constructor(
        readonly start: number,
        readonly deletedCount: number,
        readonly deletedItems: theia.NotebookCell[],
        readonly items: Cell[]
    ) { }

    asApiEvent(): theia.NotebookDocumentContentChange {
        return {
            range: new NotebookRange(this.start, this.start + this.deletedCount),
            addedCells: this.items.map(cell => cell.apiCell),
            removedCells: this.deletedItems,
        };
    }
}

export class Cell {

    static asModelAddData(cell: NotebookCellDto): ModelAddedData {
        return {
            EOL: cell.eol,
            lines: cell.source,
            languageId: cell.language,
            uri: cell.uri,
            isDirty: false,
            versionId: 1,
            modeId: cell.language,
            encoding: 'utf8' // see https://github.com/microsoft/vscode/blob/118f9ecd71a8f101b71ae19e3bf44802aa173209/src/vs/workbench/api/common/extHostNotebookDocument.ts#L44
        };
    }

    private cell: theia.NotebookCell | undefined;

    readonly handle: number;
    readonly uri: URI;
    readonly cellKind: notebookCommon.CellKind;

    private outputs: theia.NotebookCellOutput[];
    private metadata: Readonly<notebookCommon.NotebookCellMetadata>;
    private previousResult: Readonly<theia.NotebookCellExecutionSummary | undefined>;

    internalMetadata: notebookCommon.NotebookCellInternalMetadata;

    get language(): string {
        return this.apiCell.document.languageId;
    }

    constructor(
        public readonly notebookDocument: NotebookDocument,
        private readonly editorsAndDocuments: EditorsAndDocumentsExtImpl,
        private readonly cellData: rpc.NotebookCellDto,
    ) {
        this.handle = cellData.handle;
        this.uri = URI.fromComponents(cellData.uri);
        this.cellKind = cellData.cellKind;
        this.outputs = cellData.outputs.map(typeConverters.NotebookCellOutputConverter.to);
        this.internalMetadata = cellData.internalMetadata ?? {};
        this.metadata = Object.freeze(cellData.metadata ?? {});
        this.previousResult = Object.freeze(typeConverters.NotebookCellExecutionSummary.to(cellData.internalMetadata ?? {}));
    }

    get apiCell(): theia.NotebookCell {
        if (!this.cell) {
            const that = this;
            const data = this.editorsAndDocuments.getDocument(this.uri.toString());
            if (!data) {
                throw new Error(`MISSING extHostDocument for notebook cell: ${this.uri}`);
            }
            const apiCell: theia.NotebookCell = {
                get index(): number { return that.notebookDocument.getCellIndex(that); },
                notebook: that.notebookDocument.apiNotebook,
                kind: typeConverters.NotebookCellKind.to(this.cellData.cellKind),
                document: data.document,
                get outputs(): theia.NotebookCellOutput[] { return that.outputs.slice(0); },
                get metadata(): notebookCommon.NotebookCellMetadata { return that.metadata; },
                get executionSummary(): theia.NotebookCellExecutionSummary | undefined { return that.previousResult; }
            };
            this.cell = Object.freeze(apiCell);
        }
        return this.cell;
    }

    setOutputs(newOutputs: NotebookOutputDto[]): void {
        this.outputs = newOutputs.map(typeConverters.NotebookCellOutputConverter.to);
    }

    // setOutputItems(outputId: string, append: boolean, newOutputItems: NotebookOutputItemDto[]): void {
    //     const newItems = newOutputItems.map(typeConverters.NotebookCellOutputItem.to);
    //     const output = this.outputs.find(op => op.id === outputId);
    //     if (output) {
    //         if (!append) {
    //             output.items.length = 0;
    //         }
    //         output.items.push(...newItems);

    //         // if (output.items.length > 1 && output.items.every(item => notebookCommon.isTextStreamMime(item.mime))) {
    //         //     // Look for the mimes in the items, and keep track of their order.
    //         //     // Merge the streams into one output item, per mime type.
    //         //     const mimeOutputs = new Map<string, Uint8Array[]>();
    //         //     const mimeTypes: string[] = [];
    //         //     output.items.forEach(item => {
    //         //         let items: Uint8Array[];
    //         //         if (mimeOutputs.has(item.mime)) {
    //         //             items = mimeOutputs.get(item.mime)!;
    //         //         } else {
    //         //             items = [];
    //         //             mimeOutputs.set(item.mime, items);
    //         //             mimeTypes.push(item.mime);
    //         //         }
    //         //         items.push(item.data);
    //         //     });
    //         //     output.items.length = 0;
    //         //     mimeTypes.forEach(mime => {
    //         //         const compressed = notebookCommon.compressOutputItemStreams(mimeOutputs.get(mime)!);
    //         //         output.items.push({
    //         //             mime,
    //         //             data: compressed.buffer
    //         //         });
    //         //     });
    //         // }
    //     }
    // }

    setMetadata(newMetadata: notebookCommon.NotebookCellMetadata): void {
        this.metadata = Object.freeze(newMetadata);
    }

    setInternalMetadata(newInternalMetadata: notebookCommon.NotebookCellInternalMetadata): void {
        this.internalMetadata = newInternalMetadata;
        this.previousResult = Object.freeze(typeConverters.NotebookCellExecutionSummary.to(newInternalMetadata));
    }

}

export class NotebookDocument implements Disposable {

    private readonly cells: Cell[];

    private readonly notebookType: string;

    private notebook?: theia.NotebookDocument;
    private metadata: Record<string, unknown>;
    private versionId: number = 0;
    private isDirty: boolean = false;
    private disposed: boolean = false;

    constructor(
        private readonly proxy: rpc.NotebookDocumentsMain,
        private readonly editorsAndDocuments: EditorsAndDocumentsExtImpl,
        private readonly textDocuments: DocumentsExtImpl,
        public readonly uri: theia.Uri,
        notebookData: NotebookModelAddedData
    ) {
        this.notebookType = notebookData.viewType;
        this.metadata = notebookData.metadata ?? {};
        this.versionId = notebookData.versionId;
        this.cells = notebookData.cells.map(cell => new Cell(this, editorsAndDocuments, cell));
    }

    get apiNotebook(): theia.NotebookDocument {
        if (!this.notebook) {
            const that = this;
            const apiObject: theia.NotebookDocument = {
                get uri(): theia.Uri { return that.uri; },
                get version(): number { return that.versionId; },
                get notebookType(): string { return that.notebookType; },
                get isDirty(): boolean { return that.isDirty; },
                get isUntitled(): boolean { return that.uri.scheme === 'untitled'; },
                get isClosed(): boolean { return that.disposed; },
                get metadata(): Record<string, unknown> { return that.metadata; },
                get cellCount(): number { return that.cells.length; },
                cellAt(index): theia.NotebookCell {
                    index = that.validateIndex(index);
                    return that.cells[index].apiCell;
                },
                getCells(range): theia.NotebookCell[] {
                    const cells = range ? that.getCells(range) : that.cells;
                    return cells.map(cell => cell.apiCell);
                },
                save(): Promise<boolean> {
                    return that.save();
                }
            };
            this.notebook = Object.freeze(apiObject);
        }
        return this.notebook;
    }

    private validateIndex(index: number): number {
        index = index | 0;
        if (index < 0) {
            return 0;
        } else if (index >= this.cells.length) {
            return this.cells.length - 1;
        } else {
            return index;
        }
    }

    private validateRange(range: theia.NotebookRange): theia.NotebookRange {
        let start = range.start | 0;
        let end = range.end | 0;
        if (start < 0) {
            start = 0;
        }
        if (end > this.cells.length) {
            end = this.cells.length;
        }
        return range.with({ start, end });
    }

    private getCells(range: theia.NotebookRange): Cell[] {
        range = this.validateRange(range);
        const result: Cell[] = [];
        for (let i = range.start; i < range.end; i++) {
            result.push(this.cells[i]);
        }
        return result;
    }

    private async save(): Promise<boolean> {
        if (this.disposed) {
            return Promise.reject(new Error('Notebook has been closed'));
        }
        return this.proxy.$trySaveNotebook(this.uri);
    }

    acceptDirty(isDirty: boolean): void {
        this.isDirty = isDirty;
    }

    acceptModelChanged(event: NotebookCellsChangedEventDto, isDirty: boolean, newMetadata: notebookCommon.NotebookDocumentMetadata | undefined): theia.NotebookDocumentChangeEvent {
        this.versionId = event.versionId;
        this.isDirty = isDirty;
        // this.acceptDocumentPropertiesChanged({ metadata: newMetadata });

        const result = {
            notebook: this.apiNotebook,
            metadata: newMetadata,
            cellChanges: <theia.NotebookDocumentCellChange[]>[],
            contentChanges: <theia.NotebookDocumentContentChange[]>[],
        };

        type RelaxedCellChange = Partial<theia.NotebookDocumentCellChange> & { cell: theia.NotebookCell };
        const relaxedCellChanges: RelaxedCellChange[] = [];

        // -- apply change and populate content changes

        for (const rawEvent of event.rawEvents) {
            if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ModelChange) {
                this.spliceNotebookCells(rawEvent.changes, false, result.contentChanges);
            } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.Move) {
                this.moveCells(rawEvent.index, rawEvent.length, rawEvent.newIdx, result.contentChanges);
            } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.Output) {
                this.setCellOutputs(rawEvent.index, rawEvent.outputs);
                relaxedCellChanges.push({ cell: this.cells[rawEvent.index].apiCell, outputs: this.cells[rawEvent.index].apiCell.outputs });
            } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeDocumentMetadata) {
                this.metadata = result.metadata ?? {};
                // } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.OutputItem) {
                //     this._setCellOutputItems(rawEvent.index, rawEvent.outputId, rawEvent.append, rawEvent.outputItems);
                //     relaxedCellChanges.push({ cell: this.cells[rawEvent.index].apiCell, outputs: this.cells[rawEvent.index].apiCell.outputs });
            } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellLanguage) {
                this.changeCellLanguage(rawEvent.index, rawEvent.language);
                relaxedCellChanges.push({ cell: this.cells[rawEvent.index].apiCell, document: this.cells[rawEvent.index].apiCell.document });
            } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellContent) {
                relaxedCellChanges.push({ cell: this.cells[rawEvent.index].apiCell, document: this.cells[rawEvent.index].apiCell.document });

                // } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellMime) {
                //     this._changeCellMime(rawEvent.index, rawEvent.mime);
            } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellMetadata) {
                this.changeCellMetadata(rawEvent.index, rawEvent.metadata);
                relaxedCellChanges.push({ cell: this.cells[rawEvent.index].apiCell, metadata: this.cells[rawEvent.index].apiCell.metadata });

            } else if (rawEvent.kind === notebookCommon.NotebookCellsChangeType.ChangeCellInternalMetadata) {
                this.changeCellInternalMetadata(rawEvent.index, rawEvent.internalMetadata);
                relaxedCellChanges.push({ cell: this.cells[rawEvent.index].apiCell, executionSummary: this.cells[rawEvent.index].apiCell.executionSummary });
            }
        }

        // -- compact cellChanges

        const map = new Map<theia.NotebookCell, number>();
        for (let i = 0; i < relaxedCellChanges.length; i++) {
            const relaxedCellChange = relaxedCellChanges[i];
            const existing = map.get(relaxedCellChange.cell);
            if (existing === undefined) {
                const newLen = result.cellChanges.push({
                    document: undefined,
                    executionSummary: undefined,
                    metadata: undefined,
                    outputs: undefined,
                    ...relaxedCellChange,
                });
                map.set(relaxedCellChange.cell, newLen - 1);
            } else {
                result.cellChanges[existing] = {
                    ...result.cellChanges[existing],
                    ...relaxedCellChange
                };
            }
        }

        // Freeze event properties so handlers cannot accidentally modify them
        Object.freeze(result);
        Object.freeze(result.cellChanges);
        Object.freeze(result.contentChanges);

        return result;
    }

    private spliceNotebookCells(splices: notebookCommon.NotebookCellTextModelSplice<NotebookCellDto>[], initialization: boolean,
        bucket: theia.NotebookDocumentContentChange[] | undefined): void {
        if (this.disposed) {
            return;
        }

        const addedDocuments: ModelAddedData[] = [];
        const removedDocuments: UriComponents[] = [];

        const contentChangeEvents: RawContentChangeEvent[] = [];

        splices.reverse().forEach(splice => {
            const cellDtos = splice.newItems;
            const newCells = cellDtos.map((cell: NotebookCellDto) => {

                const extCell = new Cell(this, this.editorsAndDocuments, cell);
                if (!initialization) {
                    addedDocuments.push(Cell.asModelAddData(cell));
                }
                return extCell;
            });

            const changeEvent = new RawContentChangeEvent(splice.start, splice.deleteCount, [], newCells);
            const deletedItems = this.cells.splice(splice.start, splice.deleteCount, ...newCells);
            for (const cell of deletedItems) {
                changeEvent.deletedItems.push(cell.apiCell);
                removedDocuments.push(cell.uri.toComponents());
            }
            contentChangeEvents.push(changeEvent);
        });

        if (addedDocuments.length > 0 || removedDocuments.length > 0) {
            this.editorsAndDocuments.acceptEditorsAndDocumentsDelta({
                addedDocuments,
                removedDocuments
            });
        }

        if (bucket) {
            for (const changeEvent of contentChangeEvents) {
                bucket.push(changeEvent.asApiEvent());
            }
        }
    }

    private moveCells(index: number, length: number, newIdx: number, bucket: theia.NotebookDocumentContentChange[]): void {
        const cells = this.cells.splice(index, length);
        this.cells.splice(newIdx, 0, ...cells);
        const changes = [
            new RawContentChangeEvent(index, length, cells.map(c => c.apiCell), []),
            new RawContentChangeEvent(newIdx, 0, [], cells)
        ];
        for (const change of changes) {
            bucket.push(change.asApiEvent());
        }
    }

    private setCellOutputs(index: number, outputs: NotebookOutputDto[]): void {
        const cell = this.cells[index];
        cell.setOutputs(outputs);
    }

    // private _setCellOutputItems(index: number, outputId: string, append: boolean, outputItems: NotebookOutputItemDto[]): void {
    //     const cell = this.cells[index];
    //     cell.setOutputItems(outputId, append, outputItems);
    // }

    private changeCellLanguage(index: number, newLanguageId: string): void {
        const cell = this.cells[index];
        if (cell.apiCell.document.languageId !== newLanguageId) {
            this.textDocuments.$acceptModelModeChanged(cell.uri.toComponents(), cell.language, newLanguageId);
        }
    }

    private changeCellMetadata(index: number, newMetadata: notebookCommon.NotebookCellMetadata): void {
        const cell = this.cells[index];
        cell.setMetadata(newMetadata);
    }

    private changeCellInternalMetadata(index: number, newInternalMetadata: notebookCommon.NotebookCellInternalMetadata): void {
        const cell = this.cells[index];
        cell.setInternalMetadata(newInternalMetadata);
    }

    getCellFromApiCell(apiCell: theia.NotebookCell): Cell | undefined {
        return this.cells.find(cell => cell.apiCell === apiCell);
    }

    getCell(cellHandle: number): Cell | undefined {
        return this.cells.find(cell => cell.handle === cellHandle);
    }

    getCellFromIndex(index: number): Cell | undefined {
        return this.cells[index];
    }

    getCellIndex(cell: Cell): number {
        return this.cells.indexOf(cell);
    }

    dispose(): void {
        this.disposed = true;
    }
}
