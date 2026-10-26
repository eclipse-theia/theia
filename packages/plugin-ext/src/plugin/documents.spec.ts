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

import { expect } from 'chai';
import { Event } from '@theia/core/lib/common/event';
import { RPCProtocol } from '../common/rpc-protocol';
import { DocumentsExtImpl } from './documents';
import { EditorsAndDocumentsExtImpl } from './editors-and-documents';
import { Range, TextDocumentSaveReason, TextEdit, URI } from './types-impl';

describe('DocumentsExtImpl', () => {

    const uri = URI.parse('file:///project/note.txt');
    let documents: DocumentsExtImpl;

    beforeEach(() => {
        const rpc = { getProxy: () => ({}) } as unknown as RPCProtocol;
        const editorsAndDocuments = {
            onDidAddDocuments: Event.None,
            onDidRemoveDocuments: Event.None,
            getDocument: () => ({ document: { uri } })
        } as unknown as EditorsAndDocumentsExtImpl;
        documents = new DocumentsExtImpl(rpc, editorsAndDocuments);
    });

    describe('$acceptModelWillSave()', () => {

        it('does not wait for a listener whose promise never settles', async () => {
            documents.onWillSaveTextDocument(e => e.waitUntil(new Promise(() => { })));
            const start = Date.now();
            const edits = await documents.$acceptModelWillSave(uri, TextDocumentSaveReason.Manual, 500);
            expect(Date.now() - start).to.be.lessThan(1000);
            expect(edits).to.be.empty;
        });

        it('applies the edits of listeners that finish in time, even if a later listener hangs', async () => {
            documents.onWillSaveTextDocument(e => e.waitUntil(Promise.resolve([new TextEdit(new Range(0, 0, 0, 0), 'header\n')])));
            documents.onWillSaveTextDocument(e => e.waitUntil(new Promise(() => { })));
            const edits = await documents.$acceptModelWillSave(uri, TextDocumentSaveReason.Manual, 500);
            expect(edits.map(edit => edit.text)).to.deep.equal(['header\n']);
        });

        it('does not fire the listeners after a listener that timed out', async () => {
            let fired = false;
            documents.onWillSaveTextDocument(e => e.waitUntil(new Promise(() => { })));
            documents.onWillSaveTextDocument(() => fired = true);
            await documents.$acceptModelWillSave(uri, TextDocumentSaveReason.Manual, 500);
            expect(fired).to.be.false;
        });

        it('waits for a listener that finishes within the timeout', async () => {
            documents.onWillSaveTextDocument(e => e.waitUntil(new Promise(resolve =>
                setTimeout(() => resolve([new TextEdit(new Range(0, 0, 0, 0), 'late\n')]), 50))));
            const edits = await documents.$acceptModelWillSave(uri, TextDocumentSaveReason.Manual, 500);
            expect(edits.map(edit => edit.text)).to.deep.equal(['late\n']);
        });
    });
});
