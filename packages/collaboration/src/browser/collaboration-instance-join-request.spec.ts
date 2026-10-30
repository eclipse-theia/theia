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
try { FrontendApplicationConfigProvider.set({}); } catch { /* another spec in this run already set it */ }

import { expect } from 'chai';
import * as types from 'open-collaboration-protocol';
import { MessageService } from '@theia/core';
import { CollaborationInstance, CollaborationInstanceOptions } from './collaboration-instance';
import { CollaborationWorkspaceService } from './collaboration-workspace-service';

disableJSDOM();

type JoinRequestHandler = (origin: string, user: types.User) => Promise<types.JoinResponse | undefined>;
type JoinHandler = (origin: string, peer: types.Peer) => Promise<void>;

/** Registers the protocol events on a connection that records the join handlers and the data sent to joining guests. */
function registerProtocolEvents(instance: CollaborationInstance): { joinRequest: JoinRequestHandler, join: JoinHandler, initData: types.InitData[] } {
    const handlers: { joinRequest?: JoinRequestHandler, join?: JoinHandler } = {};
    const initData: types.InitData[] = [];
    const ignore = () => { };
    const connection = {
        peer: {
            onJoinRequest: (handler: JoinRequestHandler) => handlers.joinRequest = handler,
            onInfo: ignore,
            onInit: ignore,
            init: async (_target: string, data: types.InitData) => { initData.push(data); }
        },
        room: { onJoin: (handler: JoinHandler) => handlers.join = handler, onLeave: ignore, onClose: ignore, onPermissions: ignore }
    } as unknown as types.ProtocolBroadcastConnection;
    instance['registerProtocolEvents'](connection);
    if (!handlers.joinRequest || !handlers.join) {
        throw new Error('the join handlers were not registered');
    }
    return { joinRequest: handlers.joinRequest, join: handlers.join, initData };
}

function registerJoinRequestHandler(instance: CollaborationInstance): JoinRequestHandler {
    return registerProtocolEvents(instance).joinRequest;
}

class TestCollaborationInstance extends CollaborationInstance {
    readonly prompts: string[] = [];
    answer: string | undefined;

    protected override readonly options = { role: 'host' } as CollaborationInstanceOptions;
    protected override readonly workspaceService = {
        roots: Promise.resolve([{ name: 'project' }]),
        workspace: undefined
    } as unknown as CollaborationWorkspaceService;
    protected override readonly messageService = {
        info: async (message: string) => {
            this.prompts.push(message);
            return this.answer;
        }
    } as unknown as MessageService;

    protected override addPeer(peer: types.Peer): void {
        this.peers.set(peer.id, { peer, dispose: () => { } });
    }

    resolveIdentity(peer: types.Peer): void {
        this.identity.resolve(peer);
    }
}

class AutoAcceptingCollaborationInstance extends TestCollaborationInstance {
    protected override async handleJoinRequest(user: types.User): Promise<types.JoinResponse | undefined> {
        return user.name === 'Alice' ? { workspace: await this.getSharedWorkspace() } : undefined;
    }
}

const HOST = { id: 'host', name: 'Host', host: true } as types.Peer;
const GUEST = { id: 'guest', name: 'Bob', host: false } as types.Peer;
const ALICE: types.User = { name: 'Alice' };
const BOB: types.User = { name: 'Bob', email: 'bob@example.com' };

describe('CollaborationInstance join requests', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('should share the workspace when the host allows the user to join', async () => {
        const instance = new TestCollaborationInstance();
        instance.answer = 'Allow';

        const response = await registerJoinRequestHandler(instance)('peer', BOB);

        expect(response).to.deep.equal({ workspace: { name: 'Collaboration', folders: ['project'] } });
        expect(instance.prompts).to.deep.equal(["User 'Bob (bob@example.com)' wants to join the collaboration room"]);
    });

    it('should turn the user away when the host denies the request', async () => {
        const instance = new TestCollaborationInstance();
        instance.answer = 'Deny';

        expect(await registerJoinRequestHandler(instance)('peer', ALICE)).to.be.undefined;
    });

    it('should let a subclass decide join requests without asking the host', async () => {
        const instance = new AutoAcceptingCollaborationInstance();
        const handle = registerJoinRequestHandler(instance);

        expect(await handle('peer', ALICE)).to.deep.equal({ workspace: { name: 'Collaboration', folders: ['project'] } });
        expect(await handle('peer', BOB)).to.be.undefined;
        expect(instance.prompts).to.be.empty;
    });

    it('should send the shared workspace to a guest that joins', async () => {
        const instance = new TestCollaborationInstance();
        instance.resolveIdentity(HOST);
        const { join, initData } = registerProtocolEvents(instance);

        await join('peer', GUEST);

        expect(initData.map(data => data.workspace)).to.deep.equal([{ name: 'Collaboration', folders: ['project'] }]);
        expect(initData.map(data => data.guests.map(guest => guest.id))).to.deep.equal([['guest']]);
    });
});
