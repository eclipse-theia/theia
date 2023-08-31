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

import { Emitter, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { UriComponents } from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { CellKind, NotebookData } from '../../common';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookService } from './notebook-service';
import { NotebookTypeRegistry } from '../notebook-type-registry';
import { NotebookFileSelector } from '../../common/notebook-protocol';

export interface UntitledResource {
    untitledResource: URI | undefined
}
@injectable()
export class NotebookModelResolverService {

    @inject(FileService)
    protected fileService: FileService;

    @inject(NotebookService)
    protected notebookService: NotebookService;

    @inject(NotebookTypeRegistry)
    protected notebookTypeRegistry: NotebookTypeRegistry;

    protected onDidChangeDirtyEmitter = new Emitter<NotebookModel>();
    readonly onDidChangeDirty = this.onDidChangeDirtyEmitter.event;
    protected onDidSaveNotebookEmitter = new Emitter<UriComponents>();
    readonly onDidSaveNotebook = this.onDidSaveNotebookEmitter.event;

    async resolve(resource: URI, viewType?: string): Promise<NotebookModel>;
    async resolve(resource: UntitledResource, viewType: string): Promise<NotebookModel>;
    async resolve(arg: URI | UntitledResource, viewType: string): Promise<NotebookModel> {
        let resource: URI;
        // let hasAssociatedFilePath = false;
        if (arg instanceof URI) {
            resource = arg;
        } else {
            arg = arg as UntitledResource;
            if (!arg.untitledResource) {
                const notebookTypeInfo = this.notebookTypeRegistry.notebookTypes.find(info => info.type === viewType);
                if (!notebookTypeInfo) {
                    throw new Error('UNKNOWN view type: ' + viewType);
                }

                const suffix = this.getPossibleFileEndings(notebookTypeInfo.selector ?? []) ?? '';
                for (let counter = 1; ; counter++) {
                    const candidate = new URI()
                        .withScheme('untitled')
                        .withPath(`Untitled-notebook-${counter}${suffix}`)
                        .withQuery(viewType);
                    if (!this.notebookService.getNotebookEditorModel(candidate)) {
                        resource = candidate;
                        break;
                    }
                }
            } else if (arg.untitledResource.scheme === 'untitled') {
                resource = arg.untitledResource;
            } else {
                resource = arg.untitledResource.withScheme('untitled');
                // hasAssociatedFilePath = true;
            }
        }

        const notebookData = await this.resolveExistingNotebookData(resource, viewType!);

        const notebookModel = await this.notebookService.createNotebookModel(notebookData, viewType, resource);

        notebookModel.onDirtyChanged(() => this.onDidChangeDirtyEmitter.fire(notebookModel));
        notebookModel.onDidSaveNotebook(() => this.onDidSaveNotebookEmitter.fire(notebookModel.uri.toComponents()));

        return notebookModel;
    }

    protected async resolveExistingNotebookData(resource: URI, viewType: string): Promise<NotebookData> {
        if (resource.scheme === 'untitled') {

            return {
                cells: [
                    {
                        cellKind: CellKind.Markup,
                        language: 'markdown',
                        outputs: [],
                        source: ''
                    }
                ],
                metadata: {}
            };
        } else {
            const file = await this.fileService.readFile(resource);

            const dataProvider = await this.notebookService.getNotebookDataProvider(viewType);
            const notebook = await dataProvider.serializer.dataToNotebook(file.value);

            return notebook;
        }
    }

    protected getPossibleFileEndings(selectors: readonly NotebookFileSelector[]): string | undefined {
        for (const selector of selectors) {
            const ending = this.possibleFileEnding(selector);
            if (ending) {
                return ending;
            }
        }
        return undefined;
    }

    protected possibleFileEnding(selector: NotebookFileSelector): string | undefined {

        const pattern = /^.*(\.[a-zA-Z0-9_-]+)$/;

        const candidate: string | undefined = typeof selector === 'string' ? selector : selector.filenamePattern;

        if (candidate) {
            const match = pattern.exec(candidate);
            if (match) {
                return match[1];
            }
        }

        return undefined;
    }

}
