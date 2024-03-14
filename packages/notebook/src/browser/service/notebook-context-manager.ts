// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ContextKeyChangeEvent, ContextKeyService, ScopedValueStore } from '@theia/core/lib/browser/context-key-service';
import { DisposableCollection, Emitter } from '@theia/core';
import { NotebookKernelService } from './notebook-kernel-service';
import {
    NOTEBOOK_CELL_EXECUTING, NOTEBOOK_CELL_EXECUTION_STATE,
    NOTEBOOK_CELL_FOCUSED, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE,
    NOTEBOOK_CELL_TYPE, NOTEBOOK_KERNEL, NOTEBOOK_KERNEL_SELECTED,
    NOTEBOOK_VIEW_TYPE
} from '../contributions/notebook-context-keys';
import { NotebookEditorWidget } from '../notebook-editor-widget';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { CellKind } from '../../common';
import { NotebookExecutionStateService } from './notebook-execution-state-service';

@injectable()
export class NotebookContextManager {
    @inject(ContextKeyService) protected contextKeyService: ContextKeyService;

    @inject(NotebookKernelService)
    protected readonly notebookKernelService: NotebookKernelService;

    @inject(NotebookExecutionStateService)
    protected readonly executionStateService: NotebookExecutionStateService;

    protected readonly toDispose = new DisposableCollection();

    protected readonly onDidChangeContextEmitter = new Emitter<ContextKeyChangeEvent>();
    readonly onDidChangeContext = this.onDidChangeContextEmitter.event;

    protected _context?: HTMLElement;

    get context(): HTMLElement | undefined {
        return this._context;
    }

    init(widget: NotebookEditorWidget): void {
        this._context = widget.node;
        const scopedStore = this.contextKeyService.createScoped(widget.node);

        this.toDispose.dispose();

        scopedStore.setContext(NOTEBOOK_VIEW_TYPE, widget?.notebookType);

        // Kernel related keys
        const kernel = widget?.model ? this.notebookKernelService.getSelectedNotebookKernel(widget.model) : undefined;
        scopedStore.setContext(NOTEBOOK_KERNEL_SELECTED, !!kernel);
        scopedStore.setContext(NOTEBOOK_KERNEL, kernel?.id);
        this.toDispose.push(this.notebookKernelService.onDidChangeSelectedKernel(e => {
            if (e.notebook.toString() === widget?.getResourceUri()?.toString()) {
                scopedStore.setContext(NOTEBOOK_KERNEL_SELECTED, !!e.newKernel);
                scopedStore.setContext(NOTEBOOK_KERNEL, e.newKernel);
                this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_KERNEL_SELECTED, NOTEBOOK_KERNEL]));
            }
        }));

        // Cell Selection realted keys
        scopedStore.setContext(NOTEBOOK_CELL_FOCUSED, !!widget.model?.selectedCell);
        widget.model?.onDidChangeSelectedCell(e => {
            scopedStore.setContext(NOTEBOOK_CELL_FOCUSED, !!e);
            this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_CELL_FOCUSED]));
        });

        widget.model?.onDidChangeSelectedCell(e => this.selectedCellChanged(e, scopedStore));

        this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_VIEW_TYPE, NOTEBOOK_KERNEL_SELECTED, NOTEBOOK_KERNEL]));
    }

    protected cellDisposables = new DisposableCollection();

    selectedCellChanged(cell: NotebookCellModel | undefined, scopedStore: ScopedValueStore): void {
        this.cellDisposables.dispose();

        scopedStore.setContext(NOTEBOOK_CELL_TYPE, cell ? cell.cellKind === CellKind.Code ? 'code' : 'markdown' : undefined);

        if (cell) {
            scopedStore.setContext(NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, cell.editing);
            this.cellDisposables.push(cell.onDidRequestCellEditChange(cellEdit => {
                scopedStore?.setContext(NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, cellEdit);
                this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_CELL_MARKDOWN_EDIT_MODE]));
            }));
            this.cellDisposables.push(this.executionStateService.onDidChangeExecution(e => {
                if (cell && e.affectsCell(cell.uri)) {
                    scopedStore?.setContext(NOTEBOOK_CELL_EXECUTING, !!e.changed);
                    scopedStore?.setContext(NOTEBOOK_CELL_EXECUTION_STATE, e.changed?.state ?? 'idle');
                    this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_CELL_EXECUTING, NOTEBOOK_CELL_EXECUTION_STATE]));
                }
            }));
        }

        this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_CELL_TYPE]));

    }

    createContextKeyChangedEvent(affectedKeys: string[]): ContextKeyChangeEvent {
        return { affects: keys => affectedKeys.some(key => keys.has(key)) };
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
