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

import { URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';
import { UriComponents } from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { NotebookData } from '../../common';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookService } from './notebook-service';

@injectable()
export class NotebookModelResolverService {

    @inject(FileService)
    protected fileService: FileService;

    @inject(NotebookService)
    protected notebookService: NotebookService;

    private onDidChangeDirtyEmitter = new Emitter<NotebookModel>();
    readonly onDidChangeDirty = this.onDidChangeDirtyEmitter.event;
    private onDidSaveNotebookEmitter = new Emitter<UriComponents>();
    readonly onDidSaveNotebook = this.onDidSaveNotebookEmitter.event;

    async resolve(resource: URI, viewType?: string): Promise<NotebookModel>;
    async resolve(resource: { untitledResource: URI | undefined; }, viewType: string): Promise<NotebookModel>;
    async resolve(arg: URI | { untitledResource: URI | undefined; }, viewType: string): Promise<NotebookModel> {
        if (arg.hasOwnProperty('untitledResource')) {
            // NB Unimplemented: implement "new untitled notebook"
            // return ;
        }

        const notebookData = await this.resolveExistingNotebookData(arg as URI, viewType!);

        const notebookModel = this.notebookService.createNotebookModel(notebookData, viewType, arg as URI);

        notebookModel.onDirtyChanged(() => this.onDidChangeDirtyEmitter.fire(notebookModel));
        notebookModel.onDidSaveNotebook(() => this.onDidSaveNotebookEmitter.fire(notebookModel.uri.toComponents()));

        return notebookModel;
    }

    private async resolveExistingNotebookData(resource: URI, viewType: string): Promise<NotebookData> {
        const file = await this.fileService.readFile(resource);

        const dataProvider = await this.notebookService.getNotebookDataProvider(viewType);
        const notebook = await dataProvider.serializer.dataToNotebook(file.value);

        return notebook;
    }
}
