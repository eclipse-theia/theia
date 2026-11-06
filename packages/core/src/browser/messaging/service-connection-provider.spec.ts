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
import { Container } from 'inversify';
import * as sinon from 'sinon';
import { Emitter } from '../../common/event.js';
import { Channel, ChannelMultiplexer } from '../../common/message-rpc/channel.js';
import { ChannelPipe } from '../../common/message-rpc/channel.spec.js';
import { wait } from '../../common/promise-util.js';
import { ConnectionSource } from './connection-source.js';
import { ServiceConnectionProvider } from './service-connection-provider.js';

describe('ServiceConnectionProvider', () => {

    let debug: sinon.SinonStub;
    let connections: Emitter<Channel>;
    let provider: ServiceConnectionProvider;
    let opened: Channel[];

    beforeEach(() => {
        // the provider cannot inject a logger, so it reports an interrupted open on the console
        debug = sinon.stub(console, 'debug');
        connections = new Emitter<Channel>();
        const container = new Container();
        container.bind(ConnectionSource).toConstantValue(<ConnectionSource>{ onConnectionDidOpen: connections.event });
        container.bind(ServiceConnectionProvider).toSelf();
        provider = container.get(ServiceConnectionProvider);
        opened = [];
    });

    afterEach(() => {
        debug.restore();
    });

    /** Connects to a backend that holds every channel and then drops the connection. */
    const interrupt = async (): Promise<void> => {
        const connection = new ChannelPipe();
        connections.fire(connection.left);
        await wait(0);
        connection.left.onCloseEmitter.fire({ reason: 'The connection dropped' });
        await wait(0);
    };

    /** Connects to a backend that acknowledges every channel. */
    const connect = async (): Promise<void> => {
        const connection = new ChannelPipe();
        new ChannelMultiplexer(connection.right);
        connections.fire(connection.left);
        await wait(0);
    };

    it('opens a channel again on the next connection when the first open was interrupted', async () => {
        provider.listen('/services/held', (_, channel) => opened.push(channel), true);

        await interrupt();
        expect(opened).to.be.empty;
        sinon.assert.calledOnce(debug);
        expect(debug.firstCall.args[0]).to.equal("Could not open the channel '/services/held', opening it on the next connection:");

        await connect();
        expect(opened).to.have.lengthOf(1);
    });

    it('does not announce another open when an interrupted open is not to be repeated', async () => {
        provider.listen('/services/once', (_, channel) => opened.push(channel), false);

        await interrupt();
        sinon.assert.calledOnce(debug);
        expect(debug.firstCall.args[0]).to.equal("Could not open the channel '/services/once':");

        await connect();
        expect(opened).to.be.empty;
    });
});
