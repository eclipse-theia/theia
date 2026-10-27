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
try {
    FrontendApplicationConfigProvider.set({});
} catch {
    // Already set by another spec in the same run.
}

import { expect } from 'chai';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as types from 'open-collaboration-protocol';
import { ILogger, URI } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { EditorDecoration, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { CollaborationInstance, CollaborationInstanceOptions } from './collaboration-instance';
import { CollaborationUtils } from './collaboration-utils';

disableJSDOM();

type LeaveHandler = (origin: string, peer: types.Peer) => void;

class FakeConnection {
    readonly events: string[] = [];
    leaveResult: Promise<void> = Promise.resolve();
    readonly leaveHandlers: LeaveHandler[] = [];
    readonly room = {
        leave: () => {
            this.events.push('leave');
            return this.leaveResult;
        },
        onLeave: (handler: LeaveHandler) => this.leaveHandlers.push(handler),
        onJoin: () => { },
        onClose: () => { },
        onPermissions: () => { }
    };
    readonly peer = {
        onJoinRequest: () => { },
        onInfo: () => { },
        onInit: () => { }
    };

    dispose(): void {
        this.events.push('close');
    }
}

class FakeEditorWidget {
    decorations: EditorDecoration[] = [];
    readonly editor = {
        deltaDecorations: ({ newDecorations }: { newDecorations: EditorDecoration[] }) => {
            this.decorations = newDecorations;
            return newDecorations.map((_, index) => String(index));
        }
    };

    constructor(readonly uri: URI) { }

    getResourceUri(): URI {
        return this.uri;
    }
}

class TestCollaborationInstance extends CollaborationInstance {
    readonly connection = new FakeConnection();
    readonly warnings: unknown[][] = [];
    readonly editor = new FakeEditorWidget(new URI('file:///a.txt'));
    readonly remoteAwarenesses: awarenessProtocol.Awareness[] = [];

    protected override readonly options = { role: 'guest', connection: this.connection } as unknown as CollaborationInstanceOptions;
    protected override readonly logger = { warn: (...args: unknown[]) => this.warnings.push(args) } as unknown as ILogger;
    protected override readonly utils = {
        getResourceUri: (path?: string) => path ? new URI(`file:///${path}`) : undefined,
        getProtocolPath: (uri?: URI) => uri?.path.base
    } as CollaborationUtils;

    constructor(protected override readonly leaveTimeout = 2_000) {
        super();
    }

    /** What `init` does with the connection, without the services it needs for the rest. */
    connect(): void {
        this.toDispose.push(this.connection);
        this.registerProtocolEvents(this.connection as unknown as types.ProtocolBroadcastConnection);
    }

    /** A peer that joined and selected the first characters of `a.txt`, as its awareness update arrives. */
    addSelectingPeer(id: string): void {
        this.peers.set(id, { peer: { id } as types.Peer, dispose: () => this.peers.delete(id) });
        const text = this.yjs.getText('a.txt');
        text.insert(0, 'hello world');
        const remote = new awarenessProtocol.Awareness(new Y.Doc());
        this.remoteAwarenesses.push(remote);
        remote.setLocalState({
            peer: id,
            selection: {
                path: 'a.txt',
                textSelections: [{
                    start: Y.createRelativePositionFromTypeIndex(text, 1),
                    end: Y.createRelativePositionFromTypeIndex(text, 4),
                    direction: types.SelectionDirection.LeftToRight
                }]
            }
        });
        awarenessProtocol.applyAwarenessUpdate(this.yjsAwareness, awarenessProtocol.encodeAwarenessUpdate(remote, [remote.clientID]), 'remote');
        // What the awareness change listener registered in `init` does.
        this.rerenderPresence();
    }

    destroy(): void {
        this.yjsAwareness.destroy();
        this.remoteAwarenesses.forEach(remote => remote.destroy());
    }

    protected override getOpenEditors(): EditorWidget[] {
        return [this.editor as unknown as EditorWidget];
    }

    protected override getModel(): MonacoEditorModel {
        return { positionAt: (offset: number) => ({ line: 0, character: offset }) } as unknown as MonacoEditorModel;
    }
}

describe('CollaborationInstance leaving a session', () => {

    let instance: TestCollaborationInstance;

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    afterEach(() => instance.destroy());

    describe('leave', () => {

        it('tells the server before it closes the connection', async () => {
            instance = new TestCollaborationInstance();
            instance.connect();
            const sent = new Deferred<void>();
            instance.connection.leaveResult = sent.promise;

            const left = instance.leave();
            await Promise.resolve();
            expect(instance.connection.events).to.deep.equal(['leave']);

            sent.resolve();
            await left;
            expect(instance.connection.events).to.deep.equal(['leave', 'close']);
        });

        it('closes the connection when the leave message isn\'t sent in time', async () => {
            instance = new TestCollaborationInstance(10);
            instance.connect();
            instance.connection.leaveResult = new Deferred<void>().promise;

            await instance.leave();

            expect(instance.connection.events).to.deep.equal(['leave', 'close']);
            expect(instance.warnings).to.have.length(1);
        });

        it('stops waiting when the instance is disposed while leaving', async () => {
            instance = new TestCollaborationInstance(60_000);
            instance.connect();
            instance.connection.leaveResult = new Deferred<void>().promise;

            const left = instance.leave();
            instance.dispose();
            await left;

            expect(instance.connection.events).to.deep.equal(['leave', 'close']);
        });

        it('closes the connection when the leave message fails', async () => {
            instance = new TestCollaborationInstance();
            instance.connect();
            instance.connection.leaveResult = Promise.reject(new Error('connection lost'));

            await instance.leave();

            expect(instance.connection.events).to.deep.equal(['leave', 'close']);
            expect(instance.warnings).to.have.length(1);
        });

        it('sends the leave message once when called again while leaving', async () => {
            instance = new TestCollaborationInstance();
            instance.connect();

            await Promise.all([instance.leave(), instance.leave()]);

            expect(instance.connection.events).to.deep.equal(['leave', 'close']);
        });

        it('sends nothing once the instance is disposed', async () => {
            instance = new TestCollaborationInstance();
            instance.connect();
            instance.dispose();

            await instance.leave();

            expect(instance.connection.events).to.deep.equal(['close']);
        });
    });

    describe('when another peer leaves', () => {

        it('removes the peer\'s cursor right away', () => {
            instance = new TestCollaborationInstance();
            instance.connect();
            instance.addSelectingPeer('peer-1');
            expect(instance.editor.decorations).to.have.length(1);

            instance.connection.leaveHandlers.forEach(handler => handler('', { id: 'peer-1' } as types.Peer));

            expect(instance.editor.decorations).to.deep.equal([]);
        });
    });
});
