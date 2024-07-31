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

import { inject, injectable } from '@theia/core/shared/inversify';
import { CellExecution, NotebookExecutionStateService } from '../service/notebook-execution-state-service';
import { CellKind, NotebookCellExecutionState } from '../../common';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookKernelService } from './notebook-kernel-service';
import { CommandService, Disposable } from '@theia/core';
import { NotebookKernelQuickPickService } from './notebook-kernel-quick-pick-service';
import { NotebookKernelHistoryService } from './notebook-kernel-history-service';

export interface CellExecutionParticipant {
    onWillExecuteCell(executions: CellExecution[]): Promise<void>;
}

@injectable()
export class NotebookExecutionService {

    @inject(NotebookExecutionStateService)
    protected notebookExecutionStateService: NotebookExecutionStateService;

    @inject(NotebookKernelService)
    protected notebookKernelService: NotebookKernelService;

    @inject(NotebookKernelHistoryService)
    protected notebookKernelHistoryService: NotebookKernelHistoryService;

    @inject(CommandService)
    protected commandService: CommandService;

    @inject(NotebookKernelQuickPickService)
    protected notebookKernelQuickPickService: NotebookKernelQuickPickService;

    protected readonly cellExecutionParticipants = new Set<CellExecutionParticipant>();

    async executeNotebookCells(notebook: NotebookModel, cells: Iterable<NotebookCellModel>): Promise<void> {
        const cellsArr = Array.from(cells)
            .filter(c => c.cellKind === CellKind.Code);
        if (!cellsArr.length) {
            return;
        }

        // create cell executions
        const cellExecutions: [NotebookCellModel, CellExecution][] = [];
        for (const cell of cellsArr) {
            const cellExe = this.notebookExecutionStateService.getCellExecution(cell.uri);
            if (!cellExe) {
                cellExecutions.push([cell, this.notebookExecutionStateService.getOrCreateCellExecution(notebook.uri, cell.handle)]);
            }
        }

        const kernel = await this.notebookKernelHistoryService.resolveSelectedKernel(notebook);

        if (!kernel) {
            // clear all pending cell executions
            cellExecutions.forEach(cellExe => cellExe[1].complete({}));
            return;
        }

        // filter cell executions based on selected kernel
        const validCellExecutions: CellExecution[] = [];
        for (const [cell, cellExecution] of cellExecutions) {
            if (!kernel.supportedLanguages.includes(cell.language)) {
                cellExecution.complete({});
            } else {
                validCellExecutions.push(cellExecution);
            }
        }

        // request execution
        if (validCellExecutions.length > 0) {
            const cellRemoveListener = notebook.onDidAddOrRemoveCell(e => {
                if (e.rawEvent.changes.some(c => c.deleteCount > 0)) {
                    const executionsToCancel = validCellExecutions.filter(exec => !notebook.cells.find(cell => cell.handle === exec.cellHandle));
                    if (executionsToCancel.length > 0) {
                        kernel.cancelNotebookCellExecution(notebook.uri, executionsToCancel.map(c => c.cellHandle));
                        executionsToCancel.forEach(exec => exec.complete({}));
                    }
                }
            });
            await this.runExecutionParticipants(validCellExecutions);

            this.notebookKernelService.selectKernelForNotebook(kernel, notebook);
            await kernel.executeNotebookCellsRequest(notebook.uri, validCellExecutions.map(c => c.cellHandle));
            // the connecting state can change before the kernel resolves executeNotebookCellsRequest
            const unconfirmed = validCellExecutions.filter(exe => exe.state === NotebookCellExecutionState.Unconfirmed);
            if (unconfirmed.length) {
                unconfirmed.forEach(exe => exe.complete({}));
            }

            cellRemoveListener.dispose();

        }
    }

    registerExecutionParticipant(participant: CellExecutionParticipant): Disposable {
        this.cellExecutionParticipants.add(participant);
        return Disposable.create(() => this.cellExecutionParticipants.delete(participant));
    }

    protected async runExecutionParticipants(executions: CellExecution[]): Promise<void> {
        for (const participant of this.cellExecutionParticipants) {
            await participant.onWillExecuteCell(executions);
        }
        return;
    }

    async cancelNotebookCellHandles(notebook: NotebookModel, cells: Iterable<number>): Promise<void> {
        const cellsArr = Array.from(cells);
        const kernel = this.notebookKernelService.getSelectedOrSuggestedKernel(notebook);
        if (kernel) {
            await kernel.cancelNotebookCellExecution(notebook.uri, cellsArr);
        }
    }

    async cancelNotebookCells(notebook: NotebookModel, cells: Iterable<NotebookCellModel>): Promise<void> {
        this.cancelNotebookCellHandles(notebook, Array.from(cells, cell => cell.handle));
    }

}
