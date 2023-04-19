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

import { Disposable, DisposableCollection, Emitter, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { NotebookData, NotebookExtensionDescription, TransientOptions } from '../../common';
import { NotebookModel, NotebookModelFactory, NotebookModelProps } from '../view-model/notebook-model';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';

export const NotebookProvider = Symbol('notebook provider');

export interface SimpleNotebookProviderInfo {
    readonly viewType: string,
    readonly serializer: NotebookSerializer,
    readonly extensionData: NotebookExtensionDescription
}

export interface NotebookSerializer {
    options: TransientOptions;
    dataToNotebook(data: BinaryBuffer): Promise<NotebookData>;
    notebookToData(data: NotebookData): Promise<BinaryBuffer>;
}

@injectable()
export class NotebookService implements Disposable {

    @inject(FileService)
    protected fileService: FileService;

    @inject(MonacoTextModelService)
    protected modelService: MonacoTextModelService;

    @inject(NotebookModelFactory)
    protected notebookModelFactory: (props: NotebookModelProps) => NotebookModel;

    private notebookSerializerEmitter = new Emitter<string>();
    readonly onNotebookSerializer = this.notebookSerializerEmitter.event;

    protected readonly disposables = new DisposableCollection();

    protected readonly notebookProviders = new Map<string, SimpleNotebookProviderInfo>();
    protected readonly notebookModels = new Map<string, NotebookModel>();

    private readonly addViewTypeEmitter = new Emitter<string>();
    readonly onAddViewType = this.addViewTypeEmitter.event;

    private readonly willRemoveViewTypeEmitter = new Emitter<string>();
    readonly onWillRemoveViewType = this.willRemoveViewTypeEmitter.event;

    private readonly willOpenNotebookTypeEmitter = new Emitter<string>();
    readonly onWillOpenNotebook = this.willOpenNotebookTypeEmitter.event;

    // readonly onDidChangeOutputRenderers: Event<void>;
    private readonly willAddNotebookDocumentEmitter = new Emitter<NotebookModel>();
    readonly onWillAddNotebookDocument = this.willAddNotebookDocumentEmitter.event;
    private readonly didAddNotebookDocumentEmitter = new Emitter<NotebookModel>();
    readonly onDidAddNotebookDocument = this.didAddNotebookDocumentEmitter.event;
    private readonly willRemoveNotebookDocumentEmitter = new Emitter<NotebookModel>();
    readonly onWillRemoveNotebookDocument = this.willRemoveNotebookDocumentEmitter.event;
    private readonly didRemoveNotebookDocumentEmitter = new Emitter<NotebookModel>();
    readonly onDidRemoveNotebookDocument = this.didRemoveNotebookDocumentEmitter.event;

    dispose(): void {
        this.disposables.dispose();
    }

    registerNotebookSerializer(viewType: string, extensionData: NotebookExtensionDescription, serializer: NotebookSerializer): Disposable {
        if (this.notebookProviders.has(viewType)) {
            throw new Error(`notebook provider for viewtype '${viewType}' already exists`);
        }

        this.notebookProviders.set(viewType, { viewType, serializer, extensionData });
        this.addViewTypeEmitter.fire(viewType);

        return Disposable.create(() => {
            this.notebookProviders.delete(viewType);
            this.willRemoveViewTypeEmitter.fire(viewType);
        });
    }

    createNotebookModel(data: NotebookData, viewType: string, uri: URI): NotebookModel {
        const serializer = this.notebookProviders.get(viewType)?.serializer;
        if (!serializer) {
            throw new Error('no notebook serializer for ' + viewType);
        }

        const model = this.notebookModelFactory({ data, uri, viewType, serializer });
        this.willAddNotebookDocumentEmitter.fire(model);
        this.notebookModels.set(uri.toString(), model);
        this.didAddNotebookDocumentEmitter.fire(model);
        return model;
    }

    async getNotebookDataProvider(viewType: string): Promise<SimpleNotebookProviderInfo> {
        this.notebookSerializerEmitter.fire(`onNotebookSerializer:${viewType}`);

        const result = this.notebookProviders.get(viewType);
        if (!result) {
            throw new Error(`No provider registered for view type: '${viewType}'`);
        }
        return result;
    }

    getNotebookEditorModel(uri: URI): NotebookModel | undefined {
        return this.notebookModels.get(uri.toString());
    }

    async willOpenNotebook(type: string): Promise<void> {
        return this.willOpenNotebookTypeEmitter.sequence(async listener => listener(type));
    }
}
