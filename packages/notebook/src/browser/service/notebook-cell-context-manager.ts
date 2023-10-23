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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NOTEBOOK_CELL_EXECUTING, NOTEBOOK_CELL_EXECUTION_STATE, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_TYPE } from '../contributions/notebook-context-keys';
import { Disposable, DisposableCollection, Emitter } from '@theia/core';
import { CellKind } from '../../common';
import { NotebookExecutionStateService } from '../service/notebook-execution-state-service';

@injectable()
export class NotebookCellContextManager implements Disposable {
    @inject(ContextKeyService) protected contextKeyService: ContextKeyService;

    @inject(NotebookExecutionStateService)
    protected readonly executionStateService: NotebookExecutionStateService;

    protected readonly toDispose = new DisposableCollection();

    protected currentContext: HTMLLIElement;

    protected readonly onDidChangeContextEmitter = new Emitter<void>();
    readonly onDidChangeContext = this.onDidChangeContextEmitter.event;

    updateCellContext(cell: NotebookCellModel, newHtmlContext: HTMLLIElement): void {
        if (newHtmlContext !== this.currentContext) {
            this.toDispose.dispose();

            this.currentContext = newHtmlContext;
            const currentStore = this.contextKeyService.createScoped(newHtmlContext);
            this.toDispose.push(currentStore);

            currentStore.setContext(NOTEBOOK_CELL_TYPE, cell.cellKind === CellKind.Code ? 'code' : 'markdown');

            this.toDispose.push(cell.onDidRequestCellEditChange(cellEdit => {
                currentStore?.setContext(NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, cellEdit);
                this.onDidChangeContextEmitter.fire();
            }));
            this.toDispose.push(this.executionStateService.onDidChangeExecution(e => {
                if (e.affectsCell(cell.uri)) {
                    currentStore?.setContext(NOTEBOOK_CELL_EXECUTING, !!e.changed);
                    currentStore?.setContext(NOTEBOOK_CELL_EXECUTION_STATE, e.changed?.state ?? 'idle');
                    this.onDidChangeContextEmitter.fire();
                }
            }));
            this.onDidChangeContextEmitter.fire();
        }
    }

    dispose(): void {
        this.toDispose.dispose();
        this.onDidChangeContextEmitter.dispose();
    }
}
