// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Event } from '@theia/core';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { EncodingRegistry } from '@theia/core/lib/browser/encoding-registry';
import { RequestService } from '@theia/core/shared/@theia/request';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { FileSystemPreferences } from '@theia/filesystem/lib/common';
import { MonacoQuickInputService } from '@theia/monaco/lib/browser/monaco-quick-input-service';
import { SearchInWorkspaceService } from '@theia/search-in-workspace/lib/browser/search-in-workspace-service';
import { CanonicalUriService, WorkspaceService, WorkspaceTrustService } from '@theia/workspace/lib/browser';
import { TextContentResourceResolver, WorkspaceMainImpl } from './workspace-main';
import { RPCProtocol } from '../../common/rpc-protocol';
import { PluginServer } from '../../common/plugin-protocol';

disableJSDOM();

describe('WorkspaceMainImpl', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('$findTextInFiles', () => {

        it('should reject and end the search when the search fails to start', async () => {
            const textSearchResults: [number, boolean][] = [];
            const proxy = new Proxy({}, {
                get: (_, method) => (...args: unknown[]) => {
                    if (method === '$onTextSearchResult') {
                        textSearchResults.push([args[0] as number, args[1] as boolean]);
                    }
                    return Promise.resolve(undefined);
                }
            });
            const rpc = { getProxy: () => proxy } as unknown as RPCProtocol;
            const searchService = {
                searchWithCallback: () => Promise.reject(new Error('search failed to start'))
            };

            const container = new Container();
            container.bind(SearchInWorkspaceService).toConstantValue(searchService as unknown as SearchInWorkspaceService);
            container.bind(WorkspaceService).toConstantValue({
                tryGetRoots: () => [],
                onWorkspaceChanged: Event.None,
                onWorkspaceLocationChanged: Event.None
            } as unknown as WorkspaceService);
            container.bind(WorkspaceTrustService).toConstantValue({
                getWorkspaceTrust: () => new Promise(() => { }),
                onDidChangeWorkspaceTrust: Event.None
            } as unknown as WorkspaceTrustService);
            container.bind(PluginServer).toConstantValue({ getAllStorageValues: async () => ({}) } as unknown as PluginServer);
            for (const id of [MonacoQuickInputService, FileSearchService, TextContentResourceResolver, RequestService,
                CanonicalUriService, EncodingRegistry, FileSystemPreferences, PreferenceService]) {
                container.bind<object>(id).toConstantValue({});
            }
            const workspaceMain = new WorkspaceMainImpl(rpc, container);

            let timer: ReturnType<typeof setTimeout> | undefined;
            const result = await Promise.race([
                workspaceMain.$findTextInFiles({ pattern: 'needle' }, {}, 7).then(() => 'resolved', (error: Error) => error.message),
                new Promise(resolve => timer = setTimeout(() => resolve('still pending'), 500))
            ]);
            clearTimeout(timer);

            expect(result).to.equal('search failed to start');
            expect(textSearchResults).to.deep.equal([[7, true]]);
        });
    });
});
