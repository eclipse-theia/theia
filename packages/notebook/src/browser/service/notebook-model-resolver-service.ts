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
import { match } from '@theia/core/lib/common/glob';

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

    async resolve(resource: URI, viewType?: string): Promise<NotebookModel> {

        if (!viewType) {
            const existingViewType = this.notebookService.getNotebookEditorModel(resource)?.viewType;
            if (existingViewType) {
                viewType = existingViewType;
            } else {
                viewType = this.findViewTypeForResource(resource);
            }
        }

        if (!viewType) {
            throw new Error(`Missing viewType for '${resource}'`);
        }

        const notebookData = await this.resolveExistingNotebookData(resource, viewType!);

        const notebookModel = await this.notebookService.createNotebookModel(notebookData, viewType, resource);

        notebookModel.onDirtyChanged(() => this.onDidChangeDirtyEmitter.fire(notebookModel));
        notebookModel.onDidSaveNotebook(() => this.onDidSaveNotebookEmitter.fire(notebookModel.uri.toComponents()));

        return notebookModel;
    }

    async resolveUntitledResource(arg: UntitledResource, viewType: string): Promise<NotebookModel> {
        let resource: URI;
        // let hasAssociatedFilePath = false;
        arg = arg as UntitledResource;
        if (!arg.untitledResource) {
            const notebookTypeInfo = this.notebookTypeRegistry.notebookTypes.find(info => info.type === viewType);
            if (!notebookTypeInfo) {
                throw new Error('UNKNOWN view type: ' + viewType);
            }

            const suffix = this.getPossibleFileEnding(notebookTypeInfo.selector ?? []) ?? '';
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
            throw new Error('Invalid untitled resource: ' + arg.untitledResource.toString() + ' untitled resources with associated file path are not supported yet');
            // TODO implement associated file path support
            // resource = arg.untitledResource.withScheme('untitled');
            // hasAssociatedFilePath = true;
        }

        return this.resolve(resource, viewType);
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
            const notebook = await dataProvider.serializer.toNotebook(file.value);

            return notebook;
        }
    }

    protected getPossibleFileEnding(selectors: readonly NotebookFileSelector[]): string | undefined {
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

        const candidate = typeof selector === 'string' ? selector : selector.filenamePattern;

        if (candidate) {
            const matches = pattern.exec(candidate);
            if (matches) {
                return matches[1];
            }
        }

        return undefined;
    }

    protected findViewTypeForResource(resource: URI): string | undefined {
        return this.notebookTypeRegistry.notebookTypes.find(info =>
            info.selector?.some(selector => selector.filenamePattern && match(selector.filenamePattern, resource.path.name + resource.path.ext))
        )?.type;
    }

}
