/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
import { DocumentsExt, ModelChangedEvent, PLUGIN_RPC_CONTEXT, DocumentsMain } from '../api/plugin-api';
import URI from 'vscode-uri';
import { UriComponents } from '../common/uri-components';
import { RPCProtocol } from '../api/rpc-protocol';
import { Emitter, Event } from '@theia/core/lib/common/event';
import * as theia from '@theia/plugin';
import { DocumentDataExt, setWordDefinitionFor } from './document-data';
import { EditorsAndDocumentsExtImpl } from './editors-and-documents';
import * as Converter from './type-converters';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { Range } from '../api/model';

export class DocumentsExtImpl implements DocumentsExt {
    private toDispose = new DisposableCollection();
    private _onDidAddDocument = new Emitter<theia.TextDocument>();
    private _onDidRemoveDocument = new Emitter<theia.TextDocument>();
    private _onDidChangeDocument = new Emitter<theia.TextDocumentChangeEvent>();
    private _onDidSaveTextDocument = new Emitter<theia.TextDocument>();

    readonly onDidAddDocument: Event<theia.TextDocument> = this._onDidAddDocument.event;
    readonly onDidRemoveDocument: Event<theia.TextDocument> = this._onDidRemoveDocument.event;
    readonly onDidChangeDocument: Event<theia.TextDocumentChangeEvent> = this._onDidChangeDocument.event;
    readonly onDidSaveTextDocument: Event<theia.TextDocument> = this._onDidSaveTextDocument.event;

    private proxy: DocumentsMain;
    private loadingDocuments = new Map<string, Promise<DocumentDataExt | undefined>>();

    constructor(rpc: RPCProtocol, private editorsAndDocuments: EditorsAndDocumentsExtImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.DOCUMENTS_MAIN);
        this.toDispose.push(
            this.editorsAndDocuments.onDidAddDocuments(documents => {
                for (const document of documents) {
                    this._onDidAddDocument.fire(document.document);
                }
            })
        );

        this.toDispose.push(
            this.editorsAndDocuments.onDidRemoveDocuments(documents => {
                for (const data of documents) {
                    this._onDidRemoveDocument.fire(data.document);
                }
            })
        );
    }
    $acceptModelModeChanged(startUrl: UriComponents, oldModeId: string, newModeId: string): void {
        const uri = URI.revive(startUrl);
        const uriString = uri.toString();

        const data = this.editorsAndDocuments.getDocument(uriString);
        if (data) {
            this._onDidRemoveDocument.fire(data.document);
            data.acceptLanguageId(newModeId);
            this._onDidAddDocument.fire(data.document);
        }
    }
    $acceptModelSaved(strUrl: UriComponents): void {
        const uri = URI.revive(strUrl);
        const uriString = uri.toString();
        const data = this.editorsAndDocuments.getDocument(uriString);
        this.$acceptDirtyStateChanged(strUrl, false);
        if (data) {
            this._onDidSaveTextDocument.fire(data.document);
        }
    }
    $acceptDirtyStateChanged(strUrl: UriComponents, isDirty: boolean): void {
        const uri = URI.revive(strUrl);
        const uriString = uri.toString();
        const data = this.editorsAndDocuments.getDocument(uriString);
        if (data) {
            data.acceptIsDirty(isDirty);
            this._onDidChangeDocument.fire({
                document: data.document,
                contentChanges: []
            });
        }
    }
    $acceptModelChanged(strUrl: UriComponents, e: ModelChangedEvent, isDirty: boolean): void {
        const uri = URI.revive(strUrl);
        const uriString = uri.toString();
        const data = this.editorsAndDocuments.getDocument(uriString);
        if (data) {
            data.acceptIsDirty(isDirty);
            data.onEvents(e);
            this._onDidChangeDocument.fire({
                document: data.document,
                contentChanges: e.changes.map(change =>
                    ({
                        range: Converter.toRange(change.range),
                        rangeOffset: change.rangeOffset,
                        rangeLength: change.rangeLength,
                        text: change.text
                    }))
            });
        }
    }
    getAllDocumentData(): DocumentDataExt[] {
        return this.editorsAndDocuments.allDocuments();
    }

    getDocumentData(resource: theia.Uri): DocumentDataExt | undefined {
        if (resource) {
            return this.editorsAndDocuments.getDocument(resource.toString());
        }

        return undefined;
    }

    async openDocument(uri: URI, options?: theia.TextDocumentShowOptions): Promise<DocumentDataExt | undefined> {
        const cached = this.editorsAndDocuments.getDocument(uri.toString());
        if (cached) {
            return cached;
        }

        // Determine whether the document is already loading
        const loadingDocument = this.loadingDocuments.get(uri.toString());
        if (loadingDocument) {
            // return the promise if document is already loading
            return loadingDocument;
        }

        try {
            // start opening document
            const document = this.loadDocument(uri, options);
            // add loader to the map
            this.loadingDocuments.set(uri.toString(), document);
            // wait the document being opened
            await document;
            // retun opened document
            return document;
        } catch (error) {
            return Promise.reject(error);
        } finally {
            // remove loader from the map
            this.loadingDocuments.delete(uri.toString());
        }
    }

    private async loadDocument(uri: URI, options?: theia.TextDocumentShowOptions): Promise<DocumentDataExt | undefined> {
        let range: Range | undefined;
        if (options && options.selection) {
            const { start, end } = options.selection;
            range = {
                startLineNumber: start.line,
                startColumn: start.character,
                endLineNumber: end.line,
                endColumn: end.character
            };
        }
        await this.proxy.$tryOpenDocument(uri, { selection: range });
        return this.editorsAndDocuments.getDocument(uri.toString());
    }

    async createDocumentData(options?: { language?: string; content?: string }): Promise<URI> {
        return this.proxy.$tryCreateDocument(options).then(data => URI.revive(data));
    }

    setWordDefinitionFor(modeId: string, wordDefinition: RegExp | null): void {
        setWordDefinitionFor(modeId, wordDefinition);
    }

}
