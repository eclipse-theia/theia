// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import { ChannelMultiplexer } from '../../common/message-rpc/channel.js';
import { ChannelPipe } from '../../common/message-rpc/channel.spec.js';
import { Deferred, wait } from '../../common/promise-util.js';
import { GatedChannelMultiplexer } from './gated-channel-multiplexer.js';

describe('GatedChannelMultiplexer', () => {

    const setup = (): { pipe: ChannelPipe, gate: Deferred<void>, frontend: ChannelMultiplexer, backend: GatedChannelMultiplexer, opened: string[] } => {
        const pipe = new ChannelPipe();
        const gate = new Deferred<void>();
        const frontend = new ChannelMultiplexer(pipe.left);
        const backend = new GatedChannelMultiplexer(pipe.right, id => id.startsWith('/held') ? gate.promise : undefined);
        const opened: string[] = [];
        backend.onDidOpenChannel(({ id }) => opened.push(id));
        return { pipe, gate, frontend, backend, opened };
    };

    it('acknowledges a held channel only once the gate has opened', async () => {
        const { gate, frontend, opened } = setup();
        let acknowledged = false;
        const open = frontend.open('/held/task').then(channel => {
            acknowledged = true;
            return channel;
        });
        await wait(0);
        expect(acknowledged).to.be.false;
        expect(opened).to.be.empty;
        gate.resolve();
        await open;
        expect(opened).to.deep.equal(['/held/task']);
    });

    it('acknowledges a channel that the gate lets through at once', async () => {
        const { frontend, opened } = setup();
        await frontend.open('/services/filesystem');
        expect(opened).to.deep.equal(['/services/filesystem']);
    });

    it('delivers a message sent right after the acknowledgement to the handler attached when the channel opened', async () => {
        const { gate, frontend, backend } = setup();
        const received: string[] = [];
        backend.onDidOpenChannel(event => event.channel.onMessage(buffer => received.push(buffer().readString())));
        const open = frontend.open('/held/task');
        gate.resolve();
        const channel = await open;
        channel.getWriteBuffer().writeString('hello').commit();
        expect(received).to.deep.equal(['hello']);
    });

    it('does not open a held channel once the connection has closed', async () => {
        const { pipe, gate, frontend, opened } = setup();
        let rejected: unknown;
        const open = frontend.open('/held/task').catch(error => { rejected = error; });
        // the socket closes: each side learns of it through its own channel
        pipe.right.onCloseEmitter.fire({ reason: 'The frontend went away' });
        pipe.left.onCloseEmitter.fire({ reason: 'The backend went away' });
        gate.resolve();
        await wait(0);
        expect(opened).to.be.empty;
        await open;
        expect(rejected).to.be.instanceOf(Error);
    });
});
