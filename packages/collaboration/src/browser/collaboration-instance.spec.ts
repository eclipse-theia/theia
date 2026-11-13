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
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as types from 'open-collaboration-protocol';
import { Emitter, MessageService, URI } from '@theia/core';
import { EditorWidget, Range } from '@theia/editor/lib/browser';
import { CollaborationInstance, CollaborationInstanceOptions } from './collaboration-instance.js';
import { CollaborationUtils } from './collaboration-utils.js';
import { CollaborationWorkspaceService } from './collaboration-workspace-service.js';

disableJSDOM();

class FakeEditorWidget {
    readonly onDidDisposeEmitter = new Emitter<void>();
    readonly onDidDispose = this.onDidDisposeEmitter.event;
    readonly editor = {
        selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 }, direction: 'ltr' },
        onSelectionChanged: new Emitter<Range>().event,
        document: { offsetAt: () => 0 },
        deltaDecorations: () => []
    };

    constructor(readonly uri: URI) { }

    getResourceUri(): URI {
        return this.uri;
    }
}

type JoinRequestHandler = (origin: string, user: types.User) => Promise<types.JoinResponse | undefined>;
type JoinHandler = (origin: string, peer: types.Peer) => Promise<void>;

class TestCollaborationInstance extends CollaborationInstance {
    protected override readonly options = { role: 'host' } as CollaborationInstanceOptions;
    protected override readonly utils = { getProtocolPath: (uri?: URI) => uri?.path.base } as CollaborationUtils;
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

    readonly prompts: string[] = [];
    answer: string | undefined;

    protected override getOpenEditors(): EditorWidget[] {
        return [];
    }

    readonly peerAwarenesses: awarenessProtocol.Awareness[] = [];

    open(widget: FakeEditorWidget): void {
        this.registerPresenceUpdate(widget as unknown as EditorWidget);
        this.activate(widget);
    }

    /** What the shell's active widget listener does for any editor, shared or not. */
    activate(widget: FakeEditorWidget): void {
        this.updateEditorPresence(widget as unknown as EditorWidget);
    }

    share(path: string): void {
        this.setSharedSelection({ path });
    }

    /**
     * The path of this instance's shared selection, as a peer receiving its awareness updates sees it.
     */
    peerView(): () => string | undefined {
        const peer = new awarenessProtocol.Awareness(new Y.Doc());
        this.peerAwarenesses.push(peer);
        const sync = (clients: number[]) => awarenessProtocol.applyAwarenessUpdate(peer, awarenessProtocol.encodeAwarenessUpdate(this.yjsAwareness, clients), 'test');
        sync([this.yjs.clientID]);
        this.yjsAwareness.on('update', ({ added, updated, removed }: Record<string, number[]>) => sync([...added, ...updated, ...removed]));
        return () => peer.getStates().get(this.yjs.clientID)?.selection?.path;
    }

    protected override addPeer(peer: types.Peer): void {
        this.peers.set(peer.id, { peer, dispose: () => { } });
    }

    resolveIdentity(peer: types.Peer): void {
        this.identity.resolve(peer);
    }

    /** Registers the protocol events on a connection that records the join handlers and the data sent to joining guests. */
    registerJoinHandlers(): { joinRequest: JoinRequestHandler, join: JoinHandler, initData: types.InitData[] } {
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
        this.registerProtocolEvents(connection);
        if (!handlers.joinRequest || !handlers.join) {
            throw new Error('the join handlers were not registered');
        }
        return { joinRequest: handlers.joinRequest, join: handlers.join, initData };
    }
}

class AutoAcceptingCollaborationInstance extends TestCollaborationInstance {
    protected override async handleJoinRequest(user: types.User): Promise<types.JoinResponse | undefined> {
        return user.name === 'Alice' ? { workspace: await this.getSharedWorkspace() } : undefined;
    }
}

describe('CollaborationInstance', () => {

    let instance: TestCollaborationInstance;

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => instance = new TestCollaborationInstance());
    afterEach(() => {
        instance['yjsAwareness'].destroy();
        instance.peerAwarenesses.forEach(peer => peer.destroy());
    });

    it('should stop sharing the selection of an editor when it closes', () => {
        const sharedPath = instance.peerView();
        const widget = new FakeEditorWidget(new URI('file:///a.txt'));
        instance.open(widget);
        expect(sharedPath()).to.equal('a.txt');

        widget.onDidDisposeEmitter.fire();

        expect(sharedPath()).to.be.undefined;
    });

    it('should keep sharing the selection of another editor when one closes', () => {
        const sharedPath = instance.peerView();
        const closing = new FakeEditorWidget(new URI('file:///a.txt'));
        const remaining = new FakeEditorWidget(new URI('file:///b.txt'));
        instance.open(closing);
        instance.open(remaining);

        closing.onDidDisposeEmitter.fire();

        expect(sharedPath()).to.equal('b.txt');
    });

    it('should keep sharing the selection when another editor on the same file closes', () => {
        const sharedPath = instance.peerView();
        const closing = new FakeEditorWidget(new URI('file:///a.txt'));
        const remaining = new FakeEditorWidget(new URI('file:///a.txt'));
        instance.open(closing);
        instance.open(remaining);

        closing.onDidDisposeEmitter.fire();

        expect(sharedPath()).to.equal('a.txt');
    });

    it('should stop sharing the selection when its editor closes after an editor that is not shared was active', () => {
        const sharedPath = instance.peerView();
        const shared = new FakeEditorWidget(new URI('file:///a.txt'));
        const notShared = new FakeEditorWidget(new URI('git:///a.txt'));
        instance.open(shared);
        instance.activate(notShared);

        notShared.onDidDisposeEmitter.fire();
        shared.onDidDisposeEmitter.fire();

        expect(sharedPath()).to.be.undefined;
    });

    it('should keep a selection that was shared after the editor', () => {
        const sharedPath = instance.peerView();
        const widget = new FakeEditorWidget(new URI('file:///a.txt'));
        instance.open(widget);
        instance.share('b.txt');

        widget.onDidDisposeEmitter.fire();

        expect(sharedPath()).to.equal('b.txt');
    });

    describe('join requests', () => {

        const HOST = { id: 'host', name: 'Host', host: true } as types.Peer;
        const GUEST = { id: 'guest', name: 'Bob', host: false } as types.Peer;
        const ALICE: types.User = { name: 'Alice' };
        const BOB: types.User = { name: 'Bob', email: 'bob@example.com' };
        const WORKSPACE = { name: 'Collaboration', folders: ['project'] };

        it('should share the workspace when the host allows the user to join', async () => {
            instance.answer = 'Allow';

            const response = await instance.registerJoinHandlers().joinRequest('peer', BOB);

            expect(response).to.deep.equal({ workspace: WORKSPACE });
            expect(instance.prompts).to.deep.equal(["User 'Bob (bob@example.com)' wants to join the collaboration room"]);
        });

        it('should turn the user away when the host denies the request', async () => {
            instance.answer = 'Deny';

            expect(await instance.registerJoinHandlers().joinRequest('peer', ALICE)).to.be.undefined;
        });

        it('should let a subclass decide join requests without asking the host', async () => {
            instance['yjsAwareness'].destroy();
            instance = new AutoAcceptingCollaborationInstance();
            const { joinRequest } = instance.registerJoinHandlers();

            expect(await joinRequest('peer', ALICE)).to.deep.equal({ workspace: WORKSPACE });
            expect(await joinRequest('peer', BOB)).to.be.undefined;
            expect(instance.prompts).to.be.empty;
        });

        it('should send the shared workspace to a guest that joins', async () => {
            instance.resolveIdentity(HOST);
            const { join, initData } = instance.registerJoinHandlers();

            await join('peer', GUEST);

            expect(initData.map(data => data.workspace)).to.deep.equal([WORKSPACE]);
            expect(initData.map(data => data.guests.map(guest => guest.id))).to.deep.equal([['guest']]);
        });
    });
});
