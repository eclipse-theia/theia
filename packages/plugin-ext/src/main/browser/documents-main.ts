// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
import { DocumentsMain, MAIN_RPC_CONTEXT, DocumentsExt } from '../../common/plugin-api-rpc';
import { UriComponents } from '../../common/uri-components';
import { EditorsAndDocumentsMain } from './editors-and-documents-main';
import { DisposableCollection, Disposable, UntitledResourceResolver } from '@theia/core';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { RPCProtocol } from '../../common/rpc-protocol';
import { EditorModelService } from './text-editor-model-service';
import { EditorOpenerOptions, EncodingMode } from '@theia/editor/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { URI as CodeURI } from '@theia/core/shared/vscode-uri';
import { ApplicationShell, SaveReason } from '@theia/core/lib/browser';
import { TextDocumentShowOptions } from '../../common/plugin-api-rpc-model';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { Reference } from '@theia/core/lib/common/reference';
import { dispose } from '../../common/disposable-util';
import { MonacoLanguages } from '@theia/monaco/lib/browser/monaco-languages';
import * as monaco from '@theia/monaco-editor-core';
import { TextDocumentChangeReason } from '../../plugin/types-impl';
import { NotebookDocumentsMainImpl } from './notebooks/notebook-documents-main';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class ModelReferenceCollection {

    private data = new Array<{ length: number, dispose(): void }>();
    private length = 0;

    constructor(
        private readonly maxAge: number = 1000 * 60 * 3,
        private readonly maxLength: number = 1024 * 1024 * 80
    ) { }

    dispose(): void {
        this.data = dispose(this.data) || [];
    }

    add(ref: Reference<MonacoEditorModel>): void {
        const length = ref.object.textEditorModel.getValueLength();
        const handle = setTimeout(_dispose, this.maxAge);
        const entry = { length, dispose: _dispose };
        const self = this;
        function _dispose(): void {
            const idx = self.data.indexOf(entry);
            if (idx >= 0) {
                self.length -= length;
                ref.dispose();
                clearTimeout(handle);
                self.data.splice(idx, 1);
            }
        };

        this.data.push(entry);
        this.length += length;
        this.cleanup();
    }

    private cleanup(): void {
        while (this.length > this.maxLength) {
            this.data[0].dispose();
        }
    }
}

export class DocumentsMainImpl implements DocumentsMain, Disposable {

    private readonly proxy: DocumentsExt;
    private readonly syncedModels = new Map<string, Disposable>();
    private readonly modelReferenceCache = new ModelReferenceCollection();

    protected saveTimeout = 1750;

    private readonly toDispose = new DisposableCollection(this.modelReferenceCache);

    constructor(
        editorsAndDocuments: EditorsAndDocumentsMain,
        notebookDocuments: NotebookDocumentsMainImpl,
        private readonly modelService: EditorModelService,
        rpc: RPCProtocol,
        private openerService: OpenerService,
        private shell: ApplicationShell,
        private untitledResourceResolver: UntitledResourceResolver,
        private languageService: MonacoLanguages
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.DOCUMENTS_EXT);

        this.toDispose.push(editorsAndDocuments);
        this.toDispose.push(editorsAndDocuments.onDocumentAdd(documents => documents.forEach(this.onModelAdded, this)));
        this.toDispose.push(editorsAndDocuments.onDocumentRemove(documents => documents.forEach(this.onModelRemoved, this)));
        this.toDispose.push(modelService.onModelModeChanged(this.onModelChanged, this));

        this.toDispose.push(notebookDocuments.onDidAddNotebookCellModel(this.onModelAdded, this));

        this.toDispose.push(modelService.onModelSaved(m => {
            this.proxy.$acceptModelSaved(m.textEditorModel.uri);
        }));
        this.toDispose.push(modelService.onModelWillSave(async e => {

            const saveReason = e.options?.saveReason ?? SaveReason.Manual;

            const edits = await this.proxy.$acceptModelWillSave(new URI(e.model.uri).toComponents(), saveReason.valueOf(), this.saveTimeout);
            const editOperations: monaco.editor.IIdentifiedSingleEditOperation[] = [];
            for (const edit of edits) {
                const { range, text } = edit;
                if (!range && !text) {
                    continue;
                }
                if (range && range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn && !edit.text) {
                    continue;
                }

                editOperations.push({
                    range: range ? monaco.Range.lift(range) : e.model.textEditorModel.getFullModelRange(),
                    /* eslint-disable-next-line no-null/no-null */
                    text: text || null,
                    forceMoveMarkers: edit.forceMoveMarkers
                });
            }
            e.model.textEditorModel.applyEdits(editOperations);
        }));
        this.toDispose.push(modelService.onModelDirtyChanged(m => {
            this.proxy.$acceptDirtyStateChanged(m.textEditorModel.uri, m.dirty);
        }));
        this.toDispose.push(modelService.onModelEncodingChanged(e => {
            this.proxy.$acceptEncodingChanged(e.model.textEditorModel.uri, e.encoding);
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    private onModelChanged(event: { model: MonacoEditorModel, oldModeId: string }): void {
        const modelUrl = event.model.textEditorModel.uri;
        if (this.syncedModels.has(modelUrl.toString())) {
            this.proxy.$acceptModelModeChanged(modelUrl, event.oldModeId, event.model.languageId);
        }
    }

    private onModelAdded(model: MonacoEditorModel): void {
        const modelUri = model.textEditorModel.uri;
        const key = modelUri.toString();

        const toDispose = new DisposableCollection(
            model.textEditorModel.onDidChangeContent(e =>
                this.proxy.$acceptModelChanged(modelUri, {
                    eol: e.eol,
                    versionId: e.versionId,
                    reason: e.isRedoing ? TextDocumentChangeReason.Redo : e.isUndoing ? TextDocumentChangeReason.Undo : undefined,
                    changes: e.changes.map(c =>
                    ({
                        text: c.text,
                        range: c.range,
                        rangeLength: c.rangeLength,
                        rangeOffset: c.rangeOffset
                    }))
                }, model.dirty)
            ),
            Disposable.create(() => this.syncedModels.delete(key))
        );
        this.syncedModels.set(key, toDispose);
        this.toDispose.push(toDispose);
    }

    private onModelRemoved(url: monaco.Uri): void {
        const model = this.syncedModels.get(url.toString());
        if (model) {
            model.dispose();
        }
    }

    async $tryCreateDocument(options?: { language?: string; content?: string; encoding?: string }): Promise<UriComponents> {
        const language = options?.language && this.languageService.getExtension(options.language);
        const content = options?.content;
        const encoding = options?.encoding;
        const resource = await this.untitledResourceResolver.createUntitledResource(content, language, undefined, encoding);
        return monaco.Uri.parse(resource.uri.toString());
    }

    async $tryShowDocument(uri: UriComponents, options?: TextDocumentShowOptions): Promise<void> {
        // Removing try-catch block here makes it not possible to handle errors.
        // Following message is appeared in browser console
        //   - Uncaught (in promise) Error: Cannot read property 'message' of undefined.
        try {
            const editorOptions = DocumentsMainImpl.toEditorOpenerOptions(this.shell, options);
            const uriArg = new URI(CodeURI.revive(uri));
            const opener = await this.openerService.getOpener(uriArg, editorOptions);
            await opener.open(uriArg, editorOptions);
        } catch (err) {
            throw new Error(err);
        }
    }

    async $trySaveDocument(uri: UriComponents): Promise<boolean> {
        return this.modelService.save(new URI(CodeURI.revive(uri)));
    }

    async $tryOpenDocument(uri: UriComponents, encoding?: string): Promise<boolean> {
        // Convert URI to Theia URI
        const theiaUri = new URI(CodeURI.revive(uri));

        // Create model reference
        const ref = await this.modelService.createModelReference(theiaUri);

        if (ref.object) {
            // If we have encoding option, make sure to apply it
            if (encoding && ref.object.setEncoding) {
                try {
                    await ref.object.setEncoding(encoding, EncodingMode.Decode);
                } catch (e) {
                    // If encoding fails, log error but continue
                    console.error(`Failed to set encoding ${encoding} for ${theiaUri.toString()}`, e);
                }
            }

            this.modelReferenceCache.add(ref);
            return true;
        } else {
            ref.dispose();
            return false;
        }
    }

    static toEditorOpenerOptions(shell: ApplicationShell, options?: TextDocumentShowOptions): EditorOpenerOptions | undefined {
        if (!options) {
            return undefined;
        }
        let range: Range | undefined;
        if (options.selection) {
            const selection = options.selection;
            range = {
                start: { line: selection.startLineNumber - 1, character: selection.startColumn - 1 },
                end: { line: selection.endLineNumber - 1, character: selection.endColumn - 1 }
            };
        }
        /* fall back to side group -> split relative to the active widget */
        let widgetOptions: ApplicationShell.WidgetOptions | undefined = { mode: 'split-right' };
        let viewColumn = options.viewColumn;
        if (viewColumn === -2) {
            /* show besides -> compute current column and adjust viewColumn accordingly */
            const tabBars = shell.mainAreaTabBars;
            const currentTabBar = shell.currentTabBar;
            if (currentTabBar) {
                const currentColumn = tabBars.indexOf(currentTabBar);
                if (currentColumn > -1) {
                    // +2 because conversion from 0-based to 1-based index and increase of 1
                    viewColumn = currentColumn + 2;
                }
            }
        }
        if (viewColumn === undefined || viewColumn === -1) {
            /* active group -> skip (default behaviour) */
            widgetOptions = undefined;
        } else if (viewColumn > 0 && shell.mainAreaTabBars.length > 0) {
            const tabBars = shell.mainAreaTabBars;
            if (viewColumn <= tabBars.length) {
                // convert to zero-based index
                const tabBar = tabBars[viewColumn - 1];
                if (tabBar?.currentTitle) {
                    widgetOptions = { ref: tabBar.currentTitle.owner };
                }
            } else {
                const tabBar = tabBars[tabBars.length - 1];
                if (tabBar?.currentTitle) {
                    widgetOptions!.ref = tabBar.currentTitle.owner;
                }
            }
        }
        return {
            selection: range,
            mode: options.preserveFocus ? 'reveal' : 'activate',
            preview: options.preview,
            widgetOptions
        };
    }

}
