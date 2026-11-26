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
import { ConnectionClosedError, createProxyIdentifier, RPCProtocolImpl } from './rpc-protocol.js';

interface Greeter {
    $greet(name: string): Promise<string>;
}
const GREETER = createProxyIdentifier<Greeter>('Greeter');

/**
 * Connects a main side serving `greeter` to a plugin host, over a pair of channels that deliver
 * every committed buffer to the peer on a later tick.
 */
function connect(greeter: Greeter): { main: RPCProtocolImpl, host: RPCProtocolImpl } {
    const channels: BasicChannel[] = [];
    const create = (peer: number) => new BasicChannel(() => {
        const writer = new Uint8ArrayWriteBuffer();
        writer.onCommit(buffer => setTimeout(() => channels[peer].onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(buffer)), 0));
        return writer;
    });
    channels.push(create(1), create(0));
    const main = new RPCProtocolImpl(channels[0]);
    main.set(GREETER, greeter);
    return { main, host: new RPCProtocolImpl(channels[1]) };
}

const hello: Greeter = { $greet: async name => `hello ${name}` };

describe('RPCProtocolImpl', () => {

    it('should service requests for registered locals', async () => {
        const { host } = connect(hello);

        expect(await host.getProxy(GREETER).$greet('world')).to.equal('hello world');
    });

    // Disposal clears `locals`, so a late request must report the closed connection.
    it('should report requests handled after disposal as a closed connection', () => {
        const { main } = connect(hello);

        main.dispose();

        expect(() => main.handleRequest('$greet', [GREETER.id, 'world'])).to.throw().that.satisfies(ConnectionClosedError.is);
    });

    it('should reject a peer request sent after disposal', async () => {
        const { main, host } = connect(hello);

        main.dispose();

        // `code` is not carried across the wire, so the peer can only match on the message.
        await host.getProxy(GREETER).$greet('world').then(
            () => expect.fail('expected the request to be rejected'),
            error => expect(error.message).to.equal('connection is closed')
        );
    });

});
