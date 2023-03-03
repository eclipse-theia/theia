// *****************************************************************************
// Copyright (C) 2023 Red Hat, Inc. and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Disposable, DisposableCollection, Emitter, Event } from '@theia/core';
import * as theia from '@theia/plugin';
import { NotebookCellStatusBarListDto, NotebookDataDto, NotebookDocumentsAndEditorsDelta, NotebooksExt, NotebooksMain, Plugin, PLUGIN_RPC_CONTEXT } from '../../common';
import { Cache } from '../../common/cache';
import { RPCProtocol } from '../../common/rpc-protocol';
import { UriComponents } from '../../common/uri-components';
import { CommandsConverter } from '../command-registry';
// import { EditorsAndDocumentsExtImpl } from '../editors-and-documents';
import { URI } from '../types-impl';
import * as typeConverters from '../type-converters';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { NotebookDocument } from './notebook-document';
import { NotebookEditorExtImpl } from './notebook-editor';

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

    private readonly documents = new Map<URI, NotebookDocument>();
    private readonly editors = new Map<string, NotebookEditorExtImpl>();
    private statusBarCache = new Cache<Disposable>('NotebookCellStatusBarCache');

    private notebookProxy: NotebooksMain;

    constructor(
        rpc: RPCProtocol,
        // private editorsAndDocuments: EditorsAndDocumentsExtImpl
    ) {
        this.notebookProxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.NOTEBOOKS_MAIN);
    }

    async $provideNotebookCellStatusBarItems(handle: number, uri: UriComponents, index: number, token: CancellationToken): Promise<NotebookCellStatusBarListDto | undefined> {
        const provider = this.notebookStatusBarItemProviders.get(handle);
        const revivedUri = URI.revive(uri);
        const document = this.documents.get(revivedUri);
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
        const cacheId = this.statusBarCache.add([disposables]);
        const resultArr = Array.isArray(result) ? result : [result];
        const items = resultArr.map(item => typeConverters.NotebookStatusBarItem.from(item, this.commandsConverter, disposables));
        return {
            cacheId,
            items
        };
    }

    $releaseNotebookCellStatusBarItems(cacheId: number): void {
        this.statusBarCache.delete(cacheId);
    }

    // --- serialize/deserialize

    private _handlePool = 0;
    private readonly _notebookSerializer = new Map<number, theia.NotebookSerializer>();

    registerNotebookSerializer(plugin: Plugin, viewType: string, serializer: theia.NotebookSerializer,
        options?: theia.NotebookDocumentContentOptions): theia.Disposable {
        if (!viewType || !viewType.trim()) {
            throw new Error('viewType cannot be empty or just whitespace');
        }
        const handle = this._handlePool++;
        this._notebookSerializer.set(handle, serializer);
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
        const serializer = this._notebookSerializer.get(handle);
        if (!serializer) {
            throw new Error('NO serializer found');
        }
        const data = await serializer.deserializeNotebook(bytes.buffer, token);
        return typeConverters.NotebookData.from(data);
    }

    async $notebookToData(handle: number, data: NotebookDataDto, token: CancellationToken): Promise<BinaryBuffer> {
        const serializer = this._notebookSerializer.get(handle);
        if (!serializer) {
            throw new Error('NO serializer found');
        }
        const bytes = await serializer.serializeNotebook(typeConverters.NotebookData.to(data), token);
        return BinaryBuffer.wrap(bytes);
    }

    registerNotebookCellStatusBarItemProvider(notebookType: string, provider: theia.NotebookCellStatusBarItemProvider): theia.Disposable {

        const handle = this._handlePool++;
        const eventHandle = typeof provider.onDidChangeCellStatusBarItems === 'function' ? this._handlePool++ : undefined;

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

    getEditorById(editorId: string): NotebookEditorExtImpl {
        const editor = this.editors.get(editorId);
        if (!editor) {
            throw new Error(`unknown text editor: ${editorId}. known editors: ${[...this.editors.keys()]} `);
        }
        return editor;
    }

    $acceptDocumentAndEditorsDelta(delta: NotebookDocumentsAndEditorsDelta): void {

        // if (delta.removedDocuments) {
        //     for (const uri of delta.removedDocuments) {
        //         const revivedUri = URI.revive(uri);
        //         const document = this.documents.get(revivedUri);

        //         if (document) {
        //             document.dispose();
        //             this.documents.delete(revivedUri);
        //             this.editorsAndDocuments.$acceptEditorsAndDocumentsDelta({ removedDocuments: document.apiNotebook.getCells().map(cell => cell.document.uri) });
        //             this.DidCloseNotebookDocumentEmitter.fire(document.apiNotebook);
        //         }

        //         for (const editor of this._editors.values()) {
        //             if (editor.notebookData.uri.toString() === revivedUri.toString()) {
        //                 this._editors.delete(editor.id);
        //             }
        //         }
        //     }
        // }

        // if (delta.addedDocuments) {

        //     const addedCellDocuments: IModelAddedData[] = [];

        //     for (const modelData of delta.value.addedDocuments) {
        //         const uri = URI.revive(modelData.uri);

        //         if (this.documents.has(uri)) {
        //             throw new Error(`adding EXISTING notebook ${uri} `);
        //         }

        //         const document = new ExtHostNotebookDocument(
        //             this._notebookDocumentsProxy,
        //             this._textDocumentsAndEditors,
        //             this.documents,
        //             uri,
        //             modelData
        //         );

        //         // add cell document as theia.TextDocument
        //         addedCellDocuments.push(...modelData.cells.map(cell => ExtHostCell.asModelAddData(document.apiNotebook, cell)));

        //         this.documents.get(uri)?.dispose();
        //         this.documents.set(uri, document);
        //         this._textDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ addedDocuments: addedCellDocuments });

        //         this.DidOpenNotebookDocumentEmitter.fire(document.apiNotebook);
        //     }
        // }

        // if (delta.addedEditors) {
        //     for (const editorModelData of delta.value.addedEditors) {
        //         if (this._editors.has(editorModelData.id)) {
        //             return;
        //         }

        //         const revivedUri = URI.revive(editorModelData.documentUri);
        //         const document = this.documents.get(revivedUri);

        //         if (document) {
        //             this._createExtHostEditor(document, editorModelData.id, editorModelData);
        //         }
        //     }
        // }

        // const removedEditors: ExtHostNotebookEditor[] = [];

        // if (delta.removedEditors) {
        //     for (const editorid of delta.removedEditors) {
        //         const editor = this._editors.get(editorid);

        //         if (editor) {
        //             this._editors.delete(editorid);

        //             if (this._activeNotebookEditor?.id === editor.id) {
        //                 this._activeNotebookEditor = undefined;
        //             }

        //             removedEditors.push(editor);
        //         }
        //     }
        // }

        // if (delta.visibleEditors) {
        //     this._visibleNotebookEditors = delta.visibleEditors.map(id => this._editors.get(id)!).filter(editor => !!editor) as ExtHostNotebookEditor[];
        //     const visibleEditorsSet = new Set<string>();
        //     this._visibleNotebookEditors.forEach(editor => visibleEditorsSet.add(editor.id));

        //     for (const editor of this._editors.values()) {
        //         const newValue = visibleEditorsSet.has(editor.id);
        //         editor._acceptVisibility(newValue);
        //     }

        //     this._visibleNotebookEditors = [...this._editors.values()].map(e => e).filter(e => e.visible);
        //     this.DidChangeVisibleNotebookEditorsEmitter.fire(this.visibleNotebookEditors);
        // }

        // if (delta.value.newActiveEditor === null) {
        //     // clear active notebook as current active editor is non-notebook editor
        //     this._activeNotebookEditor = undefined;
        // } else if (delta.value.newActiveEditor) {
        //     const activeEditor = this._editors.get(delta.value.newActiveEditor);
        //     if (!activeEditor) {
        //         console.error(`FAILED to find active notebook editor ${delta.value.newActiveEditor}`);
        //     }
        //     this._activeNotebookEditor = this._editors.get(delta.value.newActiveEditor);
        // }
        // if (delta.value.newActiveEditor !== undefined) {
        //     this.DidChangeActiveNotebookEditorEmitter.fire(this._activeNotebookEditor?.apiEditor);
        // }
    }
}
