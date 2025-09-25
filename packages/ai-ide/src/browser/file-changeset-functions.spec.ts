// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { CancellationTokenSource } from '@theia/core';
import {
    SuggestFileContent,
    WriteFileContent,
    SuggestFileReplacements,
    WriteFileReplacements,
    ClearFileChanges,
    GetProposedFileState,
    ReplaceContentInFileFunctionHelper,
    FileChangeSetTitleProvider,
    DefaultFileChangeSetTitleProvider,
    ReplaceContentInFileFunctionHelperV2,
    SuggestFileReplacements_Next
} from './file-changeset-functions';
import { MutableChatRequestModel, MutableChatResponseModel, ChangeSet, ChangeSetElement, MutableChatModel } from '@theia/ai-chat';
import { Container } from '@theia/core/shared/inversify';
import { WorkspaceFunctionScope } from './workspace-functions';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { ChangeSetFileElementFactory, ChangeSetFileElement } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { URI } from '@theia/core/lib/common/uri';

disableJSDOM();

describe('File Changeset Functions Cancellation Tests', () => {
    let cancellationTokenSource: CancellationTokenSource;
    let mockCtx: Partial<MutableChatRequestModel>;
    let container: Container;
    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        // Disable JSDOM after all tests
        disableJSDOM();
    });
    beforeEach(() => {
        cancellationTokenSource = new CancellationTokenSource();

        // Create a mock change set that doesn't do anything
        const mockChangeSet: Partial<ChangeSet> = {
            addElements: (...elements: ChangeSetElement[]) => true,
            setTitle: () => { },
            removeElements: () => true,
            getElementByURI: () => undefined
        };

        // Setup mock context
        mockCtx = {
            id: 'test-request-id',
            response: {
                cancellationToken: cancellationTokenSource.token
            } as MutableChatResponseModel,
            session: {
                id: 'test-session-id',
                changeSet: mockChangeSet as ChangeSet
            } as MutableChatModel
        };

        // Create a new container for each test
        container = new Container();

        // Mock dependencies
        const mockWorkspaceScope = {
            resolveRelativePath: async () => new URI('file:///workspace/test.txt')
        } as unknown as WorkspaceFunctionScope;

        const mockFileService = {
            exists: async () => true,
            read: async () => ({ value: { toString: () => 'test content' } })
        } as unknown as FileService;

        const mockFileChangeFactory: ChangeSetFileElementFactory = () => ({
            uri: new URI('file:///workspace/test.txt'),
            type: 'modify',
            state: 'pending',
            targetState: 'new content',
            apply: async () => { },
        } as ChangeSetFileElement);

        // Register mocks in the container
        container.bind(WorkspaceFunctionScope).toConstantValue(mockWorkspaceScope);
        container.bind(FileService).toConstantValue(mockFileService);
        container.bind(ChangeSetFileElementFactory).toConstantValue(mockFileChangeFactory);
        container.bind(FileChangeSetTitleProvider).to(DefaultFileChangeSetTitleProvider).inSingletonScope();
        container.bind(ReplaceContentInFileFunctionHelper).toSelf();
        container.bind(SuggestFileContent).toSelf();
        container.bind(WriteFileContent).toSelf();
        container.bind(SuggestFileReplacements).toSelf();
        container.bind(WriteFileReplacements).toSelf();
        container.bind(ClearFileChanges).toSelf();
        container.bind(GetProposedFileState).toSelf();
        container.bind(ReplaceContentInFileFunctionHelperV2).toSelf();
        container.bind(SuggestFileReplacements_Next).toSelf();
    });

    afterEach(() => {
        cancellationTokenSource.dispose();
    });

    it('SuggestFileContent should respect cancellation token', async () => {
        const suggestFileContent = container.get(SuggestFileContent);
        cancellationTokenSource.cancel();

        const handler = suggestFileContent.getTool().handler;
        const result = await handler(JSON.stringify({ path: 'test.txt', content: 'test content' }), mockCtx as MutableChatRequestModel);

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('WriteFileContent should respect cancellation token', async () => {
        const writeFileContent = container.get(WriteFileContent);
        cancellationTokenSource.cancel();

        const handler = writeFileContent.getTool().handler;
        const result = await handler(JSON.stringify({ path: 'test.txt', content: 'test content' }), mockCtx as MutableChatRequestModel);

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('SuggestFileReplacements should respect cancellation token', async () => {
        const suggestFileReplacements = container.get(SuggestFileReplacements);
        cancellationTokenSource.cancel();

        const handler = suggestFileReplacements.getTool().handler;
        const result = await handler(
            JSON.stringify({
                path: 'test.txt',
                replacements: [{ oldContent: 'old', newContent: 'new' }]
            }),
            mockCtx as MutableChatRequestModel
        );

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('WriteFileReplacements should respect cancellation token', async () => {
        const writeFileReplacements = container.get(WriteFileReplacements);
        cancellationTokenSource.cancel();

        const handler = writeFileReplacements.getTool().handler;
        const result = await handler(
            JSON.stringify({
                path: 'test.txt',
                replacements: [{ oldContent: 'old', newContent: 'new' }]
            }),
            mockCtx as MutableChatRequestModel
        );

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('ClearFileChanges should respect cancellation token', async () => {
        const clearFileChanges = container.get(ClearFileChanges);
        cancellationTokenSource.cancel();

        const handler = clearFileChanges.getTool().handler;
        const result = await handler(JSON.stringify({ path: 'test.txt' }), mockCtx as MutableChatRequestModel);

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('GetProposedFileState should respect cancellation token', async () => {
        const getProposedFileState = container.get(GetProposedFileState);
        cancellationTokenSource.cancel();

        const handler = getProposedFileState.getTool().handler;
        const result = await handler(JSON.stringify({ path: 'test.txt' }), mockCtx as MutableChatRequestModel);

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('ReplaceContentInFileFunctionHelper should handle cancellation in common processing', async () => {
        const helper = container.get(ReplaceContentInFileFunctionHelper);
        cancellationTokenSource.cancel();

        // Test the underlying helper method through the public methods

        const result = await helper.createChangesetFromToolCall(
            JSON.stringify({
                path: 'test.txt',
                replacements: [{ oldContent: 'old', newContent: 'new' }]
            }),
            mockCtx as MutableChatRequestModel
        );
        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');

    });

    it('SuggestFileReplacements_Next should respect cancellation token', async () => {
        const suggestFileReplacementsNext = container.get(SuggestFileReplacements_Next);
        cancellationTokenSource.cancel();

        const handler = suggestFileReplacementsNext.getTool().handler;
        const result = await handler(
            JSON.stringify({
                path: 'test.txt',
                replacements: [{ oldContent: 'old', newContent: 'new', multiple: true }]
            }),
            mockCtx as MutableChatRequestModel
        );

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('SuggestFileReplacements_Next should have correct ID', () => {
        const suggestFileReplacementsNext = container.get(SuggestFileReplacements_Next);
        expect(SuggestFileReplacements_Next.ID).to.equal('suggestFileReplacements_Next');
        expect(suggestFileReplacementsNext.getTool().id).to.equal('suggestFileReplacements_Next');
    });
});
