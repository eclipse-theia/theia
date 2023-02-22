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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { URI } from '@theia/core/shared/vscode-uri';
import {
    TextEditorsMain,
    MAIN_RPC_CONTEXT,
    TextEditorsExt,
    TextEditorConfigurationUpdate,
    Selection,
    TextEditorRevealType,
    SingleEditOperation,
    ApplyEditsOptions,
    UndoStopOptions,
    DecorationRenderOptions,
    ThemeDecorationInstanceRenderOptions,
    DecorationOptions,
    WorkspaceEditDto,
    DocumentsMain,
    WorkspaceEditMetadataDto,
} from '../../common/plugin-api-rpc';
import { Range, TextDocumentShowOptions } from '../../common/plugin-api-rpc-model';
import { EditorsAndDocumentsMain } from './editors-and-documents-main';
import { RPCProtocol } from '../../common/rpc-protocol';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { TextEditorMain } from './text-editor-main';
import { disposed } from '../../common/errors';
import { toMonacoWorkspaceEdit } from './languages-main';
import { MonacoBulkEditService } from '@theia/monaco/lib/browser/monaco-bulk-edit-service';
import { MonacoEditorService } from '@theia/monaco/lib/browser/monaco-editor-service';
import { theiaUritoUriComponents, UriComponents } from '../../common/uri-components';
import { Endpoint } from '@theia/core/lib/browser/endpoint';
import * as monaco from '@theia/monaco-editor-core';
import { ResourceEdit } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/bulkEditService';
import { IDecorationRenderOptions } from '@theia/monaco-editor-core/esm/vs/editor/common/editorCommon';

export class TextEditorsMainImpl implements TextEditorsMain, Disposable {

    private readonly proxy: TextEditorsExt;
    private readonly toDispose = new DisposableCollection();
    private readonly editorsToDispose = new Map<string, DisposableCollection>();
    private readonly fileEndpoint = new Endpoint({ path: 'file' }).getRestUrl();

    constructor(
        private readonly editorsAndDocuments: EditorsAndDocumentsMain,
        private readonly documents: DocumentsMain,
        rpc: RPCProtocol,
        private readonly bulkEditService: MonacoBulkEditService,
        private readonly monacoEditorService: MonacoEditorService,
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TEXT_EDITORS_EXT);
        this.toDispose.push(editorsAndDocuments);
        this.toDispose.push(editorsAndDocuments.onTextEditorAdd(editors => editors.forEach(this.onTextEditorAdd, this)));
        this.toDispose.push(editorsAndDocuments.onTextEditorRemove(editors => editors.forEach(this.onTextEditorRemove, this)));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    private onTextEditorAdd(editor: TextEditorMain): void {
        const id = editor.getId();
        const toDispose = new DisposableCollection(
            editor.onPropertiesChangedEvent(e => {
                this.proxy.$acceptEditorPropertiesChanged(id, e);
            }),
            Disposable.create(() => this.editorsToDispose.delete(id))
        );
        this.editorsToDispose.set(id, toDispose);
        this.toDispose.push(toDispose);
    }

    private onTextEditorRemove(id: string): void {
        const disposables = this.editorsToDispose.get(id);
        if (disposables) {
            disposables.dispose();
        }
    }

    $tryShowTextDocument(uri: UriComponents, options?: TextDocumentShowOptions): Promise<void> {
        return this.documents.$tryShowDocument(uri, options);
    }

    $trySetOptions(id: string, options: TextEditorConfigurationUpdate): Promise<void> {
        if (!this.editorsAndDocuments.getEditor(id)) {
            return Promise.reject(disposed(`TextEditor: ${id}`));
        }
        this.editorsAndDocuments.getEditor(id)!.setConfiguration(options);
        return Promise.resolve();
    }

    $trySetSelections(id: string, selections: Selection[]): Promise<void> {
        if (!this.editorsAndDocuments.getEditor(id)) {
            return Promise.reject(disposed(`TextEditor: ${id}`));
        }
        this.editorsAndDocuments.getEditor(id)!.setSelections(selections);
        return Promise.resolve();
    }

    $tryRevealRange(id: string, range: Range, revealType: TextEditorRevealType): Promise<void> {
        if (!this.editorsAndDocuments.getEditor(id)) {
            return Promise.reject(disposed(`TextEditor(${id})`));
        }

        this.editorsAndDocuments.getEditor(id)!.revealRange(new monaco.Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn), revealType);
        return Promise.resolve();
    }

    $tryApplyEdits(id: string, modelVersionId: number, edits: SingleEditOperation[], opts: ApplyEditsOptions): Promise<boolean> {
        if (!this.editorsAndDocuments.getEditor(id)) {
            return Promise.reject(disposed(`TextEditor(${id})`));
        }

        return Promise.resolve(this.editorsAndDocuments.getEditor(id)!.applyEdits(modelVersionId, edits, opts));
    }

    async $tryApplyWorkspaceEdit(dto: WorkspaceEditDto, metadata?: WorkspaceEditMetadataDto): Promise<boolean> {
        const workspaceEdit = toMonacoWorkspaceEdit(dto);
        try {
            const edits = ResourceEdit.convert(workspaceEdit);
            const { success } = await this.bulkEditService.apply(edits, { respectAutoSaveConfig: metadata?.isRefactoring });
            return success;
        } catch {
            return false;
        }
    }

    $tryInsertSnippet(id: string, template: string, ranges: Range[], opts: UndoStopOptions): Promise<boolean> {
        if (!this.editorsAndDocuments.getEditor(id)) {
            return Promise.reject(disposed(`TextEditor(${id})`));
        }
        return Promise.resolve(this.editorsAndDocuments.getEditor(id)!.insertSnippet(template, ranges, opts));
    }

    $registerTextEditorDecorationType(key: string, options: DecorationRenderOptions | IDecorationRenderOptions): void {
        this.injectRemoteUris(options);
        this.monacoEditorService.registerDecorationType('Plugin decoration', key, options as IDecorationRenderOptions);
        this.toDispose.push(Disposable.create(() => this.$removeTextEditorDecorationType(key)));
    }

    protected injectRemoteUris(options: DecorationRenderOptions | ThemeDecorationInstanceRenderOptions): void {
        if (options.before) {
            options.before.contentIconPath = this.toRemoteUri(options.before.contentIconPath);
        }
        if (options.after) {
            options.after.contentIconPath = this.toRemoteUri(options.after.contentIconPath);
        }
        if ('gutterIconPath' in options) {
            options.gutterIconPath = this.toRemoteUri(options.gutterIconPath);
        }
        if ('dark' in options && options.dark) {
            this.injectRemoteUris(options.dark);
        }
        if ('light' in options && options.light) {
            this.injectRemoteUris(options.light);
        }
    }

    protected toRemoteUri(uri?: UriComponents): UriComponents | undefined {
        if (uri && uri.scheme === 'file') {
            return theiaUritoUriComponents(this.fileEndpoint.withQuery(URI.revive(uri).toString()));
        }
        return uri;
    }

    $removeTextEditorDecorationType(key: string): void {
        this.monacoEditorService.removeDecorationType(key);
    }

    $tryHideEditor(id: string): Promise<void> {
        return this.editorsAndDocuments.hideEditor(id);
    }

    $trySetDecorations(id: string, key: string, ranges: DecorationOptions[]): Promise<void> {
        if (!this.editorsAndDocuments.getEditor(id)) {
            return Promise.reject(disposed(`TextEditor(${id})`));
        }
        this.editorsAndDocuments.getEditor(id)!.setDecorations(key, ranges);
        return Promise.resolve();
    }

    $trySetDecorationsFast(id: string, key: string, ranges: number[]): Promise<void> {
        if (!this.editorsAndDocuments.getEditor(id)) {
            return Promise.reject(disposed(`TextEditor(${id})`));
        }
        this.editorsAndDocuments.getEditor(id)!.setDecorationsFast(key, ranges);
        return Promise.resolve();
    }

    $saveAll(includeUntitled?: boolean): Promise<boolean> {
        return this.editorsAndDocuments.saveAll(includeUntitled);
    }

}
