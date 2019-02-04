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
import { DocumentsMain, MAIN_RPC_CONTEXT, DocumentsExt } from '../../api/plugin-api';
import { UriComponents } from '../../common/uri-components';
import { EditorsAndDocumentsMain } from './editors-and-documents-main';
import { DisposableCollection, Disposable } from '@theia/core';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { RPCProtocol } from '../../api/rpc-protocol';
import { EditorModelService } from './text-editor-model-service';
import { createUntitledResource } from './editor/untitled-resource';
import { EditorManager } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';
import CodeURI from 'vscode-uri';
import { ApplicationShell, OpenerOptions, Saveable } from '@theia/core/lib/browser';
import { TextDocumentShowOptions } from '../../api/model';
import { Range } from 'vscode-languageserver-types';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { ViewColumn } from '../../plugin/types-impl';

export class DocumentsMainImpl implements DocumentsMain {

    private proxy: DocumentsExt;
    private toDispose = new DisposableCollection();
    private modelToDispose = new Map<string, Disposable>();
    private modelIsSynced = new Map<string, boolean>();

    constructor(
        editorsAndDocuments: EditorsAndDocumentsMain,
        modelService: EditorModelService,
        rpc: RPCProtocol,
        private editorManger: EditorManager,
        private openerService: OpenerService
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

    async $tryCreateDocument(options?: { language?: string; content?: string; }): Promise<UriComponents> {
        const language = options && options.language;
        const content = options && options.content;
        return createUntitledResource(content, language);
    }

    async $tryOpenDocument(uri: UriComponents, options?: TextDocumentShowOptions): Promise<void> {
        // Removing try-catch block here makes it not possible to handle errors.
        // Following message is appeared in browser console
        //   - Uncaught (in promise) Error: Cannot read property 'message' of undefined.
        try {
            let openerOptions: OpenerOptions | undefined;
            if (options) {
                let range: Range | undefined;
                if (options.selection) {
                    const selection = options.selection;
                    range = {
                        start: { line: selection.startLineNumber - 1, character: selection.startColumn - 1 },
                        end: { line: selection.endLineNumber - 1, character: selection.endColumn - 1 }
                    };
                }
                let widgetOptions: ApplicationShell.WidgetOptions | undefined;
                if (options.viewColumn) {
                    const viewColumn = options.viewColumn;
                    const visibleEditors = this.editorManger.all;
                    let editorIndex = -1;
                    if (viewColumn > 0) {
                        editorIndex = viewColumn - 1;
                    } else {
                        const activeEditor = this.editorManger.activeEditor;
                        if (activeEditor) {
                            const activeEditorIndex = visibleEditors.indexOf(activeEditor);
                            if (viewColumn === ViewColumn.Active) {
                                editorIndex = activeEditorIndex;
                            } else if (viewColumn === ViewColumn.Beside) {
                                editorIndex = activeEditorIndex + 1;
                            }
                        }
                    }
                    if (editorIndex > -1 && visibleEditors.length > editorIndex) {
                        widgetOptions = { ref: visibleEditors[editorIndex] };
                    } else {
                        widgetOptions = { mode: 'split-right' };
                    }
                }
                openerOptions = {
                    selection: range,
                    mode: options.preserveFocus ? 'open' : 'activate',
                    preview: options.preview,
                    widgetOptions
                };
            }
            const uriArg = new URI(CodeURI.revive(uri));
            const opener = await this.openerService.getOpener(uriArg, openerOptions);
            await opener.open(uriArg, openerOptions);
        } catch (err) {
            throw new Error(err);
        }
    }

    async $trySaveDocument(uri: UriComponents): Promise<boolean> {
        const widget = await this.editorManger.getByUri(new URI(CodeURI.revive(uri)));
        if (widget) {
            await Saveable.save(widget);
            return true;
        }

        return false;
    }

}
