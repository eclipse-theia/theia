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

import { Resource, ResourceReadOptions, ResourceResolver, ResourceVersion, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';
import { CellDto, CellUri } from '../common';
import { NotebookService } from './service/notebook-service';
import { NotebookModel } from './view-model/notebook-model';

class NotebookCellResource implements Resource {

    private readonly didChangeContentsEmitter = new Emitter<void>();
    readonly onDidChangeContents = this.didChangeContentsEmitter.event;

    version?: ResourceVersion | undefined;
    encoding?: string | undefined;
    isReadonly?: boolean | undefined;

    private cell: CellDto;

    constructor(public uri: URI, notebookModel: NotebookModel, cellIndex: number) {
        this.cell = notebookModel.cells[cellIndex];
    }

    readContents(options?: ResourceReadOptions | undefined): Promise<string> {
        return Promise.resolve(this.cell.source);
    }
    dispose(): void {
        throw new Error('Method not implemented.');
    }

}

@injectable()
export class NotebookCellResourceResolver implements ResourceResolver {

    @inject(NotebookService)
    protected notebookService: NotebookService;

    async resolve(uri: URI): Promise<Resource> {
        if (uri.scheme !== CellUri.scheme) {
            throw new Error('can\'t resolve uri');
        }

        const parsedUri = CellUri.parse(uri);
        if (!parsedUri) {
            throw new Error('cant parse uri ' + uri.toString());
        }

        const notebookModel = this.notebookService.getNotebookEditorModel(parsedUri.notebook);

        if (!notebookModel) {
            throw new Error('no notebook found for uri ' + parsedUri.notebook);
        }

        return new NotebookCellResource(uri, notebookModel, parsedUri.handle);
    }

}
