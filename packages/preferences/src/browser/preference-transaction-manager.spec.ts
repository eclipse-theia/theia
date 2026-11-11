// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { CancellationError, ILogger, MessageService, PreferenceScope, PreferenceService, URI } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileOperationError, FileOperationResult } from '@theia/filesystem/lib/common/files';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { TextEditorDocumentService } from '@theia/editor/lib/browser/text-editor-document-service';
import { JSONCEditor } from '@theia/core/lib/common/jsonc-editor';
import { PreferenceTransaction, PreferenceTransactionFactory, preferenceTransactionFactoryCreator } from './preference-transaction-manager.js';

disableJSDOM();

const configUri = new URI('file:///home/user/.theia/settings.json');

interface WriteCall {
    value: string;
    options: { encoding?: string, etag?: string, mtime?: number };
}

class MockFileService {
    content: string | undefined = '{}';
    etag = 'etag-1';
    readonly writes: WriteCall[] = [];
    /** Simulates another writer: replaces the content on disk and fails the next write with `FILE_MODIFIED_SINCE`. */
    externalContent: string | undefined;
    /** Simulates a file that is modified by someone else on every write. */
    alwaysModified = false;
    onRead: (() => void) | undefined;

    async read(): Promise<{ value: string, encoding: string, etag: string, mtime: number }> {
        this.onRead?.();
        if (this.content === undefined) {
            throw new FileOperationError('not found', FileOperationResult.FILE_NOT_FOUND);
        }
        return { value: this.content, encoding: 'utf8bom', etag: this.etag, mtime: 1 };
    }

    async write(_uri: URI, value: string, options: WriteCall['options']): Promise<object> {
        this.simulateExternalChange();
        this.writes.push({ value, options });
        this.content = value;
        return {};
    }

    async create(_uri: URI, value: string, options: { overwrite?: boolean }): Promise<object> {
        this.simulateExternalChange();
        if (this.content !== undefined && !options.overwrite) {
            throw new FileOperationError('exists', FileOperationResult.FILE_MODIFIED_SINCE);
        }
        this.writes.push({ value, options: {} });
        this.content = value;
        return {};
    }

    protected simulateExternalChange(): void {
        if (this.alwaysModified) {
            throw new FileOperationError('modified', FileOperationResult.FILE_MODIFIED_SINCE);
        }
        if (this.externalContent !== undefined) {
            this.content = this.externalContent;
            this.etag = 'etag-external';
            this.externalContent = undefined;
            throw new FileOperationError('modified', FileOperationResult.FILE_MODIFIED_SINCE);
        }
    }
}

class MockDocument {
    saved = false;
    /** Simulates a save that fails without an error, as a save of a file that was changed on disk does. */
    saveFails = false;
    constructor(public dirty: boolean) { }
    async save(): Promise<void> {
        if (!this.saveFails) {
            this.dirty = false;
            this.saved = true;
        }
    }
}

describe('PreferenceTransaction', () => {
    let fileService: MockFileService;
    let document: MockDocument | undefined;
    let messageAnswer: string | undefined;
    let errors: string[];
    let container: Container;
    let createTransaction: () => PreferenceTransaction;

    beforeEach(() => {
        fileService = new MockFileService();
        document = undefined;
        messageAnswer = undefined;
        errors = [];
        container = new Container();
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        container.bind(FileService).toConstantValue(fileService as unknown as FileService);
        container.bind(PreferenceService).toConstantValue({
            get: (_name: string, options?: { fallback?: unknown }) => options?.fallback
        } as unknown as PreferenceService);
        container.bind(JSONCEditor).toSelf().inSingletonScope();
        container.bind(MessageService).toConstantValue({
            error: async (message: string) => {
                errors.push(message);
                return messageAnswer;
            }
        } as unknown as MessageService);
        container.bind(EditorManager).toConstantValue({
            get all(): object[] {
                return document ? [{ editor: { uri: configUri, document } }] : [];
            },
            open: async () => undefined
        } as unknown as EditorManager);
        container.bind(PreferenceTransaction).toSelf();
        container.bind(PreferenceTransactionFactory).toFactory(preferenceTransactionFactoryCreator);
        const factory = container.get<PreferenceTransactionFactory>(PreferenceTransactionFactory);
        createTransaction = () => factory({ getConfigUri: () => configUri, getScope: () => PreferenceScope.User });
    });

    it('writes all queued edits in a single write, keeping the encoding and guarding against concurrent changes', async () => {
        const transaction = createTransaction();
        const results = await Promise.all([
            transaction.enqueueAction('editor.fontSize', ['editor.fontSize'], 20),
            transaction.enqueueAction('editor.tabSize', ['editor.tabSize'], 2),
        ]);

        expect(results).to.deep.equal([true, true]);
        expect(fileService.writes).to.have.length(1);
        expect(JSON.parse(fileService.writes[0].value)).to.deep.equal({ 'editor.fontSize': 20, 'editor.tabSize': 2 });
        expect(fileService.writes[0].options).to.deep.equal({ encoding: 'utf8bom', etag: 'etag-1', mtime: 1 });
    });

    it('creates the file if it does not exist', async () => {
        fileService.content = undefined;
        const result = await createTransaction().enqueueAction('editor.fontSize', ['editor.fontSize'], 20);

        expect(result).to.be.true;
        expect(JSON.parse(fileService.content!)).to.deep.equal({ 'editor.fontSize': 20 });
    });

    it('does not overwrite the file if someone else created it in the meantime', async () => {
        fileService.content = undefined;
        fileService.externalContent = '{ "editor.wordWrap": "on" }';
        const result = await createTransaction().enqueueAction('editor.fontSize', ['editor.fontSize'], 20);

        expect(result).to.be.true;
        expect(JSON.parse(fileService.content!)).to.deep.equal({ 'editor.wordWrap': 'on', 'editor.fontSize': 20 });
    });

    it('notifies the user if the file keeps being modified by someone else', async () => {
        fileService.alwaysModified = true;
        const result = await createTransaction().enqueueAction('editor.fontSize', ['editor.fontSize'], 20);

        expect(result).to.be.false;
        expect(fileService.writes).to.be.empty;
        expect(errors).to.deep.equal(['Failed to write the settings to settings.json.']);
    });

    it('does not write if the edits do not change the file', async () => {
        fileService.content = '{ "editor.fontSize": 20 }';
        const result = await createTransaction().enqueueAction('editor.fontSize', ['editor.fontSize'], 20);

        expect(result).to.be.true;
        expect(fileService.writes).to.be.empty;
    });

    it('reapplies its edits if the file was modified by someone else', async () => {
        fileService.externalContent = '{ "editor.wordWrap": "on" }';
        const result = await createTransaction().enqueueAction('editor.fontSize', ['editor.fontSize'], 20);

        expect(result).to.be.true;
        expect(fileService.writes).to.have.length(1);
        expect(fileService.writes[0].options.etag).to.equal('etag-external');
        expect(JSON.parse(fileService.content!)).to.deep.equal({ 'editor.wordWrap': 'on', 'editor.fontSize': 20 });
    });

    it('does not write if the file has unsaved changes in an editor and the user does not save them', async () => {
        document = new MockDocument(true);
        const transaction = createTransaction();
        const action = transaction.enqueueAction('editor.fontSize', ['editor.fontSize'], 20);

        const error = await action.then(() => undefined, e => e);
        expect(error).to.be.instanceOf(CancellationError);
        expect(await transaction.result).to.be.false;
        expect(fileService.writes).to.be.empty;
        expect(document.saved).to.be.false;
    });

    it('saves the editor with unsaved changes before writing if the user chooses to', async () => {
        document = new MockDocument(true);
        messageAnswer = 'Save and Retry';
        const result = await createTransaction().enqueueAction('editor.fontSize', ['editor.fontSize'], 20);

        expect(result).to.be.true;
        expect(document.saved).to.be.true;
        expect(fileService.writes).to.have.length(1);
    });

    it('ignores editors without unsaved changes', async () => {
        document = new MockDocument(false);
        const result = await createTransaction().enqueueAction('editor.fontSize', ['editor.fontSize'], 20);

        expect(result).to.be.true;
        expect(fileService.writes).to.have.length(1);
    });

    it('finds documents with unsaved changes that are not shown in an editor', async () => {
        const backgroundDocument = new MockDocument(true);
        container.bind(TextEditorDocumentService).toConstantValue({
            getDocument: uri => uri.isEqual(configUri) ? backgroundDocument : undefined
        } as TextEditorDocumentService);
        messageAnswer = 'Save and Retry';
        const result = await createTransaction().enqueueAction('editor.fontSize', ['editor.fontSize'], 20);

        expect(result).to.be.true;
        expect(backgroundDocument.saved).to.be.true;
        expect(fileService.writes).to.have.length(1);
    });

    it('does not write if saving the editor with unsaved changes fails', async () => {
        document = new MockDocument(true);
        document.saveFails = true;
        messageAnswer = 'Save and Retry';
        const transaction = createTransaction();
        const action = transaction.enqueueAction('editor.fontSize', ['editor.fontSize'], 20);

        const error = await action.then(() => undefined, e => e);
        expect(error).to.be.instanceOf(CancellationError);
        expect(await transaction.result).to.be.false;
        expect(fileService.writes).to.be.empty;
        expect(errors).to.include('Could not save settings.json.');
    });

    it('checks for unsaved changes made while the transaction is running before writing', async () => {
        const editedDocument = new MockDocument(false);
        document = editedDocument;
        fileService.onRead = () => {
            editedDocument.dirty = true;
            fileService.onRead = undefined;
        };
        editedDocument.save = async () => {
            editedDocument.dirty = false;
            editedDocument.saved = true;
            fileService.content = '{ "editor.wordWrap": "on" }';
        };
        messageAnswer = 'Save and Retry';
        const result = await createTransaction().enqueueAction('editor.fontSize', ['editor.fontSize'], 20);

        expect(result).to.be.true;
        expect(editedDocument.saved).to.be.true;
        expect(JSON.parse(fileService.content!)).to.deep.equal({ 'editor.wordWrap': 'on', 'editor.fontSize': 20 });
    });

    it('does not write if unsaved changes made while the transaction is running are not saved', async () => {
        const editedDocument = new MockDocument(false);
        document = editedDocument;
        fileService.onRead = () => {
            editedDocument.dirty = true;
        };
        const result = await createTransaction().enqueueAction('editor.fontSize', ['editor.fontSize'], 20);

        expect(result).to.be.false;
        expect(fileService.writes).to.be.empty;
    });
});
