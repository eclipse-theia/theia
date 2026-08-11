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

import { expect } from 'chai';
import * as sinon from 'sinon';
import { CancellationTokenSource, PreferenceService } from '@theia/core';
import { WorkspaceSearchProvider } from './workspace-search-provider';
import { ToolInvocationContext } from '@theia/ai-core';
import { Container } from '@theia/core/shared/inversify';
import { SearchInWorkspaceService, SearchInWorkspaceCallbacks } from '@theia/search-in-workspace/lib/browser/search-in-workspace-service';
import { WorkspaceFunctionScope } from './workspace-functions';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { URI } from '@theia/core/lib/common/uri';
import { SearchInWorkspaceOptions } from '@theia/search-in-workspace/lib/common/search-in-workspace-interface';

describe('Workspace Search Provider Cancellation Tests', () => {
    let cancellationTokenSource: CancellationTokenSource;
    let mockCtx: ToolInvocationContext;
    let container: Container;
    let searchService: SearchInWorkspaceService;

    beforeEach(() => {
        cancellationTokenSource = new CancellationTokenSource();

        // Setup mock context
        mockCtx = {
            cancellationToken: cancellationTokenSource.token
        };

        // Create a new container for each test
        container = new Container();

        // Mock dependencies
        searchService = {
            searchWithCallback: async (
                query: string,
                rootUris: string[],
                callbacks: SearchInWorkspaceCallbacks,
                options: SearchInWorkspaceOptions
            ) => {
                const searchId = 1;
                return searchId;
            },
            cancel: (searchId: number) => {
                // Mock cancellation
            }
        } as unknown as SearchInWorkspaceService;

        const mockWorkspaceScope = {
            getRootMapping: () => new Map([['workspace', new URI('file:///workspace')]]),
            getContainingRoot: () => new URI('file:///workspace'),
            ensureWithinWorkspace: () => { },
            resolveRelativePath: (path: string) => new URI(`file:///workspace/${path}`)
        } as unknown as WorkspaceFunctionScope;

        const mockPreferenceService = {
            get: () => 30
        };

        const mockFileService = {
            exists: async () => true,
            resolve: async () => ({ isDirectory: true })
        } as unknown as FileService;

        // Register mocks in the container
        container.bind(SearchInWorkspaceService).toConstantValue(searchService);
        container.bind(WorkspaceFunctionScope).toConstantValue(mockWorkspaceScope);
        container.bind(PreferenceService).toConstantValue(mockPreferenceService);
        container.bind(FileService).toConstantValue(mockFileService);
        container.bind(WorkspaceSearchProvider).toSelf();
    });

    afterEach(() => {
        cancellationTokenSource.dispose();
    });

    it('should respect cancellation token at the beginning of the search', async () => {
        const searchProvider = container.get(WorkspaceSearchProvider);
        cancellationTokenSource.cancel();

        const handler = searchProvider.getTool().handler;
        const result = await handler(
            JSON.stringify({ query: 'test', useRegExp: false }),
            mockCtx
        );

        const jsonResponse = JSON.parse(result as string);
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('should normalize a string fileExtensions argument into an include array without hanging', async () => {
        let capturedOptions: SearchInWorkspaceOptions | undefined;
        // Rebind the search service so it records the options and immediately completes the search.
        container.rebind(SearchInWorkspaceService).toConstantValue({
            searchWithCallback: async (
                query: string,
                rootUris: string[],
                callbacks: SearchInWorkspaceCallbacks,
                options: SearchInWorkspaceOptions
            ) => {
                capturedOptions = options;
                callbacks.onDone?.(1);
                return 1;
            },
            cancel: () => { }
        } as unknown as SearchInWorkspaceService);

        const searchProvider = container.get(WorkspaceSearchProvider);
        const handler = searchProvider.getTool().handler;
        // The model may emit fileExtensions as a bare string instead of an array.
        const result = await handler(
            JSON.stringify({ query: 'deleteSession', useRegExp: false, fileExtensions: 'spec.ts' }),
            mockCtx
        );

        const jsonResponse = JSON.parse(result as string);
        expect(jsonResponse.error).to.equal(undefined);
        expect(capturedOptions?.include).to.deep.equal(['**/*.spec.ts']);
    });

    it('should time out instead of hanging when the search never reports completion', async () => {
        // Reproduces the original hang: the backend returns a search id but onDone is never called,
        // and previously the search could also never report an id at all.
        container.rebind(SearchInWorkspaceService).toConstantValue({
            searchWithCallback: () => new Promise<number>(() => { /* never resolves: no id, no onDone */ }),
            cancel: () => { }
        } as unknown as SearchInWorkspaceService);

        const searchProvider = container.get(WorkspaceSearchProvider);
        const handler = searchProvider.getTool().handler;

        const clock = sinon.useFakeTimers();
        try {
            const resultPromise = handler(
                JSON.stringify({ query: 'deleteSession', useRegExp: false }),
                mockCtx
            );
            await clock.tickAsync(30000);
            const jsonResponse = JSON.parse(await resultPromise as string);
            expect(jsonResponse.error).to.equal('Search timed out after 30 seconds');
        } finally {
            clock.restore();
        }
    });

    it('should return an error (not hang) when search setup fails', async () => {
        // An empty workspace makes determineSearchRoots throw; the error must surface as a result.
        container.rebind(WorkspaceFunctionScope).toConstantValue({
            getRootMapping: () => new Map()
        } as unknown as WorkspaceFunctionScope);

        const searchProvider = container.get(WorkspaceSearchProvider);
        const handler = searchProvider.getTool().handler;
        const result = await handler(
            JSON.stringify({ query: 'deleteSession', useRegExp: false }),
            mockCtx
        );

        const jsonResponse = JSON.parse(result as string);
        expect(jsonResponse.error).to.equal('No workspace has been opened yet');
    });

    it('should accept an array fileExtensions argument', async () => {
        let capturedOptions: SearchInWorkspaceOptions | undefined;
        container.rebind(SearchInWorkspaceService).toConstantValue({
            searchWithCallback: async (
                query: string,
                rootUris: string[],
                callbacks: SearchInWorkspaceCallbacks,
                options: SearchInWorkspaceOptions
            ) => {
                capturedOptions = options;
                callbacks.onDone?.(1);
                return 1;
            },
            cancel: () => { }
        } as unknown as SearchInWorkspaceService);

        const searchProvider = container.get(WorkspaceSearchProvider);
        const handler = searchProvider.getTool().handler;
        const result = await handler(
            JSON.stringify({ query: 'deleteSession', useRegExp: false, fileExtensions: ['ts', 'js'] }),
            mockCtx
        );

        const jsonResponse = JSON.parse(result as string);
        expect(jsonResponse.error).to.equal(undefined);
        expect(capturedOptions?.include).to.deep.equal(['**/*.ts', '**/*.js']);
    });

});
