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

import { Disposable, DisposableCollection, Emitter, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { CellKind, CellUri, NotebookData, NotebookExtensionDescription, TransientOptions } from '../../common';
import { NotebookModel, NotebookModelFactory, NotebookModelProps } from '../view-model/notebook-model';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { NotebookCellModel, NotebookCellModelFactory, NotebookCellModelProps } from '../view-model/notebook-cell-model';

export const NotebookProvider = Symbol('notebook provider');

export interface SimpleNotebookProviderInfo {
    readonly notebookType: string,
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

    @inject(NotebookCellModelFactory)
    protected notebookCellModelFactory: (props: NotebookCellModelProps) => NotebookCellModel;

    private notebookSerializerEmitter = new Emitter<string>();
    readonly onNotebookSerializer = this.notebookSerializerEmitter.event;

    protected readonly disposables = new DisposableCollection();

    protected readonly notebookProviders = new Map<string, SimpleNotebookProviderInfo>();
    protected readonly notebookModels = new Map<string, NotebookModel>();

    private readonly didAddViewTypeEmitter = new Emitter<string>();
    readonly onDidAddViewType = this.didAddViewTypeEmitter.event;

    private readonly didRemoveViewTypeEmitter = new Emitter<string>();
    readonly onDidRemoveViewType = this.didRemoveViewTypeEmitter.event;

    private readonly willOpenNotebookTypeEmitter = new Emitter<string>();
    readonly onWillOpenNotebook = this.willOpenNotebookTypeEmitter.event;

    private readonly willAddNotebookDocumentEmitter = new Emitter<URI>();
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

    registerNotebookSerializer(notebookType: string, extensionData: NotebookExtensionDescription, serializer: NotebookSerializer): Disposable {
        if (this.notebookProviders.has(notebookType)) {
            throw new Error(`notebook provider for viewtype '${notebookType}' already exists`);
        }

        this.notebookProviders.set(notebookType, { notebookType: notebookType, serializer, extensionData });
        this.didAddViewTypeEmitter.fire(notebookType);

        return Disposable.create(() => {
            this.notebookProviders.delete(notebookType);
            this.didRemoveViewTypeEmitter.fire(notebookType);
        });
    }

    async createNotebookModel(data: NotebookData, viewType: string, uri: URI): Promise<NotebookModel> {
        const serializer = this.notebookProviders.get(viewType)?.serializer;
        if (!serializer) {
            throw new Error('no notebook serializer for ' + viewType);
        }

        this.willAddNotebookDocumentEmitter.fire(uri);
        const model = this.notebookModelFactory({ data, uri, viewType, serializer });
        this.notebookModels.set(uri.toString(), model);
        this.didAddNotebookDocumentEmitter.fire(model);
        return model;
    }

    createEmptyCellModel(notebookModel: NotebookModel, cellKind: CellKind): NotebookCellModel {
        const firstCodeCell = notebookModel.cells.find(cell => cell.cellKind === CellKind.Code);

        const handle = notebookModel.nextHandle++;
        return this.notebookCellModelFactory({
            uri: CellUri.generate(notebookModel.uri, handle),
            cellKind,
            handle,
            language: firstCodeCell?.language ?? '', // TODO if no code cell use kernel default language
            outputs: [],
            source: '',
        });
    }

    async getNotebookDataProvider(viewType: string): Promise<SimpleNotebookProviderInfo> {
        await this.notebookSerializerEmitter.sequence(async listener => listener(`onNotebookSerializer:${viewType}`));

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

    listNotebookDocuments(): NotebookModel[] {
        return [...this.notebookModels.values()];
    }
}
