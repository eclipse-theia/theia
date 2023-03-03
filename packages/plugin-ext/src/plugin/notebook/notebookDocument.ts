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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as theia from '@theia/plugin';
import * as rpc from '../../common';
import { EditorsAndDocumentsExtImpl } from '../editors-and-documents';
import * as notebookCommon from '@theia/notebook/lib/common';
import { URI } from '@theia/core';
import * as typeConverters from '../type-converters';

export class Cell {
    private cell: theia.NotebookCell | undefined;

    readonly handle: number;
    readonly uri: URI;
    readonly cellKind: notebookCommon.CellKind;

    private outputs: theia.NotebookCellOutput[];
    private metadata: Readonly<notebookCommon.NotebookCellMetadata>;
    private previousResult: Readonly<theia.NotebookCellExecutionSummary | undefined>;

    // private internalMetadata: notebookCommon.NotebookCellInternalMetadata;

    constructor(
        readonly notebookDocument: NotebookDocument,
        private readonly editorsAndDocuments: EditorsAndDocumentsExtImpl,
        private readonly cellData: rpc.NotebookCellDto,
    ) {
        this.handle = cellData.handle;
        this.uri = URI.fromComponents(cellData.uri);
        this.cellKind = cellData.cellKind;
        this.outputs = cellData.outputs.map(typeConverters.NotebookCellOutput.to);
        // this.internalMetadata = cellData.internalMetadata ?? {};
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

}

export class NotebookDocument {

    private readonly cells: Cell[] = [];

    private readonly notebookType: string;

    private notebook: theia.NotebookDocument | undefined;
    private metadata: Record<string, unknown>;
    private versionId: number = 0;
    private isDirty: boolean = false;
    private disposed: boolean = false;

    constructor(
        private readonly proxy: rpc.NotebookDocumentsMain,
        // private readonly editorsAndDocuments: EditorsAndDocumentsExtImpl,
        // private readonly cellData: rpc.NotebookCellDto,
        readonly uri: theia.Uri
    ) {

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

    getCellFromIndex(index: number): Cell | undefined {
        return this.cells[index];
    }

    getCellIndex(cell: Cell): number {
        return this.cells.indexOf(cell);
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
}
