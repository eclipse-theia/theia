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

import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorsAndDocumentsExt, EditorsAndDocumentsDelta, PLUGIN_RPC_CONTEXT } from '../common/plugin-api-rpc';
import { TextEditorExt } from './text-editor';
import { RPCProtocol } from '../common/rpc-protocol';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { DocumentDataExt } from './document-data';
import { ok } from '../common/assert';
import * as Converter from './type-converters';
import { dispose } from '../common/disposable-util';
import { URI } from './types-impl';

@injectable()
export class EditorsAndDocumentsExtImpl implements EditorsAndDocumentsExt {
    @inject(RPCProtocol)
    protected readonly rpc: RPCProtocol;

    private activeEditorId: string | null = null;

    private readonly _onDidAddDocuments = new Emitter<DocumentDataExt[]>();
    private readonly _onDidRemoveDocuments = new Emitter<DocumentDataExt[]>();
    private readonly _onDidChangeVisibleTextEditors = new Emitter<TextEditorExt[]>();
    private readonly _onDidChangeActiveTextEditor = new Emitter<TextEditorExt | undefined>();

    readonly onDidAddDocuments: Event<DocumentDataExt[]> = this._onDidAddDocuments.event;
    readonly onDidRemoveDocuments: Event<DocumentDataExt[]> = this._onDidRemoveDocuments.event;
    readonly onDidChangeVisibleTextEditors: Event<TextEditorExt[]> = this._onDidChangeVisibleTextEditors.event;
    readonly onDidChangeActiveTextEditor: Event<TextEditorExt | undefined> = this._onDidChangeActiveTextEditor.event;

    private readonly documents = new Map<string, DocumentDataExt>();
    private readonly editors = new Map<string, TextEditorExt>();

    async $acceptEditorsAndDocumentsDelta(delta: EditorsAndDocumentsDelta): Promise<void> {
        this.acceptEditorsAndDocumentsDelta(delta);
    }

    acceptEditorsAndDocumentsDelta(delta: EditorsAndDocumentsDelta): void {
        const removedDocuments = new Array<DocumentDataExt>();
        const addedDocuments = new Array<DocumentDataExt>();
        const removedEditors = new Array<TextEditorExt>();

        if (delta.removedDocuments) {
            for (const uriComponent of delta.removedDocuments) {
                const uri = URI.revive(uriComponent);
                const id = uri.toString();
                const data = this.documents.get(id);
                this.documents.delete(id);
                if (data) {
                    removedDocuments.push(data);
                }
            }
        }

        if (delta.addedDocuments) {
            for (const data of delta.addedDocuments) {
                const resource = URI.revive(data.uri);
                ok(!this.documents.has(resource.toString()), `document '${resource}' already exists!`);
                const documentData = new DocumentDataExt(
                    this.rpc.getProxy(PLUGIN_RPC_CONTEXT.DOCUMENTS_MAIN),
                    resource,
                    data.lines,
                    data.EOL,
                    data.modeId,
                    data.versionId,
                    data.isDirty,
                    data.encoding
                );
                this.documents.set(resource.toString(), documentData);
                addedDocuments.push(documentData);
            }
        }

        if (delta.removedEditors) {
            for (const id of delta.removedEditors) {
                const editor = this.editors.get(id);
                this.editors.delete(id);
                if (editor) {
                    removedEditors.push(editor);
                }
            }
        }

        if (delta.addedEditors) {
            for (const data of delta.addedEditors) {
                const resource = URI.revive(data.documentUri);
                ok(this.documents.has(resource.toString()), `document '${resource}' doesn't exist`);
                ok(!this.editors.has(data.id), `editor '${data.id}' already exists!`);

                const documentData = this.documents.get(resource.toString());
                const editor = new TextEditorExt(
                    this.rpc.getProxy(PLUGIN_RPC_CONTEXT.TEXT_EDITORS_MAIN),
                    data.id,
                    documentData!,
                    data.selections.map(Converter.toSelection),
                    data.options,
                    data.visibleRanges.map(Converter.toRange),
                    Converter.toViewColumn(data.editorPosition)
                );
                this.editors.set(data.id, editor);
            }
        }

        // TODO investigate how to get rid of it to align with VS Code extension host code
        if (this.activeEditorId && delta.removedEditors && delta.removedEditors.indexOf(this.activeEditorId) !== -1 && this.editors.size !== 0) {
            // to be compatible with VSCode, when active editor is closed onDidChangeActiveTextEditor
            // should be triggered with undefined before next editor, if any, become active.
            this.activeEditorId = null;
            this._onDidChangeActiveTextEditor.fire(undefined);
        }

        if (delta.newActiveEditor !== undefined) {
            ok(delta.newActiveEditor === null || this.editors.has(delta.newActiveEditor), `active editor '${delta.newActiveEditor}' does not exist`);
            this.activeEditorId = delta.newActiveEditor;
        }

        dispose(removedDocuments);
        dispose(removedEditors);

        // now that the internal state is complete, fire events
        if (delta.removedDocuments) {
            this._onDidRemoveDocuments.fire(removedDocuments);
        }
        if (delta.addedDocuments) {
            this._onDidAddDocuments.fire(addedDocuments);
        }

        if (delta.removedEditors || delta.addedEditors) {
            this._onDidChangeVisibleTextEditors.fire(this.allEditors());
        }
        if (delta.newActiveEditor !== undefined) {
            this._onDidChangeActiveTextEditor.fire(this.activeEditor());
        }
    }

    allEditors(): TextEditorExt[] {
        const result = new Array<TextEditorExt>();
        this.editors.forEach(editor => result.push(editor));
        return result;
    }

    activeEditor(): TextEditorExt | undefined {
        if (!this.activeEditorId) {
            return undefined;
        } else {
            return this.editors.get(this.activeEditorId);
        }
    }

    allDocuments(): DocumentDataExt[] {
        const result = new Array<DocumentDataExt>();
        this.documents.forEach(data => result.push(data));
        return result;
    }

    getDocument(uri: string): DocumentDataExt | undefined {
        return this.documents.get(uri);
    }

    getEditor(id: string): TextEditorExt | undefined {
        return this.editors.get(id);
    }
}
