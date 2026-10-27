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
import { SearchInWorkspaceService } from '@theia/search-in-workspace/lib/browser/search-in-workspace-service';
import { WorkspaceMainImpl } from './workspace-main.js';

disableJSDOM();

/** Creates a `WorkspaceMainImpl` without the constructor's RPC and container wiring: `$findTextInFiles` only uses the fields set here. */
function createWorkspaceMainImpl(proxy: object, searchInWorkspaceService: Partial<SearchInWorkspaceService>): WorkspaceMainImpl {
    const impl = Object.create(WorkspaceMainImpl.prototype) as WorkspaceMainImpl;
    const fields = impl as unknown as Record<string, unknown>;
    fields.proxy = proxy;
    fields.searchInWorkspaceService = searchInWorkspaceService;
    fields.roots = [];
    fields.workspaceSearch = new Set<number>();
    return impl;
}

describe('WorkspaceMainImpl', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('$findTextInFiles', () => {

        it('should reject and end the search when the search fails to start', async () => {
            const textSearchResults: [number, boolean][] = [];
            const proxy = {
                $onTextSearchResult: (searchRequestId: number, done: boolean) => {
                    textSearchResults.push([searchRequestId, done]);
                }
            };
            const workspaceMain = createWorkspaceMainImpl(proxy, {
                searchWithCallback: () => Promise.reject(new Error('search failed to start'))
            });

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
