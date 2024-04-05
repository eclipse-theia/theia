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
    NOTEBOOK_CELL_EDITABLE,
    NOTEBOOK_CELL_EXECUTING, NOTEBOOK_CELL_EXECUTION_STATE,
    NOTEBOOK_CELL_FOCUSED, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE,
    NOTEBOOK_CELL_TYPE, NOTEBOOK_HAS_OUTPUTS, NOTEBOOK_KERNEL, NOTEBOOK_KERNEL_SELECTED,
    NOTEBOOK_VIEW_TYPE
} from '../contributions/notebook-context-keys';
import { NotebookEditorWidget } from '../notebook-editor-widget';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { CellKind, NotebookCellsChangeType } from '../../common';
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

    scopedStore: ScopedValueStore;

    get context(): HTMLElement | undefined {
        return this._context;
    }

    init(widget: NotebookEditorWidget): void {
        this._context = widget.node;
        this.scopedStore = this.contextKeyService.createScoped(widget.node);

        this.toDispose.dispose();

        this.scopedStore.setContext(NOTEBOOK_VIEW_TYPE, widget?.notebookType);

        // Kernel related keys
        const kernel = widget?.model ? this.notebookKernelService.getSelectedNotebookKernel(widget.model) : undefined;
        this.scopedStore.setContext(NOTEBOOK_KERNEL_SELECTED, !!kernel);
        this.scopedStore.setContext(NOTEBOOK_KERNEL, kernel?.id);
        this.toDispose.push(this.notebookKernelService.onDidChangeSelectedKernel(e => {
            if (e.notebook.toString() === widget?.getResourceUri()?.toString()) {
                this.scopedStore.setContext(NOTEBOOK_KERNEL_SELECTED, !!e.newKernel);
                this.scopedStore.setContext(NOTEBOOK_KERNEL, e.newKernel);
                this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_KERNEL_SELECTED, NOTEBOOK_KERNEL]));
            }
        }));

        widget.model?.onDidChangeContent(events => {
            if (events.some(e => e.kind === NotebookCellsChangeType.ModelChange || e.kind === NotebookCellsChangeType.Output)) {
                this.scopedStore.setContext(NOTEBOOK_HAS_OUTPUTS, widget.model?.cells.some(cell => cell.outputs.length > 0));
                this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_HAS_OUTPUTS]));
            }
        });

        this.scopedStore.setContext(NOTEBOOK_HAS_OUTPUTS, !!widget.model?.cells.find(cell => cell.outputs.length > 0));

        // Cell Selection realted keys
        this.scopedStore.setContext(NOTEBOOK_CELL_FOCUSED, !!widget.model?.selectedCell);
        widget.model?.onDidChangeSelectedCell(e => {
            this.scopedStore.setContext(NOTEBOOK_CELL_FOCUSED, !!e);
            this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_CELL_FOCUSED]));
        });

        widget.model?.onDidChangeSelectedCell(e => this.selectedCellChanged(e));

        this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_VIEW_TYPE, NOTEBOOK_KERNEL_SELECTED, NOTEBOOK_KERNEL]));
    }

    protected cellDisposables = new DisposableCollection();

    selectedCellChanged(cell: NotebookCellModel | undefined): void {
        this.cellDisposables.dispose();

        this.scopedStore.setContext(NOTEBOOK_CELL_TYPE, cell ? cell.cellKind === CellKind.Code ? 'code' : 'markdown' : undefined);

        if (cell) {
            this.scopedStore.setContext(NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, cell.editing);
            this.scopedStore.setContext(NOTEBOOK_CELL_EDITABLE, cell.cellKind === CellKind.Markup && !cell.editing);
            this.cellDisposables.push(cell.onDidRequestCellEditChange(cellEdit => {
                this.scopedStore.setContext(NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, cellEdit);
                this.scopedStore.setContext(NOTEBOOK_CELL_EDITABLE, cell.cellKind === CellKind.Markup && !cellEdit);
                this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_CELL_MARKDOWN_EDIT_MODE]));
            }));
            this.cellDisposables.push(this.executionStateService.onDidChangeExecution(e => {
                if (cell && e.affectsCell(cell.uri)) {
                    this.scopedStore.setContext(NOTEBOOK_CELL_EXECUTING, !!e.changed);
                    this.scopedStore.setContext(NOTEBOOK_CELL_EXECUTION_STATE, e.changed?.state ?? 'idle');
                    this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_CELL_EXECUTING, NOTEBOOK_CELL_EXECUTION_STATE]));
                }
            }));
        }

        this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_CELL_TYPE]));

    }

    onDidEditorTextFocus(focus: boolean): void {
        this.scopedStore.setContext('inputFocus', focus);
    }

    createContextKeyChangedEvent(affectedKeys: string[]): ContextKeyChangeEvent {
        return { affects: keys => affectedKeys.some(key => keys.has(key)) };
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
