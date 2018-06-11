/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { DocumentsMain, MAIN_RPC_CONTEXT, DocumentsExt } from "../../api/plugin-api";
import { UriComponents } from "../../common/uri-components";
import { EditorsAndDocumentsMain } from "./editors-and-documents-main";
import { DisposableCollection, Disposable } from "@theia/core";
import { MonacoEditorModel } from "@theia/monaco/lib/browser/monaco-editor-model";
import { RPCProtocol } from "../../api/rpc-protocol";
import { EditorModelService } from "./text-editor-model-service";

export class DocumentsMainImpl implements DocumentsMain {
    private proxy: DocumentsExt;
    private toDispose = new DisposableCollection();
    private modelToDispose = new Map<string, Disposable>();
    private modelIsSynced = new Map<string, boolean>();

    constructor(
        editorsAndDocuments: EditorsAndDocumentsMain,
        modelService: EditorModelService,
        rpc: RPCProtocol
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.DOCUMENTS_EXT);

        this.toDispose.push(editorsAndDocuments.onDocumentAdd(documents => documents.forEach(this.onModelAdded, this)));
        this.toDispose.push(editorsAndDocuments.onDocumentRemove(documents => documents.forEach(this.onModelRemoved, this)));
        this.toDispose.push(modelService.onModelModeChanged(this.onModelChanged, this));

        this.toDispose.push(modelService.onModelSaved(m => {
            this.proxy.$acceptModelSaved(m.textEditorModel.uri);
        }));
        this.toDispose.push(modelService.onModelDirtyChanged(m => {
            this.proxy.$acceptDirtyStateChanged(m.textEditorModel.uri, m.dirty);
        }));
    }

    dispose(): void {
        this.modelToDispose.forEach(val => val.dispose());
        this.modelToDispose = new Map();
        this.toDispose.dispose();
    }

    private onModelChanged(event: { model: MonacoEditorModel, oldModeId: string }): void {
        const modelUrl = event.model.textEditorModel.uri;
        if (!this.modelIsSynced.get(modelUrl.toString())) {
            return;
        }

        this.proxy.$acceptModelModeChanged(modelUrl, event.oldModeId, event.model.languageId);
    }

    private onModelAdded(model: MonacoEditorModel): void {
        const modelUrl = model.textEditorModel.uri;
        this.modelIsSynced.set(modelUrl.toString(), true);
        this.modelToDispose.set(modelUrl.toString(), model.textEditorModel.onDidChangeContent(e => {
            this.proxy.$acceptModelChanged(modelUrl, {
                eol: e.eol,
                versionId: e.versionId,
                changes: e.changes.map(c =>
                    ({
                        text: c.text,
                        range: c.range,
                        rangeLength: c.rangeLength,
                        rangeOffset: 0
                    }))
            }, model.dirty);
        }));

    }

    private onModelRemoved(url: monaco.Uri): void {
        const modelUrl = url.toString();
        if (!this.modelIsSynced.get(modelUrl)) {
            return;
        }

        this.modelIsSynced.delete(modelUrl);
        this.modelToDispose.get(modelUrl)!.dispose();
        this.modelToDispose.delete(modelUrl);
    }

    $tryCreateDocument(options?: { language?: string | undefined; content?: string | undefined; } | undefined): Promise<UriComponents> {
        throw new Error("Method not implemented.");
    }
    $tryOpenDocument(uri: UriComponents): Promise<void> {
        throw new Error("Method not implemented.");
    }
    $trySaveDocument(uri: UriComponents): Promise<boolean> {
        throw new Error("Method not implemented.");
    }
}
