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
import { DocumentsMain, MAIN_RPC_CONTEXT, DocumentsExt } from "../../api/plugin-api";
import { UriComponents } from "../../common/uri-components";
import { EditorsAndDocumentsMain } from "./editors-and-documents-main";
import { DisposableCollection, Disposable } from "@theia/core";
import { MonacoEditorModel } from "@theia/monaco/lib/browser/monaco-editor-model";
import { RPCProtocol } from "../../api/rpc-protocol";
import { EditorModelService } from "./text-editor-model-service";
import { createUntitledResource } from "./editor/untitled-resource";
import { EditorManager } from "@theia/editor/lib/browser";
import URI from "@theia/core/lib/common/uri";
import { Saveable } from "@theia/core/lib/browser";

export class DocumentsMainImpl implements DocumentsMain {
    private proxy: DocumentsExt;
    private toDispose = new DisposableCollection();
    private modelToDispose = new Map<string, Disposable>();
    private modelIsSynced = new Map<string, boolean>();

    constructor(
        editorsAndDocuments: EditorsAndDocumentsMain,
        modelService: EditorModelService,
        rpc: RPCProtocol,
        private editorManger: EditorManager
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

    $tryCreateDocument(options?: { language?: string; content?: string; }): Promise<UriComponents> {
        let language;
        let content;
        if (options) {
            language = options.language;
            content = options.content;
        }
        return Promise.resolve(createUntitledResource(content, language));
    }

    $tryOpenDocument(uri: UriComponents): Promise<void> {
        return this.editorManger.open(new URI(uri.external!)).then(() => void 0);
    }

    $trySaveDocument(uri: UriComponents): Promise<boolean> {
        return this.editorManger.getByUri(new URI(uri.external!)).then(e => {
            if (e) {
                return Saveable.save(e).then(() => true);
            }
            return Promise.resolve(false);
        });
    }
}
