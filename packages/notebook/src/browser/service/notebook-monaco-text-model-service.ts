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

import { URI, Reference, Event, Emitter } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MonacoTextModelService, MonacoEditorModelFilter } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { NotebookModel } from '../view-model/notebook-model';
import { CellUri } from '../../common/notebook-common';

@injectable()
export class NotebookMonacoEditorModelFilter implements MonacoEditorModelFilter {

    protected readonly onDidCreateCellModelEmitter = new Emitter<MonacoEditorModel>();

    get onDidCreateCellModel(): Event<MonacoEditorModel> {
        return this.onDidCreateCellModelEmitter.event;
    }

    filter(model: MonacoEditorModel): boolean {
        const applies = model.uri.startsWith(CellUri.cellUriScheme);
        if (applies) {
            // If the model is for a notebook cell, we emit the event to notify the listeners.
            // We create our own event here, as we don't want to propagate the creation of the cell to the plugin host.
            // Instead, we want to do that ourselves once the notebook model is completely initialized.
            this.onDidCreateCellModelEmitter.fire(model);
        }
        return applies;
    }
}

/**
 * special service for creating monaco textmodels for notebook cells.
 * Its for optimization purposes since there is alot of overhead otherwise with calling the backend to create a document for each cell and other smaller things.
 */
@injectable()
export class NotebookMonacoTextModelService {

    @inject(MonacoTextModelService)
    protected readonly monacoTextModelService: MonacoTextModelService;

    @inject(NotebookMonacoEditorModelFilter)
    protected readonly notebookMonacoEditorModelFilter: NotebookMonacoEditorModelFilter;

    getOrCreateNotebookCellModelReference(uri: URI): Promise<Reference<MonacoEditorModel>> {
        return this.monacoTextModelService.createModelReference(uri);
    }

    async createTextModelsForNotebook(notebook: NotebookModel): Promise<void> {
        await Promise.all(notebook.cells.map(cell => cell.resolveTextModel()));
    }

    get onDidCreateNotebookCellModel(): Event<MonacoEditorModel> {
        return this.notebookMonacoEditorModelFilter.onDidCreateCellModel;
    }
}
