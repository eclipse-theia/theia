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
import { Emitter } from '@theia/core/lib/common/event';
import { interfaces } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { SearchInWorkspaceService } from '@theia/search-in-workspace/lib/browser/search-in-workspace-service';
import { WorkspaceService, WorkspaceTrustService } from '@theia/workspace/lib/browser';
import { RPCProtocol } from '../../common/rpc-protocol';
import { WorkspaceRootsChangeEvent } from '../../common/plugin-api-rpc-model';
import { PluginServer } from '../../common/plugin-protocol';
import { WorkspaceMainImpl } from './workspace-main';

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

    describe('root names', () => {

        const backend = 'file:///project/backend';

        let workspaceChangedEmitter: Emitter<FileStat[]>;
        let names: Map<string, string>;
        let events: WorkspaceRootsChangeEvent[];
        let storageUpdates: number;
        let workspaceMain: WorkspaceMainImpl;

        beforeEach(() => {
            workspaceChangedEmitter = new Emitter<FileStat[]>();
            names = new Map();
            events = [];
            storageUpdates = 0;
            const roots = [FileStat.dir(backend)];
            const services = new Map<interfaces.ServiceIdentifier, object>([
                [WorkspaceService, {
                    tryGetRoots: () => roots,
                    onWorkspaceChanged: workspaceChangedEmitter.event,
                    onWorkspaceLocationChanged: new Emitter().event,
                    getConfiguredRootName: (uri: URI) => names.get(uri.toString())
                }],
                [WorkspaceTrustService, {
                    getWorkspaceTrust: () => new Promise(() => { }),
                    onDidChangeWorkspaceTrust: new Emitter().event
                }],
                [PluginServer, { getAllStorageValues: async () => ({}) }]
            ]);
            const container = { get: (id: interfaces.ServiceIdentifier) => services.get(id) ?? {} } as interfaces.Container;
            const rpc = {
                getProxy: () => ({
                    $onWorkspaceFoldersChanged: (event: WorkspaceRootsChangeEvent) => events.push(event),
                    $updatePluginsWorkspaceData: () => storageUpdates++
                })
            } as unknown as RPCProtocol;
            workspaceMain = new WorkspaceMainImpl(rpc, container);
        });

        afterEach(() => workspaceMain.dispose());

        it('notifies the plugin host when only the name of a root changes', async () => {
            expect(events).to.deep.equal([{ roots: [backend], names: {} }]);

            names.set(backend, 'API Server');
            workspaceChangedEmitter.fire([FileStat.dir(backend)]);
            expect(events).to.deep.equal([{ roots: [backend], names: {} }, { roots: [backend], names: { [backend]: 'API Server' } }]);

            // The storage of plugins only depends on the roots, so it is sent once for the initial roots
            await new Promise(resolve => setTimeout(resolve));
            expect(storageUpdates).to.equal(1);
        });

        it('does not notify the plugin host when neither the roots nor their names change', () => {
            workspaceChangedEmitter.fire([FileStat.dir(backend)]);
            expect(events).to.have.length(1);
        });
    });
});
