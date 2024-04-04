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

import { Event, Emitter, Resource, ResourceReadOptions, ResourceResolver, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { CellUri } from '../common';
import { NotebookService } from './service/notebook-service';
import { NotebookCellModel } from './view-model/notebook-cell-model';
import { NotebookModel } from './view-model/notebook-model';

export class NotebookCellResource implements Resource {

    protected readonly onDidChangeContentsEmitter = new Emitter<void>();
    get onDidChangeContents(): Event<void> {
        return this.onDidChangeContentsEmitter.event;
    }

    get onDidChangeReadOnly(): Event<boolean | MarkdownString> | undefined {
        return this.notebook.onDidChangeReadOnly;
    }

    get readOnly(): boolean | MarkdownString | undefined {
        return this.notebook.readOnly;
    }

    protected cell: NotebookCellModel;
    protected notebook: NotebookModel;

    uri: URI;

    constructor(uri: URI, notebook: NotebookModel, cell: NotebookCellModel) {
        this.uri = uri;
        this.notebook = notebook;
        this.cell = cell;
    }

    readContents(options?: ResourceReadOptions | undefined): Promise<string> {
        return Promise.resolve(this.cell.source);
    }

    dispose(): void {
        this.onDidChangeContentsEmitter.dispose();
    }

}

@injectable()
export class NotebookCellResourceResolver implements ResourceResolver {

    @inject(NotebookService)
    protected readonly notebookService: NotebookService;

    async resolve(uri: URI): Promise<Resource> {
        if (uri.scheme !== CellUri.cellUriScheme) {
            throw new Error(`Cannot resolve cell uri with scheme '${uri.scheme}'`);
        }

        const parsedUri = CellUri.parse(uri);
        if (!parsedUri) {
            throw new Error(`Cannot parse uri '${uri.toString()}'`);
        }

        const notebookModel = this.notebookService.getNotebookEditorModel(parsedUri.notebook);

        if (!notebookModel) {
            throw new Error(`No notebook found for uri '${parsedUri.notebook}'`);
        }

        const notebookCellModel = notebookModel.cells.find(cell => cell.handle === parsedUri.handle);

        if (!notebookCellModel) {
            throw new Error(`No cell found with handle '${parsedUri.handle}' in '${parsedUri.notebook}'`);
        }

        return new NotebookCellResource(uri, notebookModel, notebookCellModel);
    }

}

@injectable()
export class NotebookOutputResourceResolver implements ResourceResolver {

    @inject(NotebookService)
    protected readonly notebookService: NotebookService;

    async resolve(uri: URI): Promise<Resource> {
        if (uri.scheme !== CellUri.outputUriScheme) {
            throw new Error(`Cannot resolve output uri with scheme '${uri.scheme}'`);
        }

        const parsedUri = CellUri.parseCellOutputUri(uri);
        if (!parsedUri) {
            throw new Error(`Cannot parse uri '${uri.toString()}'`);
        }

        const notebookModel = this.notebookService.getNotebookEditorModel(parsedUri.notebook);

        if (!notebookModel) {
            throw new Error(`No notebook found for uri '${parsedUri.notebook}'`);
        }

        const ouputModel = notebookModel.cells.flatMap(cell => cell.outputs).find(output => output.outputId === parsedUri.outputId);

        if (!ouputModel) {
            throw new Error(`No output found with id '${parsedUri.outputId}' in '${parsedUri.notebook}'`);
        }

        return {
            uri: uri,
            dispose: () => { },
            readContents: async () => ouputModel.outputs[0].data.toString(),
            readOnly: true,
        };
    }

}
