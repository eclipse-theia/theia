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
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import { Emitter } from '@theia/core/lib/common/event';
import { interfaces } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService, WorkspaceTrustService } from '@theia/workspace/lib/browser';
import { RPCProtocol } from '../../common/rpc-protocol';
import { WorkspaceRootsChangeEvent } from '../../common/plugin-api-rpc-model';
import { PluginServer } from '../../common/plugin-protocol';
import { WorkspaceMainImpl } from './workspace-main';

after(() => disableJSDOM());

describe('WorkspaceMainImpl', () => {

    const backend = 'file:///project/backend';

    let workspaceChangedEmitter: Emitter<FileStat[]>;
    let names: Map<string, string>;
    let events: WorkspaceRootsChangeEvent[];
    let workspaceMain: WorkspaceMainImpl;

    beforeEach(() => {
        workspaceChangedEmitter = new Emitter<FileStat[]>();
        names = new Map();
        events = [];
        const roots = [FileStat.dir(backend)];
        const services = new Map<interfaces.ServiceIdentifier, object>([
            [WorkspaceService, {
                tryGetRoots: () => roots,
                onWorkspaceChanged: workspaceChangedEmitter.event,
                onWorkspaceLocationChanged: new Emitter().event,
                getWorkspaceRootName: (uri: URI) => names.get(uri.toString())
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
                $updatePluginsWorkspaceData: () => { }
            })
        } as unknown as RPCProtocol;
        workspaceMain = new WorkspaceMainImpl(rpc, container);
    });

    afterEach(() => workspaceMain.dispose());

    it('notifies the plugin host when only the name of a root changes', () => {
        expect(events).to.deep.equal([{ roots: [backend], names: {} }]);

        names.set(backend, 'API Server');
        workspaceChangedEmitter.fire([FileStat.dir(backend)]);
        expect(events).to.deep.equal([{ roots: [backend], names: {} }, { roots: [backend], names: { [backend]: 'API Server' } }]);
    });

    it('does not notify the plugin host when neither the roots nor their names change', () => {
        workspaceChangedEmitter.fire([FileStat.dir(backend)]);
        expect(events).to.have.length(1);
    });
});
