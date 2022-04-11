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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************
import { assert, expect, spy, use } from 'chai';
import * as spies from 'chai-spies';
import { ArrayBufferReadBuffer, ArrayBufferWriteBuffer } from './array-buffer-message-buffer';
import { ChannelMultiplexer, ForwardingChannel, MessageProvider } from './channel';

use(spies);

/**
 * A pipe with two channels at each end for testing.
 */
export class ChannelPipe {
    readonly left: ForwardingChannel = new ForwardingChannel('left', () => this.right.onCloseEmitter.fire({ reason: 'Left channel has been closed' }), () => {
        const leftWrite = new ArrayBufferWriteBuffer();
        leftWrite.onCommit(buffer => {
            this.right.onMessageEmitter.fire(() => new ArrayBufferReadBuffer(buffer));
        });
        return leftWrite;
    });
    readonly right: ForwardingChannel = new ForwardingChannel('right', () => this.left.onCloseEmitter.fire({ reason: 'Right channel has been closed' }), () => {
        const rightWrite = new ArrayBufferWriteBuffer();
        rightWrite.onCommit(buffer => {
            this.left.onMessageEmitter.fire(() => new ArrayBufferReadBuffer(buffer));
        });
        return rightWrite;
    });
}

describe('multiplexer test', () => {
    it('multiplex message', async () => {
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
});
