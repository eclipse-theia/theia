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
/* eslint-disable @typescript-eslint/no-explicit-any */

import { assert, expect, spy, use } from 'chai';
import * as spies from 'chai-spies';
import { ChannelMultiplexer, SubChannel, } from './channel-multiplexer';

use(spies);

/**
 * A pipe with two channels at each end for testing.
 */
export class ChannelPipe {
    readonly left: SubChannel = new SubChannel('left', msg => {
        this.right.onMessageEmitter.fire(msg);
    },
        () => this.right.onCloseEmitter.fire({ reason: 'Left channel has been closed' }));
    readonly right: SubChannel = new SubChannel('right', msg => this.left.onMessageEmitter.fire(msg),
        () => this.left.onCloseEmitter.fire({ reason: 'Right channel has been closed' }));
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

            const leftFirst = await leftMultiplexer.openChannel('first');
            const leftSecond = await leftMultiplexer.openChannel('second');

            const rightFirst = rightMultiplexer.getOpenChannel('first');
            const rightSecond = rightMultiplexer.getOpenChannel('second');

            assert.isNotNull(rightFirst);
            assert.isNotNull(rightSecond);

            const leftSecondSpy = spy((message: any) => {
                expect(message).equal('message for second');
            });

            leftSecond.onMessage(leftSecondSpy);

            const rightFirstSpy = spy((message: any) => {
                expect(message).equal('message for first');
            });

            rightFirst!.onMessage(rightFirstSpy);

            leftFirst.send('message for first');
            rightSecond!.send('message for second');

            expect(leftSecondSpy).to.be.called();
            expect(rightFirstSpy).to.be.called();

            expect(openChannelSpy).to.be.called.exactly(4);
        });
    });
});
