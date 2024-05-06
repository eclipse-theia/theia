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

import { ReferenceCollection, URI, Reference, Event } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { NotebookModel } from '../view-model/notebook-model';

/**
 * special service for creating monaco textmodels for notebook cells.
 * Its for optimization purposes since there is alot of overhead otherwise with calling the backend to create a document for each cell and other smaller things.
 */
@injectable()
export class NotebookMonacoTextModelService {

    @inject(MonacoTextModelService)
    protected readonly monacoTextModelService: MonacoTextModelService;

    protected readonly cellmodels = new ReferenceCollection<string, MonacoEditorModel>(
        uri => this.monacoTextModelService.createUnmanagedModel(new URI(uri))
    );

    getOrCreateNotebookCellModelReference(uri: URI): Promise<Reference<MonacoEditorModel>> {
        return this.cellmodels.acquire(uri.toString());
    }

    async createTextModelsForNotebook(notebook: NotebookModel): Promise<void> {
        await Promise.all(notebook.cells.map(cell => cell.resolveTextModel()));
    }

    get onDidCreateNotebookCellModel(): Event<MonacoEditorModel> {
        return this.cellmodels.onDidCreate;
    }
}
