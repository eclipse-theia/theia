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
    DecorationOptions,
    WorkspaceEditDto
} from '../../api/plugin-api';
import { Range } from '../../api/model';
import { EditorsAndDocumentsMain } from './editors-and-documents-main';
import { RPCProtocol } from '../../api/rpc-protocol';
import { DisposableCollection } from '@theia/core';
import { TextEditorMain } from './text-editor-main';
import { disposed } from '../../common/errors';
import { reviveWorkspaceEditDto } from './languages-main';
import { MonacoBulkEditService } from '@theia/monaco/lib/browser/monaco-bulk-edit-service';

export class TextEditorsMainImpl implements TextEditorsMain {

    private toDispose = new DisposableCollection();
    private proxy: TextEditorsExt;
    private editorsToDispose = new Map<string, DisposableCollection>();

    constructor(private readonly editorsAndDocuments: EditorsAndDocumentsMain,
                rpc: RPCProtocol,
                private readonly bulkEditService:  MonacoBulkEditService) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.TEXT_EDITORS_EXT);
        this.toDispose.push(editorsAndDocuments.onTextEditorAdd(editors => editors.forEach(this.onTextEditorAdd, this)));
        this.toDispose.push(editorsAndDocuments.onTextEditorRemove(editors => editors.forEach(this.onTextEditorRemove, this)));
    }

    dispose(): void {
        this.editorsToDispose.forEach(val => val.dispose());
        this.editorsToDispose = new Map();
        this.toDispose.dispose();
    }

    private onTextEditorAdd(editor: TextEditorMain): void {
        const id = editor.getId();
        const toDispose = new DisposableCollection();
        toDispose.push(editor.onPropertiesChangedEvent(e => {
            this.proxy.$acceptEditorPropertiesChanged(id, e);
        }));
        this.editorsToDispose.set(id, toDispose);
    }

    private onTextEditorRemove(id: string): void {
        const disposables = this.editorsToDispose.get(id);
        if (disposables) {
            disposables.dispose();
        }
        this.editorsToDispose.delete(id);
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

    $tryApplyWorkspaceEdit(dto: WorkspaceEditDto): Promise<boolean> {
        const edits  = reviveWorkspaceEditDto(dto);
        return new Promise(resolve => {
            this.bulkEditService.apply( edits).then(() => resolve(true), err => resolve(false));
        });
    }

    $tryInsertSnippet(id: string, template: string, ranges: Range[], opts: UndoStopOptions): Promise<boolean> {
        if (!this.editorsAndDocuments.getEditor(id)) {
            return Promise.reject(disposed(`TextEditor(${id})`));
        }
        return Promise.resolve(this.editorsAndDocuments.getEditor(id)!.insertSnippet(template, ranges, opts));
    }

    $registerTextEditorDecorationType(key: string, options: DecorationRenderOptions): void {
        monaco.services.StaticServices.codeEditorService.get().registerDecorationType(key, options);
    }

    $removeTextEditorDecorationType(key: string): void {
        monaco.services.StaticServices.codeEditorService.get().removeDecorationType(key);
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
