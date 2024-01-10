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
import { NotebookData, TransientOptions } from '../../common';
import { NotebookModel, NotebookModelFactory, NotebookModelProps } from '../view-model/notebook-model';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { NotebookCellModel, NotebookCellModelFactory, NotebookCellModelProps } from '../view-model/notebook-cell-model';
import { Deferred } from '@theia/core/lib/common/promise-util';

export const NotebookProvider = Symbol('notebook provider');

export interface NotebookProviderInfo {
    readonly notebookType: string,
    readonly serializer: NotebookSerializer,
}

export interface NotebookSerializer {
    options: TransientOptions;
    toNotebook(data: BinaryBuffer): Promise<NotebookData>;
    fromNotebook(data: NotebookData): Promise<BinaryBuffer>;
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

    protected willUseNotebookSerializerEmitter = new Emitter<string>();
    readonly onWillUseNotebookSerializer = this.willUseNotebookSerializerEmitter.event;

    protected readonly disposables = new DisposableCollection();

    protected readonly notebookProviders = new Map<string, NotebookProviderInfo>();
    protected readonly notebookModels = new Map<string, NotebookModel>();

    protected readonly didRegisterNotebookSerializerEmitter = new Emitter<string>();
    readonly onDidRegisterNotebookSerializer = this.didRegisterNotebookSerializerEmitter.event;

    protected readonly didRemoveViewTypeEmitter = new Emitter<string>();
    readonly onDidRemoveViewType = this.didRemoveViewTypeEmitter.event;

    protected readonly willOpenNotebookTypeEmitter = new Emitter<string>();
    readonly onWillOpenNotebook = this.willOpenNotebookTypeEmitter.event;

    protected readonly didAddNotebookDocumentEmitter = new Emitter<NotebookModel>();
    readonly onDidAddNotebookDocument = this.didAddNotebookDocumentEmitter.event;
    protected readonly didRemoveNotebookDocumentEmitter = new Emitter<NotebookModel>();
    readonly onDidRemoveNotebookDocument = this.didRemoveNotebookDocumentEmitter.event;

    dispose(): void {
        this.disposables.dispose();
    }

    protected readonly ready = new Deferred();

    /**
     * Marks the notebook service as ready. From this point on, the service will start dispatching the `onNotebookSerializer` event.
     */
    markReady(): void {
        this.ready.resolve();
    }

    registerNotebookSerializer(viewType: string, serializer: NotebookSerializer): Disposable {
        if (this.notebookProviders.has(viewType)) {
            throw new Error(`notebook provider for viewtype '${viewType}' already exists`);
        }

        this.notebookProviders.set(viewType, { notebookType: viewType, serializer });
        this.didRegisterNotebookSerializerEmitter.fire(viewType);

        return Disposable.create(() => {
            this.notebookProviders.delete(viewType);
            this.didRemoveViewTypeEmitter.fire(viewType);
        });
    }

    async createNotebookModel(data: NotebookData, viewType: string, uri: URI): Promise<NotebookModel> {
        const serializer = this.notebookProviders.get(viewType)?.serializer;
        if (!serializer) {
            throw new Error('no notebook serializer for ' + viewType);
        }

        const model = this.notebookModelFactory({ data, uri, viewType, serializer });
        this.notebookModels.set(uri.toString(), model);
        // Resolve cell text models right after creating the notebook model
        // This ensures that all text models are available in the plugin host
        await Promise.all(model.cells.map(e => e.resolveTextModel()));
        this.didAddNotebookDocumentEmitter.fire(model);
        return model;
    }

    async getNotebookDataProvider(viewType: string): Promise<NotebookProviderInfo> {
        await this.ready.promise;

        const result = await this.waitForNotebookProvider(viewType);
        if (!result) {
            throw new Error(`No provider registered for view type: '${viewType}'`);
        }
        return result;
    }

    /**
     * When the application starts up, notebook providers from plugins are not registered yet.
     * It takes a few seconds for the plugin host to start so that notebook data providers can be registered.
     * This methods waits until the notebook provider is registered.
     */
    protected async waitForNotebookProvider(type: string): Promise<NotebookProviderInfo | undefined> {
        if (this.notebookProviders.has(type)) {
            return this.notebookProviders.get(type);
        }
        const deferred = new Deferred<NotebookProviderInfo | undefined>();
        // 20 seconds of timeout
        const timeoutDuration = 20_000;

        // Must declare these variables where they can be captured by the closure
        let disposable: Disposable;
        // eslint-disable-next-line
        let timeout: ReturnType<typeof setTimeout>;

        // eslint-disable-next-line
        disposable = this.onDidRegisterNotebookSerializer(viewType => {
            if (viewType === type) {
                clearTimeout(timeout);
                disposable.dispose();
                deferred.resolve(this.notebookProviders.get(type));
            }
        });
        timeout = setTimeout(() => {
            clearTimeout(timeout);
            disposable.dispose();
            deferred.reject(new Error(`Timed out while waiting for notebook serializer for type ${type} to be registered`));
        }, timeoutDuration);

        await Promise.all(this.willUseNotebookSerializerEmitter.fire(type));

        return deferred.promise;
    }

    getNotebookEditorModel(uri: URI): NotebookModel | undefined {
        return this.notebookModels.get(uri.toString());
    }

    getNotebookModels(): Iterable<NotebookModel> {
        return this.notebookModels.values();
    }

    async willOpenNotebook(type: string): Promise<void> {
        return this.willOpenNotebookTypeEmitter.sequence(async listener => listener(type));
    }

    listNotebookDocuments(): NotebookModel[] {
        return [...this.notebookModels.values()];
    }
}
