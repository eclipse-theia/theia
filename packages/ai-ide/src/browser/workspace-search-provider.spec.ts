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
import { CancellationTokenSource } from '@theia/core';
import { WorkspaceSearchProvider } from './workspace-search-provider';
import { MutableChatRequestModel, MutableChatResponseModel } from '@theia/ai-chat';
import { Container } from '@theia/core/shared/inversify';
import { SearchInWorkspaceService, SearchInWorkspaceCallbacks } from '@theia/search-in-workspace/lib/browser/search-in-workspace-service';
import { WorkspaceFunctionScope } from './workspace-functions';
import { PreferenceService } from '@theia/core/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { URI } from '@theia/core/lib/common/uri';
import { SearchInWorkspaceOptions } from '@theia/search-in-workspace/lib/common/search-in-workspace-interface';

describe('Workspace Search Provider Cancellation Tests', () => {
    let cancellationTokenSource: CancellationTokenSource;
    let mockCtx: Partial<MutableChatRequestModel>;
    let container: Container;
    let searchService: SearchInWorkspaceService;

    beforeEach(() => {
        cancellationTokenSource = new CancellationTokenSource();

        // Setup mock context
        mockCtx = {
            response: {
                cancellationToken: cancellationTokenSource.token
            } as MutableChatResponseModel
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
            getWorkspaceRoot: async () => new URI('file:///workspace'),
            ensureWithinWorkspace: () => { },
            resolveRelativePath: async (path: string) => new URI(`file:///workspace/${path}`)
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
            mockCtx as MutableChatRequestModel
        );

        const jsonResponse = JSON.parse(result as string);
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

});
