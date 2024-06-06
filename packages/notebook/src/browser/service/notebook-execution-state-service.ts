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

import { Disposable, DisposableCollection, Emitter, URI, generateUuid } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { NotebookService } from './notebook-service';
import {
    CellEditType, CellExecuteOutputEdit, CellExecuteOutputItemEdit, CellExecutionUpdateType,
    CellUri, NotebookCellExecutionState, NotebookCellInternalMetadata
} from '../../common';
import { CellPartialInternalMetadataEditByHandle, CellEditOperation } from '../notebook-types';
import { NotebookModel } from '../view-model/notebook-model';

export type CellExecuteUpdate = CellExecuteOutputEdit | CellExecuteOutputItemEdit | CellExecutionStateUpdate;

export interface CellExecutionComplete {
    runEndTime?: number;
    lastRunSuccess?: boolean;
}

export interface CellExecutionStateUpdate {
    editType: CellExecutionUpdateType.ExecutionState;
    executionOrder?: number;
    runStartTime?: number;
    didPause?: boolean;
    isPaused?: boolean;
}

export enum NotebookExecutionType {
    cell,
    notebook
}

export interface NotebookFailStateChangedEvent {
    visible: boolean;
    notebook: URI;
}

export interface FailedCellInfo {
    cellHandle: number;
    disposable: Disposable;
    visible: boolean;
}

@injectable()
export class NotebookExecutionStateService implements Disposable {

    @inject(NotebookService)
    protected notebookService: NotebookService;

    protected toDispose: DisposableCollection = new DisposableCollection();

    protected readonly executions = new Map<string, Map<number, CellExecution>>();

    protected readonly onDidChangeExecutionEmitter = new Emitter<CellExecutionStateChangedEvent>();
    onDidChangeExecution = this.onDidChangeExecutionEmitter.event;

    protected readonly onDidChangeLastRunFailStateEmitter = new Emitter<NotebookFailStateChangedEvent>();
    onDidChangeLastRunFailState = this.onDidChangeLastRunFailStateEmitter.event;

    getOrCreateCellExecution(notebookUri: URI, cellHandle: number): CellExecution {
        const notebook = this.notebookService.getNotebookEditorModel(notebookUri);

        if (!notebook) {
            throw new Error(`Notebook not found: ${notebookUri.toString()}`);
        }

        let execution = this.executions.get(notebookUri.toString())?.get(cellHandle);

        if (!execution) {
            execution = this.createNotebookCellExecution(notebook, cellHandle);
            if (!this.executions.has(notebookUri.toString())) {
                this.executions.set(notebookUri.toString(), new Map());
            }
            this.executions.get(notebookUri.toString())?.set(cellHandle, execution);
            execution.initialize();
            this.onDidChangeExecutionEmitter.fire(new CellExecutionStateChangedEvent(notebookUri, cellHandle, execution));
        }

        return execution;

    }

    protected createNotebookCellExecution(notebook: NotebookModel, cellHandle: number): CellExecution {
        const notebookUri = notebook.uri;
        const execution = new CellExecution(cellHandle, notebook);
        execution.toDispose.push(execution.onDidUpdate(() => this.onDidChangeExecutionEmitter.fire(new CellExecutionStateChangedEvent(notebookUri, cellHandle, execution))));
        execution.toDispose.push(execution.onDidComplete(lastRunSuccess => this.onCellExecutionDidComplete(notebookUri, cellHandle, execution, lastRunSuccess)));

        return execution;
    }

    protected onCellExecutionDidComplete(notebookUri: URI, cellHandle: number, exe: CellExecution, lastRunSuccess?: boolean): void {
        const notebookExecutions = this.executions.get(notebookUri.toString())?.get(cellHandle);
        if (!notebookExecutions) {
            throw new Error('Notebook Cell Execution not found while trying to complete it');
        }

        exe.dispose();
        this.executions.get(notebookUri.toString())?.delete(cellHandle);

        this.onDidChangeExecutionEmitter.fire(new CellExecutionStateChangedEvent(notebookUri, cellHandle));
    }

    getCellExecution(cellUri: URI): CellExecution | undefined {
        const parsed = CellUri.parse(cellUri);
        if (!parsed) {
            throw new Error(`Not a cell URI: ${cellUri}`);
        }

        return this.executions.get(parsed.notebook.toString())?.get(parsed.handle);
    }

    dispose(): void {
        this.onDidChangeExecutionEmitter.dispose();
        this.onDidChangeLastRunFailStateEmitter.dispose();

        this.executions.forEach(notebookExecutions => notebookExecutions.forEach(execution => execution.dispose()));
    }

}

export class CellExecution implements Disposable {
    protected readonly onDidUpdateEmitter = new Emitter<void>();
    readonly onDidUpdate = this.onDidUpdateEmitter.event;

    protected readonly onDidCompleteEmitter = new Emitter<boolean | undefined>();
    readonly onDidComplete = this.onDidCompleteEmitter.event;

    toDispose = new DisposableCollection();

    protected _state: NotebookCellExecutionState = NotebookCellExecutionState.Unconfirmed;
    get state(): NotebookCellExecutionState {
        return this._state;
    }

    get notebookURI(): URI {
        return this.notebook.uri;
    }

    protected _didPause = false;
    get didPause(): boolean {
        return this._didPause;
    }

    protected _isPaused = false;
    get isPaused(): boolean {
        return this._isPaused;
    }

    constructor(
        readonly cellHandle: number,
        protected readonly notebook: NotebookModel,
    ) {
        console.debug(`CellExecution#ctor ${this.getCellLog()}`);
    }

    initialize(): void {
        const startExecuteEdit: CellPartialInternalMetadataEditByHandle = {
            editType: CellEditType.PartialInternalMetadata,
            handle: this.cellHandle,
            internalMetadata: {
                executionId: generateUuid(),
                runStartTime: undefined,
                runEndTime: undefined,
                lastRunSuccess: undefined,
                executionOrder: undefined,
                renderDuration: undefined,
            }
        };
        this.applyCellExecutionEditsToNotebook([startExecuteEdit]);
    }

    protected getCellLog(): string {
        return `${this.notebookURI.toString()}, ${this.cellHandle}`;
    }

    confirm(): void {
        this._state = NotebookCellExecutionState.Pending;
        this.onDidUpdateEmitter.fire();
    }

    update(updates: CellExecuteUpdate[]): void {
        if (updates.some(u => u.editType === CellExecutionUpdateType.ExecutionState)) {
            this._state = NotebookCellExecutionState.Executing;
        }

        if (!this._didPause && updates.some(u => u.editType === CellExecutionUpdateType.ExecutionState && u.didPause)) {
            this._didPause = true;
        }

        const lastIsPausedUpdate = [...updates].reverse().find(u => u.editType === CellExecutionUpdateType.ExecutionState && typeof u.isPaused === 'boolean');
        if (lastIsPausedUpdate) {
            this._isPaused = (lastIsPausedUpdate as CellExecutionStateUpdate).isPaused!;
        }

        const cellModel = this.notebook.cells.find(c => c.handle === this.cellHandle);
        if (!cellModel) {
            console.debug(`CellExecution#update, updating cell not in notebook: ${this.notebook.uri.toString()}, ${this.cellHandle}`);
        } else {
            const edits = updates.map(update => updateToEdit(update, this.cellHandle));
            this.applyCellExecutionEditsToNotebook(edits);
        }

        if (updates.some(u => u.editType === CellExecutionUpdateType.ExecutionState)) {
            this.onDidUpdateEmitter.fire();
        }

    }

    complete(completionData: CellExecutionComplete): void {
        const cellModel = this.notebook.cells.find(c => c.handle === this.cellHandle);
        if (!cellModel) {
            console.debug(`CellExecution#complete, completing cell not in notebook: ${this.notebook.uri.toString()}, ${this.cellHandle}`);
        } else {
            const edit: CellEditOperation = {
                editType: CellEditType.PartialInternalMetadata,
                handle: this.cellHandle,
                internalMetadata: {
                    lastRunSuccess: completionData.lastRunSuccess,
                    // eslint-disable-next-line no-null/no-null
                    runStartTime: this._didPause ? null : cellModel.internalMetadata.runStartTime,
                    // eslint-disable-next-line no-null/no-null
                    runEndTime: this._didPause ? null : completionData.runEndTime,
                }
            };
            this.applyCellExecutionEditsToNotebook([edit]);
        }

        this.onDidCompleteEmitter.fire(completionData.lastRunSuccess);

    }

    dispose(): void {
        this.onDidUpdateEmitter.dispose();
        this.onDidCompleteEmitter.dispose();
        this.toDispose.dispose();
    }

    protected applyCellExecutionEditsToNotebook(edits: CellEditOperation[]): void {
        this.notebook.applyEdits(edits, false);
    }
}

export class CellExecutionStateChangedEvent {
    readonly type = NotebookExecutionType.cell;
    constructor(
        readonly notebook: URI,
        readonly cellHandle: number,
        readonly changed?: CellExecution
    ) { }

    affectsCell(cell: URI): boolean {
        const parsedUri = CellUri.parse(cell);
        return !!parsedUri && this.notebook.isEqual(parsedUri.notebook) && this.cellHandle === parsedUri.handle;
    }

    affectsNotebook(notebook: URI): boolean {
        return this.notebook.toString() === notebook.toString();
    }
}

export function updateToEdit(update: CellExecuteUpdate, cellHandle: number): CellEditOperation {
    if (update.editType === CellExecutionUpdateType.Output) {
        return {
            editType: CellEditType.Output,
            handle: update.cellHandle,
            append: update.append,
            outputs: update.outputs,
        };
    } else if (update.editType === CellExecutionUpdateType.OutputItems) {
        return {
            editType: CellEditType.OutputItems,
            items: update.items,
            outputId: update.outputId,
            append: update.append,
        };
    } else if (update.editType === CellExecutionUpdateType.ExecutionState) {
        const newInternalMetadata: Partial<NotebookCellInternalMetadata> = {};
        if (typeof update.executionOrder !== 'undefined') {
            newInternalMetadata.executionOrder = update.executionOrder;
        }
        if (typeof update.runStartTime !== 'undefined') {
            newInternalMetadata.runStartTime = update.runStartTime;
        }
        return {
            editType: CellEditType.PartialInternalMetadata,
            handle: cellHandle,
            internalMetadata: newInternalMetadata
        };
    }

    throw new Error('Unknown cell update type');
}
