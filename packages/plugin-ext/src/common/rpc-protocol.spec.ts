// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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
import { BasicChannel } from '@theia/core/lib/common/message-rpc/channel';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '@theia/core/lib/common/message-rpc/uint8-array-message-buffer';
import { ConnectionClosedError, createProxyIdentifier, RPCProtocolImpl } from './rpc-protocol';
import { LoggerMain, PLUGIN_RPC_CONTEXT } from './plugin-api-rpc';
import { PluginLogger } from '../plugin/logger';

interface Greeter {
    $greet(name: string): Promise<string>;
}
const GREETER = createProxyIdentifier<Greeter>('Greeter');

/**
 * A pair of connected channels, each delivering every committed buffer to its peer on a later
 * tick. Stands in for the transport between the main side and a plugin host.
 */
function createChannelPair(): [BasicChannel, BasicChannel] {
    const channels: BasicChannel[] = [];
    const create = (peer: number) => new BasicChannel(() => {
        const writer = new Uint8ArrayWriteBuffer();
        writer.onCommit(buffer => setTimeout(() => channels[peer].onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(buffer)), 0));
        return writer;
    });
    channels.push(create(1), create(0));
    return [channels[0], channels[1]];
}

describe('RPCProtocolImpl', () => {

    it('should service requests for registered locals', async () => {
        const [mainChannel, hostChannel] = createChannelPair();
        const main = new RPCProtocolImpl(mainChannel);
        main.set(GREETER, { $greet: async (name: string) => `hello ${name}` });
        const host = new RPCProtocolImpl(hostChannel);

        expect(await host.getProxy(GREETER).$greet('world')).to.equal('hello world');
    });

    // Disposal clears `locals`, so a peer that is unaware of it keeps sending requests. Reporting
    // those as a missing service handler points at an absent binding rather than a closed
    // connection.
    it('should report requests handled after disposal as a closed connection', () => {
        const [mainChannel] = createChannelPair();
        const main = new RPCProtocolImpl(mainChannel);
        main.set(GREETER, { $greet: async (name: string) => `hello ${name}` });

        main.dispose();

        let caught: unknown;
        try {
            main.handleRequest('$greet', [GREETER.id, 'world']);
        } catch (error) {
            caught = error;
        }
        expect(ConnectionClosedError.is(caught), `unexpected error: ${caught}`).to.be.true;
    });

    it('should reject a peer request sent after disposal', async () => {
        const [mainChannel, hostChannel] = createChannelPair();
        const main = new RPCProtocolImpl(mainChannel);
        main.set(GREETER, { $greet: async (name: string) => `hello ${name}` });
        const host = new RPCProtocolImpl(hostChannel);

        main.dispose();

        try {
            await host.getProxy(GREETER).$greet('world');
            throw new Error('expected the request to be rejected');
        } catch (error) {
            // `code` is not carried across the wire, so the peer can only match on the message.
            expect((error as Error).message).to.equal('connection is closed');
        }
    });

    it('should reject in-flight requests when the channel announces its close', async () => {
        const [mainChannel, hostChannel] = createChannelPair();
        const main = new RPCProtocolImpl(mainChannel);
        // never settles, so the request is still in flight when the channel goes down
        main.set(GREETER, { $greet: () => new Promise<string>(() => { }) });
        const host = new RPCProtocolImpl(hostChannel);

        const inFlight = host.getProxy(GREETER).$greet('world');
        hostChannel.onCloseEmitter.fire({ reason: 'connection went down' });

        try {
            await inFlight;
            throw new Error('expected the in-flight request to be rejected');
        } catch (error) {
            expect((error as Error).message).to.equal('connection went down');
        }
    });
});

describe('PluginLogger', () => {

    // The plugin host reports unhandled rejections through `console.error`, which it routes back
    // through this logger. A rejected `$log` that stayed unhandled would therefore log itself,
    // and each report would send further failing logs.
    it('should not leave an unhandled rejection when the main side cannot log', async () => {
        const [mainChannel, hostChannel] = createChannelPair();
        const main = new RPCProtocolImpl(mainChannel);
        const failing: LoggerMain = { $log: () => { throw new Error('main side is gone'); } };
        main.set(PLUGIN_RPC_CONTEXT.LOGGER_MAIN, failing);
        const logger = new PluginLogger(new RPCProtocolImpl(hostChannel), 'plugin-host');

        const rejections: unknown[] = [];
        const onRejection = (reason: unknown) => rejections.push(reason);
        process.on('unhandledRejection', onRejection);
        try {
            logger.error('a log the main side will refuse');
            // two turns of the delivery `setTimeout` plus a macrotask for the rejection to surface
            await new Promise(resolve => setTimeout(resolve, 20));
        } finally {
            process.off('unhandledRejection', onRejection);
        }

        expect(rejections, `unexpected unhandled rejections: ${rejections}`).to.be.empty;
    });
});
