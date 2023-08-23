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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Disposable, DisposableCollection, Emitter, Event, URI } from '@theia/core';
import { URI as TheiaURI } from '../types-impl';
import * as theia from '@theia/plugin';
import {
    CommandRegistryExt, NotebookCellStatusBarListDto, NotebookDataDto,
    NotebookDocumentsAndEditorsDelta, NotebookDocumentsMain, NotebookEditorAddData, NotebooksExt, NotebooksMain, Plugin,
    PLUGIN_RPC_CONTEXT
} from '../../common';
import { Cache } from '../../common/cache';
import { RPCProtocol } from '../../common/rpc-protocol';
import { UriComponents } from '../../common/uri-components';
import { CommandsConverter } from '../command-registry';
// import { EditorsAndDocumentsExtImpl } from '../editors-and-documents';
import * as typeConverters from '../type-converters';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { NotebookDocument } from './notebook-document';
import { NotebookEditor } from './notebook-editor';
import { EditorsAndDocumentsExtImpl } from '../editors-and-documents';

export class NotebooksExtImpl implements NotebooksExt {

    private readonly notebookStatusBarItemProviders = new Map<number, theia.NotebookCellStatusBarItemProvider>();
    private readonly commandsConverter: CommandsConverter;

    private readonly DidChangeActiveNotebookEditorEmitter = new Emitter<theia.NotebookEditor | undefined>();
    readonly onDidChangeActiveNotebookEditor = this.DidChangeActiveNotebookEditorEmitter.event;

    private DidOpenNotebookDocumentEmitter = new Emitter<theia.NotebookDocument>();
    onDidOpenNotebookDocument: Event<theia.NotebookDocument> = this.DidOpenNotebookDocumentEmitter.event;
    private DidCloseNotebookDocumentEmitter = new Emitter<theia.NotebookDocument>();
    onDidCloseNotebookDocument: Event<theia.NotebookDocument> = this.DidCloseNotebookDocumentEmitter.event;

    private DidChangeVisibleNotebookEditorsEmitter = new Emitter<theia.NotebookEditor[]>();
    onDidChangeVisibleNotebookEditors = this.DidChangeVisibleNotebookEditorsEmitter.event;

    private activeNotebookEditor: NotebookEditor | undefined;
    get activeApiNotebookEditor(): theia.NotebookEditor | undefined {
        return this.activeNotebookEditor?.apiEditor;
    }

    private visibleNotebookEditors: NotebookEditor[] = [];
    get visibleApiNotebookEditors(): theia.NotebookEditor[] {
        return this.visibleNotebookEditors.map(editor => editor.apiEditor);
    }

    private readonly documents = new Map<string, NotebookDocument>();
    private readonly editors = new Map<string, NotebookEditor>();
    private statusBarRegistry = new Cache<Disposable>('NotebookCellStatusBarCache');

    private notebookProxy: NotebooksMain;
    private notebookDocumentsProxy: NotebookDocumentsMain;

    constructor(
        rpc: RPCProtocol,
        commands: CommandRegistryExt,
        private textDocumentsAndEditors: EditorsAndDocumentsExtImpl,
    ) {
        this.notebookProxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.NOTEBOOKS_MAIN);
        this.notebookDocumentsProxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.NOTEBOOK_DOCUMENTS_MAIN);

        commands.registerArgumentProcessor({
            processArgument: (arg: { uri: URI }) => {
                if (arg && arg.uri && this.documents.has(arg.uri.toString())) {
                    return this.documents.get(arg.uri.toString())?.apiNotebook;
                }
                return arg;
            }
        });
    }

    async $provideNotebookCellStatusBarItems(handle: number, uri: UriComponents, index: number, token: CancellationToken): Promise<NotebookCellStatusBarListDto | undefined> {
        const provider = this.notebookStatusBarItemProviders.get(handle);
        const revivedUri = URI.fromComponents(uri);
        const document = this.documents.get(revivedUri.toString());
        if (!document || !provider) {
            return;
        }

        const cell = document.getCellFromIndex(index);
        if (!cell) {
            return;
        }

        const result = await provider.provideCellStatusBarItems(cell.apiCell, token);
        if (!result) {
            return undefined;
        }

        const disposables = new DisposableCollection();
        const cacheId = this.statusBarRegistry.add([disposables]);
        const resultArr = Array.isArray(result) ? result : [result];
        const items = resultArr.map(item => typeConverters.NotebookStatusBarItem.from(item, this.commandsConverter, disposables));
        return {
            cacheId,
            items
        };
    }

    $releaseNotebookCellStatusBarItems(cacheId: number): void {
        this.statusBarRegistry.delete(cacheId);
    }

    // --- serialize/deserialize

    private currentSerializerHandle = 0;
    private readonly notebookSerializer = new Map<number, theia.NotebookSerializer>();

    registerNotebookSerializer(plugin: Plugin, viewType: string, serializer: theia.NotebookSerializer,
        options?: theia.NotebookDocumentContentOptions): theia.Disposable {
        if (!viewType || !viewType.trim()) {
            throw new Error('viewType cannot be empty or just whitespace');
        }
        const handle = this.currentSerializerHandle++;
        this.notebookSerializer.set(handle, serializer);
        this.notebookProxy.$registerNotebookSerializer(
            handle,
            { id: plugin.model.id, location: plugin.pluginUri },
            viewType,
            typeConverters.NotebookDocumentContentOptions.from(options),
        );
        return Disposable.create(() => {
            this.notebookProxy.$unregisterNotebookSerializer(handle);
        });
    }

    async $dataToNotebook(handle: number, bytes: BinaryBuffer, token: CancellationToken): Promise<NotebookDataDto> {
        const serializer = this.notebookSerializer.get(handle);
        if (!serializer) {
            throw new Error('No serializer found');
        }
        const data = await serializer.deserializeNotebook(bytes.buffer, token);
        return typeConverters.NotebookData.from(data);
    }

    async $notebookToData(handle: number, data: NotebookDataDto, token: CancellationToken): Promise<BinaryBuffer> {
        const serializer = this.notebookSerializer.get(handle);
        if (!serializer) {
            throw new Error('No serializer found');
        }
        const bytes = await serializer.serializeNotebook(typeConverters.NotebookData.to(data), token);
        return BinaryBuffer.wrap(bytes);
    }

    registerNotebookCellStatusBarItemProvider(notebookType: string, provider: theia.NotebookCellStatusBarItemProvider): theia.Disposable {

        const handle = this.currentSerializerHandle++;
        const eventHandle = typeof provider.onDidChangeCellStatusBarItems === 'function' ? this.currentSerializerHandle++ : undefined;

        this.notebookStatusBarItemProviders.set(handle, provider);
        this.notebookProxy.$registerNotebookCellStatusBarItemProvider(handle, eventHandle, notebookType);

        let subscription: theia.Disposable | undefined;
        if (eventHandle !== undefined) {
            subscription = provider.onDidChangeCellStatusBarItems!(_ => this.notebookProxy.$emitCellStatusBarEvent(eventHandle));
        }

        return Disposable.create(() => {
            this.notebookStatusBarItemProviders.delete(handle);
            this.notebookProxy.$unregisterNotebookCellStatusBarItemProvider(handle, eventHandle);
            subscription?.dispose();
        });
    }

    getEditorById(editorId: string): NotebookEditor {
        const editor = this.editors.get(editorId);
        if (!editor) {
            throw new Error(`unknown text editor: ${editorId}. known editors: ${[...this.editors.keys()]} `);
        }
        return editor;
    }

    async $acceptDocumentsAndEditorsDelta(delta: NotebookDocumentsAndEditorsDelta): Promise<void> {
        if (delta.removedDocuments) {
            for (const uri of delta.removedDocuments) {
                const revivedUri = URI.fromComponents(uri);
                const document = this.documents.get(revivedUri.toString());

                if (document) {
                    document.dispose();
                    this.documents.delete(revivedUri.toString());
                    // this.editorsAndDocuments.$acceptEditorsAndDocumentsDelta({ removedDocuments: document.apiNotebook.getCells().map(cell => cell.document.uri) });
                    this.DidCloseNotebookDocumentEmitter.fire(document.apiNotebook);
                }

                for (const editor of this.editors.values()) {
                    if (editor.notebookData.uri.toString() === revivedUri.toString()) {
                        this.editors.delete(editor.id);
                    }
                }
            }
        }

        if (delta.addedDocuments) {
            for (const modelData of delta.addedDocuments) {
                const uri = TheiaURI.from(modelData.uri);

                if (this.documents.has(uri.toString())) {
                    throw new Error(`adding EXISTING notebook ${uri} `);
                }

                const document = new NotebookDocument(
                    this.notebookDocumentsProxy,
                    this.textDocumentsAndEditors,
                    uri,
                    modelData
                );

                // add cell document as theia.TextDocument
                // TODO use this optimization. Currently cellDocuments are created one by one by the moanacotTextModel service
                // This allways creates a new Document when creating a new TextModel Reference. So we need to find a wayto create textmodels from existing documents

                // const addedCellDocuments: ModelAddedData[] = [];
                // addedCellDocuments.push(...modelData.cells.map(cell => Cell.asModelAddData(document.apiNotebook, cell)));
                // this.textDocumentsAndEditors.$acceptEditorsAndDocumentsDelta({ addedDocuments: addedCellDocuments });

                this.documents.get(uri.toString())?.dispose();
                this.documents.set(uri.toString(), document);

                this.DidOpenNotebookDocumentEmitter.fire(document.apiNotebook);
            }
        }

        if (delta.addedEditors) {
            for (const editorModelData of delta.addedEditors) {
                if (this.editors.has(editorModelData.id)) {
                    return;
                }

                const revivedUri = URI.fromComponents(editorModelData.documentUri);
                const document = this.documents.get(revivedUri.toString());

                if (document) {
                    this.createExtHostEditor(document, editorModelData.id, editorModelData);
                }
            }
        }

        const removedEditors: NotebookEditor[] = [];

        if (delta.removedEditors) {
            for (const editorid of delta.removedEditors) {
                const editor = this.editors.get(editorid);

                if (editor) {
                    this.editors.delete(editorid);

                    if (this.activeNotebookEditor?.id === editor.id) {
                        this.activeNotebookEditor = undefined;
                    }

                    removedEditors.push(editor);
                }
            }
        }

        if (delta.visibleEditors) {
            this.visibleNotebookEditors = delta.visibleEditors.map(id => this.editors.get(id)!).filter(editor => !!editor) as NotebookEditor[];
            const visibleEditorsSet = new Set<string>();
            this.visibleNotebookEditors.forEach(editor => visibleEditorsSet.add(editor.id));

            for (const editor of this.editors.values()) {
                const newValue = visibleEditorsSet.has(editor.id);
                editor.acceptVisibility(newValue);
            }

            this.visibleNotebookEditors = [...this.editors.values()].map(e => e).filter(e => e.visible);
            this.DidChangeVisibleNotebookEditorsEmitter.fire(this.visibleApiNotebookEditors);
        }

        if (delta.newActiveEditor === null) {
            // clear active notebook as current active editor is non-notebook editor
            this.activeNotebookEditor = undefined;
        } else if (delta.newActiveEditor) {
            const activeEditor = this.editors.get(delta.newActiveEditor);
            if (!activeEditor) {
                console.error(`FAILED to find active notebook editor ${delta.newActiveEditor}`);
            }
            this.activeNotebookEditor = this.editors.get(delta.newActiveEditor);
        }
        if (delta.newActiveEditor !== undefined) {
            this.DidChangeActiveNotebookEditorEmitter.fire(this.activeNotebookEditor?.apiEditor);
        }
    }

    getNotebookDocument(uri: URI, relaxed: true): NotebookDocument | undefined;
    getNotebookDocument(uri: URI): NotebookDocument;
    getNotebookDocument(uri: URI, relaxed?: true): NotebookDocument | undefined {
        const result = this.documents.get(uri.toString());
        if (!result && !relaxed) {
            throw new Error(`NO notebook document for '${uri}'`);
        }
        return result;
    }

    private createExtHostEditor(document: NotebookDocument, editorId: string, data: NotebookEditorAddData): void {

        if (this.editors.has(editorId)) {
            throw new Error(`editor with id ALREADY EXSIST: ${editorId}`);
        }

        const editor = new NotebookEditor(
            editorId,
            document,
            data.visibleRanges.map(typeConverters.NotebookRange.to),
            data.selections.map(typeConverters.NotebookRange.to),
            typeof data.viewColumn === 'number' ? typeConverters.ViewColumn.to(data.viewColumn) : undefined
        );

        this.editors.set(editorId, editor);
    }

}
