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
import { CancellationTokenSource, PreferenceService, ILogger } from '@theia/core';
import {
    SuggestFileContent,
    WriteFileContent,
    SuggestFileReplacements,
    SuggestFileReplacements_Simple,
    WriteFileReplacements,
    WriteFileReplacements_Simple,
    ClearFileChanges,
    GetProposedFileState,
    ReplaceContentInFileFunctionHelper,
    FileChangeSetTitleProvider,
    DefaultFileChangeSetTitleProvider,
    ReplaceContentInFileFunctionHelperV2
} from './file-changeset-functions';
import { ChatToolContext, FileReadTracker, MutableChatRequestModel, MutableChatResponseModel, MutableChatModel } from '@theia/ai-chat';
import { ChangeSet, ChangeSetElement } from '@theia/ai-chat/lib/common/change-set';
import { Container } from '@theia/core/shared/inversify';
import { AccessibleRootContribution, WorkspaceFunctionScope } from './workspace-functions';
import { bindRootContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { AiConfigurationService } from '@theia/ai-core';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { ChangeSetElementArgs, ChangeSetFileElementFactory, ChangeSetFileElement } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { URI } from '@theia/core/lib/common/uri';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';

disableJSDOM();

describe('File Changeset Functions Cancellation Tests', () => {
    let cancellationTokenSource: CancellationTokenSource;
    let mockCtx: ChatToolContext;
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
        const mockRequest = {
            id: 'test-request-id',
            session: {
                id: 'test-session-id',
                changeSet: mockChangeSet as ChangeSet
            } as MutableChatModel
        } as MutableChatRequestModel;
        mockCtx = {
            cancellationToken: cancellationTokenSource.token,
            request: mockRequest,
            response: {} as MutableChatResponseModel
        };

        // Create a new container for each test
        container = new Container();

        // Mock dependencies
        const mockWorkspaceScope = {
            resolveAccessiblePath: async () => new URI('file:///workspace/test.txt')
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
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        container.bind(FileService).toConstantValue(mockFileService);
        container.bind(ChangeSetFileElementFactory).toConstantValue(mockFileChangeFactory);
        container.bind(FileChangeSetTitleProvider).to(DefaultFileChangeSetTitleProvider).inSingletonScope();
        container.bind(ReplaceContentInFileFunctionHelper).toSelf();
        container.bind(SuggestFileContent).toSelf();
        container.bind(WriteFileContent).toSelf();
        container.bind(SuggestFileReplacements_Simple).toSelf();
        container.bind(SuggestFileReplacements).toSelf();
        container.bind(WriteFileReplacements_Simple).toSelf();
        container.bind(WriteFileReplacements).toSelf();
        container.bind(ClearFileChanges).toSelf();
        container.bind(GetProposedFileState).toSelf();
        container.bind(ReplaceContentInFileFunctionHelperV2).toSelf();
    });

    afterEach(() => {
        cancellationTokenSource.dispose();
    });

    it('SuggestFileContent should respect cancellation token', async () => {
        const suggestFileContent = container.get(SuggestFileContent);
        cancellationTokenSource.cancel();

        const handler = suggestFileContent.getTool().handler;
        const result = await handler(JSON.stringify({ path: 'test.txt', content: 'test content' }), mockCtx);

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('WriteFileContent should respect cancellation token', async () => {
        const writeFileContent = container.get(WriteFileContent);
        cancellationTokenSource.cancel();

        const handler = writeFileContent.getTool().handler;
        const result = await handler(JSON.stringify({ path: 'test.txt', content: 'test content' }), mockCtx);

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('SuggestFileReplacements_Simple should respect cancellation token', async () => {
        const suggestFileReplacementsSimple = container.get(SuggestFileReplacements_Simple);
        cancellationTokenSource.cancel();

        const handler = suggestFileReplacementsSimple.getTool().handler;
        const result = await handler(
            JSON.stringify({
                path: 'test.txt',
                replacements: [{ oldContent: 'old', newContent: 'new' }]
            }),
            mockCtx
        );

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('WriteFileReplacements_Simple should respect cancellation token', async () => {
        const writeFileReplacementsSimple = container.get(WriteFileReplacements_Simple);
        cancellationTokenSource.cancel();

        const handler = writeFileReplacementsSimple.getTool().handler;
        const result = await handler(
            JSON.stringify({
                path: 'test.txt',
                replacements: [{ oldContent: 'old', newContent: 'new' }]
            }),
            mockCtx
        );

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('WriteFileReplacements should respect cancellation token with V2 implementation', async () => {
        const writeFileReplacements = container.get(WriteFileReplacements);
        cancellationTokenSource.cancel();

        const handler = writeFileReplacements.getTool().handler;
        const result = await handler(
            JSON.stringify({
                path: 'test.txt',
                replacements: [{ oldContent: 'old', newContent: 'new', multiple: true }]
            }),
            mockCtx
        );

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('WriteFileReplacements should have correct ID', () => {
        const writeFileReplacements = container.get(WriteFileReplacements);
        expect(WriteFileReplacements.ID).to.equal('writeFileReplacements');
        expect(writeFileReplacements.getTool().id).to.equal('writeFileReplacements');
    });

    it('ClearFileChanges should respect cancellation token', async () => {
        const clearFileChanges = container.get(ClearFileChanges);
        cancellationTokenSource.cancel();

        const handler = clearFileChanges.getTool().handler;
        const result = await handler(JSON.stringify({ path: 'test.txt' }), mockCtx);

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('GetProposedFileState should respect cancellation token', async () => {
        const getProposedFileState = container.get(GetProposedFileState);
        cancellationTokenSource.cancel();

        const handler = getProposedFileState.getTool().handler;
        const result = await handler(JSON.stringify({ path: 'test.txt' }), mockCtx);

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
            mockCtx
        );
        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');

    });

    it('SuggestFileReplacements should respect cancellation token with V2 implementation', async () => {
        const suggestFileReplacements = container.get(SuggestFileReplacements);
        cancellationTokenSource.cancel();

        const handler = suggestFileReplacements.getTool().handler;
        const result = await handler(
            JSON.stringify({
                path: 'test.txt',
                replacements: [{ oldContent: 'old', newContent: 'new', multiple: true }]
            }),
            mockCtx
        );

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('SuggestFileReplacements should have correct ID', () => {
        const suggestFileReplacements = container.get(SuggestFileReplacements);
        expect(SuggestFileReplacements.ID).to.equal('suggestFileReplacements');
        expect(suggestFileReplacements.getTool().id).to.equal('suggestFileReplacements');
    });

    describe('stale file guard', () => {
        /** Stands in for the tracker: the file counts as changed until the agent reads it again. */
        function bindTracker(): FileReadTracker & { stale: boolean } {
            const tracker: FileReadTracker & { stale: boolean } = {
                stale: true,
                recordRead: async () => { tracker.stale = false; },
                isStale: async () => tracker.stale,
                getChangedFiles: async () => []
            };
            container.bind(FileReadTracker).toConstantValue(tracker);
            return tracker;
        }

        it('WriteFileContent refuses to overwrite a file that changed since it was read', async () => {
            bindTracker();
            const handler = container.get(WriteFileContent).getTool().handler;

            const result = await handler(JSON.stringify({ path: 'test.txt', content: 'new content' }), mockCtx);

            const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
            expect(jsonResponse.error).to.match(/changed since you last read it/);
        });

        it('SuggestFileContent refuses to propose overwriting a file that changed since it was read', async () => {
            bindTracker();
            const handler = container.get(SuggestFileContent).getTool().handler;

            const result = await handler(JSON.stringify({ path: 'test.txt', content: 'new content' }), mockCtx);

            const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
            expect(jsonResponse.error).to.match(/changed since you last read it/);
        });

        it('WriteFileContent writes once the agent has read the file again', async () => {
            const tracker = bindTracker();
            const handler = container.get(WriteFileContent).getTool().handler;
            await handler(JSON.stringify({ path: 'test.txt', content: 'new content' }), mockCtx);

            await tracker.recordRead(mockCtx.request.session.id, new URI('file:///workspace/test.txt'));

            const result = await handler(JSON.stringify({ path: 'test.txt', content: 'new content' }), mockCtx);
            expect(result).to.equal('Successfully wrote content to file test.txt.');
        });
    });
});

describe('File Changeset Functions access control', () => {
    let container: Container;
    let ctx: ChatToolContext;
    let written: Array<{ uri: URI; content: string }>;
    let contributedRoots: URI[];

    before(() => { disableJSDOM = enableJSDOM(); });
    after(() => { disableJSDOM(); });

    beforeEach(() => {
        written = [];
        contributedRoots = [];

        const changeSet: Partial<ChangeSet> = {
            addElements: () => true,
            setTitle: () => { },
            removeElements: () => true,
            getElementByURI: () => undefined
        };
        ctx = {
            request: {
                id: 'request-id',
                session: { id: 'session-id', changeSet: changeSet as ChangeSet } as MutableChatModel
            } as MutableChatRequestModel,
            response: {} as MutableChatResponseModel
        };

        container = new Container();
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        container.bind(WorkspaceService).toConstantValue({
            roots: [{ resource: new URI('file:///workspace') }],
            tryGetRoots: () => [{ resource: new URI('file:///workspace') }],
            onWorkspaceChanged: () => ({ dispose: () => { } })
        } as unknown as WorkspaceService);
        container.bind(FileService).toConstantValue({
            exists: async () => true,
            read: async () => ({ value: { toString: () => 'old content' } }),
            watch: () => ({ dispose: () => { } }),
            onDidFilesChange: () => ({ dispose: () => { } })
        } as unknown as FileService);
        container.bind(PreferenceService).toConstantValue({ get: <T>(_path: string, defaultValue: T) => defaultValue });
        container.bind(AiConfigurationService).toConstantValue({
            get: <T>(_name: string, fallback?: T) => fallback,
            ready: Promise.resolve(),
            onDidChangeTrust: () => ({ dispose: () => { } })
        } as unknown as AiConfigurationService);
        container.bind(EnvVariablesServer).toConstantValue({
            getHomeDirUri: async () => 'file:///home/test',
            getConfigDirUri: async () => 'file:///home/test/.theia'
        } as unknown as EnvVariablesServer);
        bindRootContributionProvider(container, AccessibleRootContribution);
        container.bind(AccessibleRootContribution).toConstantValue({ getRoots: async () => contributedRoots });
        container.bind(WorkspaceFunctionScope).toSelf();
        container.bind(ChangeSetFileElementFactory).toConstantValue((args: ChangeSetElementArgs) => ({
            uri: args.uri,
            apply: async () => {
                written.push({ uri: args.uri, content: args.targetState ?? '' });
            }
        } as ChangeSetFileElement));
        container.bind(FileChangeSetTitleProvider).to(DefaultFileChangeSetTitleProvider).inSingletonScope();
        container.bind(ReplaceContentInFileFunctionHelperV2).toSelf();
        container.bind(WriteFileContent).toSelf();
        container.bind(WriteFileReplacements).toSelf();
    });

    const writeContent = (path: string) =>
        container.get(WriteFileContent).getTool().handler(JSON.stringify({ path, content: 'new content' }), ctx) as Promise<string>;
    const writeReplacements = (path: string) =>
        container.get(WriteFileReplacements).getTool().handler(
            JSON.stringify({ path, replacements: [{ oldContent: 'old content', newContent: 'new content' }] }), ctx
        ) as Promise<string>;

    it('refuses to write through a .. traversal instead of escaping the workspace', async () => {
        expect(JSON.parse(await writeContent('../../etc/passwd')).error).to.include('Invalid path');
        expect(JSON.parse(await writeReplacements('../../etc/passwd')).error).to.include('Invalid path');
        expect(written).to.be.empty;
    });

    it('refuses to write to an absolute path outside the workspace', async () => {
        expect(JSON.parse(await writeContent('/etc/passwd')).error).to.include('not allowed');
        expect(JSON.parse(await writeReplacements('/etc/passwd')).error).to.include('not allowed');
        expect(written).to.be.empty;
    });

    it('refuses to write to the user home directory', async () => {
        expect(JSON.parse(await writeContent('~/.ssh/authorized_keys')).error).to.include('not allowed');
        expect(written).to.be.empty;
    });

    it('writes inside the workspace', async () => {
        expect(await writeContent('src/index.ts')).to.include('Successfully');
        expect(written.map(w => w.uri.toString())).to.deep.equal(['file:///workspace/src/index.ts']);
    });

    it('writes to a contributed root such as the memory directory', async () => {
        contributedRoots = [new URI('file:///home/test/.theia/workspace-metadata/uuid/memory')];
        const result = await writeContent('/home/test/.theia/workspace-metadata/uuid/memory/wiki/index.md');
        expect(result).to.include('Successfully');
        expect(written.map(w => w.uri.toString())).to.deep.equal(['file:///home/test/.theia/workspace-metadata/uuid/memory/wiki/index.md']);
    });
});
