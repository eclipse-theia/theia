// *****************************************************************************
// Copyright (C) 2025 Typefox and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { NotebookCellModel } from './notebook-cell-model';
import { Disposable, Emitter } from '@theia/core';
import { NotebookModel } from './notebook-model';

export interface SelectedCellChangeEvent {
    cell: NotebookCellModel | undefined;
    scrollIntoView: boolean;
}

/**
 * Model containing the editor state/view information of a notebook editor. The actual notebook data can be found in the {@link NotebookModel}.
 */
@injectable()
export class NotebookViewModel implements Disposable {

    protected readonly onDidChangeSelectedCellEmitter = new Emitter<SelectedCellChangeEvent>();
    readonly onDidChangeSelectedCell = this.onDidChangeSelectedCellEmitter.event;

    selectedCell?: NotebookCellModel;

    initDataModelListeners(model: NotebookModel): void {
        model.onDidAddOrRemoveCell(e => {
            if (e.newCellIds && e.newCellIds?.length > 0 && e.externalEvent) {
                const lastNewCellHandle = e.newCellIds[e.newCellIds.length - 1];
                const newSelectedCell = model.getCellByHandle(lastNewCellHandle)!;
                this.setSelectedCell(newSelectedCell, true);
                newSelectedCell.requestEdit();
            } else if (this.selectedCell && !model.getCellByHandle(this.selectedCell.handle)) {
                const newSelectedIndex = e.rawEvent.changes[e.rawEvent.changes.length - 1].start;
                const newSelectedCell = model.cells[Math.min(newSelectedIndex, model.cells.length - 1)];
                this.setSelectedCell(newSelectedCell, false);
            }

        });
    }

    setSelectedCell(cell: NotebookCellModel, scrollIntoView: boolean = true): void {
        if (this.selectedCell !== cell) {
            this.selectedCell = cell;
            this.onDidChangeSelectedCellEmitter.fire({ cell, scrollIntoView });
        }
    }

    dispose(): void {
        this.onDidChangeSelectedCellEmitter.dispose();
    }

}
