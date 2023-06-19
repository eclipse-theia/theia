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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { ContextKeyService, ScopedValueStore } from '@theia/core/lib/browser/context-key-service';
import { Disposable } from '@theia/core/shared/vscode-languageserver-protocol';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_TYPE } from '../contributions/notebook-context-keys';
import { DisposableCollection } from '@theia/core';
import { CellKind } from '../../common';

@injectable()
export class NotebookCellContextManager implements Disposable {
    @inject(ContextKeyService) protected contextKeyService: ContextKeyService;

    private readonly disposables = new DisposableCollection();

    private currentStore: ScopedValueStore;
    private currentContext: HTMLLIElement;

    updateCellContext(cell: NotebookCellModel, newHtmlContext: HTMLLIElement): void {
        if (newHtmlContext !== this.currentContext) {
            this.dispose();

            this.currentContext = newHtmlContext;
            this.currentStore = this.contextKeyService.createScoped(newHtmlContext);

            this.currentStore.setContext(NOTEBOOK_CELL_TYPE, cell.cellKind === CellKind.Code ? 'code' : 'markdown');

            this.disposables.push(cell.onRequestCellEditChange(cellEdit => this.currentStore?.setContext(NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, cellEdit)));
        }
    }

    dispose(): void {
        this.disposables.dispose();
        this.currentStore?.dispose();
    }
}
