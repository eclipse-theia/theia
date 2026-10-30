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
import { Emitter, URI } from '@theia/core';
import { EditorWidget, Range } from '@theia/editor/lib/browser';
import { CollaborationInstance, CollaborationInstanceOptions } from './collaboration-instance';
import { CollaborationUtils } from './collaboration-utils';

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

class TestCollaborationInstance extends CollaborationInstance {
    protected override readonly options = { role: 'host' } as CollaborationInstanceOptions;
    protected override readonly utils = { getProtocolPath: (uri?: URI) => uri?.path.base } as CollaborationUtils;

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
});
