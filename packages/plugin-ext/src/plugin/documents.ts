/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { DocumentsExt, ModelChangedEvent } from "../api/plugin-api";
import URI from "vscode-uri";
import { UriComponents } from '../common/uri-components';
import { RPCProtocol } from "../api/rpc-protocol";
import { Emitter, Event } from '@theia/core/lib/common/event';
import * as theia from '@theia/plugin';
import { DocumentDataExt } from "./document-data";
import { EditorsAndDocumentsExtImpl } from "./editors-and-documents";
import * as Converter from './type-converters';
import { DisposableCollection } from "@theia/core/lib/common/disposable";

export class DocumentsExtImpl implements DocumentsExt {
    private toDispose = new DisposableCollection();
    private _onDidAddDocument = new Emitter<theia.TextDocument>();
    private _onDidRemoveDocument = new Emitter<theia.TextDocument>();
    private _onDidChangeDocument = new Emitter<theia.TextDocumentChangeEvent>();
    private _onDidSaveDocument = new Emitter<theia.TextDocument>();

    readonly onDidAddDocument: Event<theia.TextDocument> = this._onDidAddDocument.event;
    readonly onDidRemoveDocument: Event<theia.TextDocument> = this._onDidRemoveDocument.event;
    readonly onDidChangeDocument: Event<theia.TextDocumentChangeEvent> = this._onDidChangeDocument.event;
    readonly onDidSaveDocument: Event<theia.TextDocument> = this._onDidSaveDocument.event;

    // private proxy: DocumentsMain;

    constructor(rpc: RPCProtocol, private editorsAndDocuments: EditorsAndDocumentsExtImpl) {
        // this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.DOCUMENTS_MAIN);
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
            this._onDidSaveDocument.fire(data.document);
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
}
