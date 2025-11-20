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

import { URI, MaybePromise } from '@theia/core';
import { OpenHandler, OpenerOptions } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { NotebookEditorWidgetService } from './service/notebook-editor-widget-service';
import { CellUri } from '../common';

@injectable()
export class NotebookCellOpenHandler implements OpenHandler {

    @inject(NotebookEditorWidgetService)
    protected readonly notebookEditorWidgetService: NotebookEditorWidgetService;

    id: string = 'notebook-cell-opener';

    canHandle(uri: URI, options?: OpenerOptions | undefined): MaybePromise<number> {
        return uri.scheme === CellUri.cellUriScheme ? 200 : 0;
    }

    open(uri: URI, options?: OpenerOptions | undefined): undefined {
        const params = new URLSearchParams(uri.query);
        const executionCountParam = params.get('execution_count');
        const lineParam = params.get('line');

        if (!executionCountParam || !lineParam) {
            console.error('Invalid vscode-notebook-cell URI: missing execution_count or line parameter', uri.toString(true));
            return;
        }

        const executionCount = parseInt(executionCountParam);

        const cell = this.notebookEditorWidgetService.currentEditor?.model?.cells
            .find(c => c.metadata.execution_count === executionCount);
        this.notebookEditorWidgetService.currentEditor?.viewModel.cellViewModels.get(cell?.handle ?? -1)?.requestFocusEditor();
    }

}
