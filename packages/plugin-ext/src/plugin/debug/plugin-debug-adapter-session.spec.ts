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

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Emitter } from '@theia/core/lib/common/event';
import { DebugAdapter } from '@theia/debug/lib/common/debug-model';
import { DebugChannel } from '@theia/debug/lib/common/debug-service';
import * as theia from '@theia/plugin';
import { PluginDebugAdapterSession } from './plugin-debug-adapter-session';
import { PluginDebugAdapterTracker } from './plugin-debug-adapter-tracker';

class FakeDebugAdapter implements DebugAdapter {
    readonly received: string[] = [];
    readonly messageEmitter = new Emitter<string>({ errorHandling: 'propagate' });
    readonly onMessageReceived = this.messageEmitter.event;
    readonly onError = new Emitter<Error>().event;
    readonly onClose = new Emitter<void>().event;
    send(message: string): void {
        this.received.push(message);
    }
    async stop(): Promise<void> { }
}

class FakeDebugChannel implements DebugChannel {
    readonly sent: string[] = [];
    protected messageHandler: ((message: string) => void) | undefined;
    send(content: string): void {
        this.sent.push(content);
    }
    onMessage(cb: (message: string) => void): void {
        this.messageHandler = cb;
    }
    onError(): void { }
    onClose(): void { }
    close(): void { }
    fromClient(message: string): void {
        this.messageHandler!(message);
    }
}

describe('PluginDebugAdapterSession', () => {

    const setBreakpoints = JSON.stringify({
        seq: 3, type: 'request', command: 'setBreakpoints',
        arguments: { source: { path: '/workspace/main.lua' }, breakpoints: [{ line: 2 }] }
    });
    const stopped = JSON.stringify({ seq: 7, type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } });

    const configuration: theia.DebugConfiguration = { type: 'lua', name: 'Launch', request: 'launch' };
    const theiaSession: theia.DebugSession = {
        id: 'session',
        type: configuration.type,
        name: configuration.name,
        workspaceFolder: undefined,
        configuration,
        customRequest: async () => undefined,
        getDebugProtocolBreakpoint: async () => undefined
    };

    let adapter: FakeDebugAdapter;
    let channel: FakeDebugChannel;

    async function startSession(tracker: theia.DebugAdapterTracker | undefined): Promise<void> {
        adapter = new FakeDebugAdapter();
        channel = new FakeDebugChannel();
        await new PluginDebugAdapterSession(adapter, tracker, theiaSession).start(channel);
    }

    it('sends a request to the adapter as modified by onWillReceiveMessage', async () => {
        await startSession({
            onWillReceiveMessage: message => {
                message.arguments = { ...message.arguments, sourceContent: 'print(1)' };
            }
        });

        channel.fromClient(setBreakpoints);

        expect(adapter.received).to.have.length(1);
        expect(JSON.parse(adapter.received[0]).arguments.sourceContent).to.equal('print(1)');
    });

    it('sends a message to the client as modified by onDidSendMessage', async () => {
        await startSession({
            onDidSendMessage: message => {
                message.body = { ...message.body, description: 'Paused on breakpoint' };
            }
        });

        adapter.messageEmitter.fire(stopped);

        expect(channel.sent).to.have.length(1);
        expect(JSON.parse(channel.sent[0]).body.description).to.equal('Paused on breakpoint');
    });

    it('passes messages through unchanged when the tracker does not modify them', async () => {
        const seen: unknown[] = [];
        await startSession({
            onWillReceiveMessage: message => seen.push(message),
            onDidSendMessage: message => seen.push(message)
        });

        channel.fromClient(setBreakpoints);
        adapter.messageEmitter.fire(stopped);

        expect(seen).to.deep.equal([JSON.parse(setBreakpoints), JSON.parse(stopped)]);
        expect(adapter.received).to.deep.equal([setBreakpoints]);
        expect(channel.sent).to.deep.equal([stopped]);
    });

    it('passes messages through verbatim when no tracker factory applies to the session', async () => {
        const tracker = await PluginDebugAdapterTracker.create(theiaSession, [
            ['node', { createDebugAdapterTracker: () => ({ onWillReceiveMessage: () => { } }) }],
            ['lua', { createDebugAdapterTracker: () => undefined }]
        ]);
        expect(tracker).to.equal(undefined);
        await startSession(tracker);
        const request = JSON.stringify(JSON.parse(setBreakpoints), undefined, 2);
        const event = JSON.stringify(JSON.parse(stopped), undefined, 2);

        channel.fromClient(request);
        adapter.messageEmitter.fire(event);

        expect(adapter.received).to.deep.equal([request]);
        expect(channel.sent).to.deep.equal([event]);
    });

    it('still sends a message to the client when onDidSendMessage throws', async () => {
        await startSession({
            onDidSendMessage: () => {
                throw new Error('tracker failure');
            }
        });

        expect(() => adapter.messageEmitter.fire(stopped)).to.throw('tracker failure');
        expect(channel.sent).to.deep.equal([stopped]);
    });

    it('still sends a request to the adapter when onWillReceiveMessage throws', async () => {
        await startSession({
            onWillReceiveMessage: () => {
                throw new Error('tracker failure');
            }
        });

        expect(() => channel.fromClient(setBreakpoints)).to.throw('tracker failure');
        expect(adapter.received).to.deep.equal([setBreakpoints]);
    });

    it('starts the session without trackers whose factory throws or rejects', async () => {
        const consoleError = sinon.stub(console, 'error');
        try {
            const tracker = await PluginDebugAdapterTracker.create(theiaSession, [
                ['*', {
                    createDebugAdapterTracker: () => {
                        throw new Error('factory failure');
                    }
                }],
                ['*', { createDebugAdapterTracker: () => Promise.reject(new Error('factory failure')) }],
                ['lua', {
                    createDebugAdapterTracker: () => ({
                        onWillReceiveMessage: message => {
                            message.arguments = { ...message.arguments, sourceContent: 'print(1)' };
                        }
                    })
                }]
            ]);
            await startSession(tracker);

            channel.fromClient(setBreakpoints);

            expect(JSON.parse(adapter.received[0]).arguments.sourceContent).to.equal('print(1)');
            expect(consoleError.callCount).to.equal(2);
        } finally {
            consoleError.restore();
        }
    });

    it('keeps calling the other trackers when one of them throws', async () => {
        const consoleError = sinon.stub(console, 'error');
        try {
            const failure = (): void => {
                throw new Error('tracker failure');
            };
            await startSession(await PluginDebugAdapterTracker.create(theiaSession, [
                ['*', { createDebugAdapterTracker: () => ({ onWillReceiveMessage: failure, onDidSendMessage: failure }) }],
                ['lua', {
                    createDebugAdapterTracker: () => ({
                        onWillReceiveMessage: message => {
                            message.arguments = { ...message.arguments, sourceContent: 'print(1)' };
                        },
                        onDidSendMessage: message => {
                            message.body = { ...message.body, description: 'Paused on breakpoint' };
                        }
                    })
                }]
            ]));

            channel.fromClient(setBreakpoints);
            adapter.messageEmitter.fire(stopped);

            expect(JSON.parse(adapter.received[0]).arguments.sourceContent).to.equal('print(1)');
            expect(JSON.parse(channel.sent[0]).body.description).to.equal('Paused on breakpoint');
            expect(consoleError.callCount).to.equal(2);
        } finally {
            consoleError.restore();
        }
    });
});
