// *****************************************************************************
// Copyright (C) 2021 Red Hat, Inc. and others.
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

import { assert, expect, spy, use } from 'chai';
import * as spies from 'chai-spies';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from './uint8-array-message-buffer';
import { ChannelMultiplexer, ForwardingChannel, MessageProvider } from './channel';
import { RpcProtocol } from './rpc-protocol';

use(spies);

/**
 * A pipe with two channels at each end for testing.
 */
export class ChannelPipe {
    readonly left: ForwardingChannel = new ForwardingChannel('left', () => this.right.onCloseEmitter.fire({ reason: 'Left channel has been closed' }), () => {
        const leftWrite = new Uint8ArrayWriteBuffer();
        leftWrite.onCommit(buffer => {
            this.right.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(buffer));
        });
        return leftWrite;
    });
    readonly right: ForwardingChannel = new ForwardingChannel('right', () => this.left.onCloseEmitter.fire({ reason: 'Right channel has been closed' }), () => {
        const rightWrite = new Uint8ArrayWriteBuffer();
        rightWrite.onCommit(buffer => {
            this.left.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(buffer));
        });
        return rightWrite;
    });
}
describe('Message Channel', () => {
    describe('Channel multiplexer', () => {
        it('should forward messages to intended target channel', async () => {
            const pipe = new ChannelPipe();

            const leftMultiplexer = new ChannelMultiplexer(pipe.left);
            const rightMultiplexer = new ChannelMultiplexer(pipe.right);
            const openChannelSpy = spy(() => {
            });

            rightMultiplexer.onDidOpenChannel(openChannelSpy);
            leftMultiplexer.onDidOpenChannel(openChannelSpy);

            const leftFirst = await leftMultiplexer.open('first');
            const leftSecond = await leftMultiplexer.open('second');

            const rightFirst = rightMultiplexer.getOpenChannel('first');
            const rightSecond = rightMultiplexer.getOpenChannel('second');

            assert.isNotNull(rightFirst);
            assert.isNotNull(rightSecond);

            const leftSecondSpy = spy((buf: MessageProvider) => {
                const message = buf().readString();
                expect(message).equal('message for second');
            });

            leftSecond.onMessage(leftSecondSpy);

            const rightFirstSpy = spy((buf: MessageProvider) => {
                const message = buf().readString();
                expect(message).equal('message for first');
            });

            rightFirst!.onMessage(rightFirstSpy);

            leftFirst.getWriteBuffer().writeString('message for first').commit();
            rightSecond!.getWriteBuffer().writeString('message for second').commit();

            expect(leftSecondSpy).to.be.called();
            expect(rightFirstSpy).to.be.called();

            expect(openChannelSpy).to.be.called.exactly(4);
        });

        it('should reject pending open() promises when underlying channel closes', async () => {
            const pipe = new ChannelPipe();
            const leftMultiplexer = new ChannelMultiplexer(pipe.left);
            // Don't create a right multiplexer, so no AckOpen will arrive

            const openPromise = leftMultiplexer.open('test');

            // Close the underlying channel
            pipe.left.onCloseEmitter.fire({ reason: 'test close' });

            // The open promise should reject, not hang forever
            try {
                await openPromise;
                assert.fail('Expected open() promise to be rejected');
            } catch (err) {
                expect(err).to.be.instanceOf(Error);
                expect((err as Error).message).to.contain('test close');
            }
        });

        it('should fire onClose on sub-channels when underlying channel closes', async () => {
            const pipe = new ChannelPipe();
            const leftMultiplexer = new ChannelMultiplexer(pipe.left);
            const rightMultiplexer = new ChannelMultiplexer(pipe.right);

            const leftChannel = await leftMultiplexer.open('test');
            const rightChannel = rightMultiplexer.getOpenChannel('test');
            assert.isDefined(rightChannel);

            const leftCloseSpy = spy(() => { });
            leftChannel.onClose(leftCloseSpy);

            // Close the underlying channel from the remote side
            pipe.left.onCloseEmitter.fire({ reason: 'underlying closed' });

            expect(leftCloseSpy).to.have.been.called();
        });
    });

    describe('Channel close event ordering', () => {
        it('should not deliver onClose after close() has been called', () => {
            const channel = new ForwardingChannel('test', () => { }, () => new Uint8ArrayWriteBuffer());

            const closeSpy = spy(() => { });
            channel.onClose(closeSpy);

            // Bug pattern: close() first (disposes emitters), then fire (no-op)
            channel.close();
            channel.onCloseEmitter.fire({ reason: 'too late' });

            // The listener should not be called because close() already disposed the emitter
            expect(closeSpy).to.not.have.been.called();
        });

        it('should deliver onClose when fired before close()', () => {
            const channel = new ForwardingChannel('test', () => { }, () => new Uint8ArrayWriteBuffer());

            const closeSpy = spy(() => { });
            channel.onClose(closeSpy);

            // Correct pattern: fire first, then close
            channel.onCloseEmitter.fire({ reason: 'proper close' });
            channel.close();

            expect(closeSpy).to.have.been.called();
        });
    });

    describe('RPC protocol with write buffer overflow', () => {
        it('should reject the promise when commit fails due to buffer overflow', async () => {
            // Simulate a channel whose write buffer throws on commit (e.g. SocketWriteBuffer overflow)
            const channel = new ForwardingChannel('test', () => { }, () => {
                const buffer = new Uint8ArrayWriteBuffer();
                buffer.onCommit(() => {
                    throw new Error('Max disconnected buffer size exceeded');
                });
                return buffer;
            });

            const protocol = new RpcProtocol(channel, undefined, { mode: 'clientOnly' });

            // sendRequest should return a rejected promise, not throw synchronously
            const promise = protocol.sendRequest('testMethod', []);

            try {
                await promise;
                assert.fail('Expected promise to be rejected');
            } catch (err) {
                expect(err).to.be.instanceOf(Error);
                expect((err as Error).message).to.contain('buffer size exceeded');
            }
        });

        it('should not leak pending requests when commit fails', async () => {
            const channel = new ForwardingChannel('test', () => { }, () => {
                const buffer = new Uint8ArrayWriteBuffer();
                buffer.onCommit(() => {
                    throw new Error('Max disconnected buffer size exceeded');
                });
                return buffer;
            });

            const protocol = new RpcProtocol(channel, undefined, { mode: 'clientOnly' });

            // sendRequest should return a rejected promise and clean up pendingRequests
            try {
                await protocol.sendRequest('testMethod', []);
            } catch {
                // expected: the promise is rejected due to buffer overflow
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((protocol as any).pendingRequests.size).to.equal(0);
        });
    });
});
