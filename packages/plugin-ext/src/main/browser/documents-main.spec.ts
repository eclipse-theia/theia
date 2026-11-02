// *****************************************************************************
// Copyright (C) 2026 Vinay Kaushal and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { Disposable, Event } from '@theia/core';
import { SingleEditOperation } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { DocumentsMainImpl } from './documents-main';
import { EditorsAndDocumentsMain } from './editors-and-documents-main';
import { NotebookDocumentsMainImpl } from './notebooks/notebook-documents-main';
import { EditorModelService } from './text-editor-model-service';

disableJSDOM();

class TestDocumentsMainImpl extends DocumentsMainImpl {
    protected override saveTimeout = 100;
}

describe('DocumentsMainImpl', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let willSaveListener: (event: object) => Promise<void>;
    let acceptModelWillSave: () => Promise<SingleEditOperation[]>;
    let appliedEdits: unknown[];
    let documentsMain: DocumentsMainImpl;

    beforeEach(() => {
        appliedEdits = [];
        const modelService = {
            onModelModeChanged: Event.None,
            onModelSaved: Event.None,
            onModelWillSave: (listener: (event: object) => Promise<void>) => {
                willSaveListener = listener;
                return Disposable.NULL;
            },
            onModelDirtyChanged: Event.None,
            onModelEncodingChanged: Event.None
        } as unknown as EditorModelService;
        const editorsAndDocuments = { onDocumentAdd: Event.None, onDocumentRemove: Event.None, dispose: () => { } } as unknown as EditorsAndDocumentsMain;
        const notebookDocuments = { onDidAddNotebookCellModel: Event.None } as unknown as NotebookDocumentsMainImpl;
        const rpc = { getProxy: () => ({ $acceptModelWillSave: () => acceptModelWillSave() }) } as unknown as RPCProtocol;
        documentsMain = new TestDocumentsMainImpl(editorsAndDocuments, notebookDocuments, modelService, rpc, undefined!, undefined!, undefined!, undefined!);
    });

    afterEach(() => documentsMain.dispose());

    function fireWillSave(): Promise<void> {
        const textEditorModel = { applyEdits: (edits: unknown[]) => appliedEdits.push(...edits) };
        return willSaveListener({ model: { uri: 'file:///project/note.txt', textEditorModel }, options: {} });
    }

    it('saves without the edits of plugins if the plugin host does not answer in time', async () => {
        acceptModelWillSave = () => new Promise(() => { });
        const start = Date.now();
        await fireWillSave();
        expect(Date.now() - start).to.be.lessThan(1000);
        expect(appliedEdits).to.be.empty;
    });

    it('applies the edits of plugins that answer in time', async () => {
        acceptModelWillSave = async () => [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'header\n' }];
        await fireWillSave();
        expect(appliedEdits).to.have.length(1);
    });
});
