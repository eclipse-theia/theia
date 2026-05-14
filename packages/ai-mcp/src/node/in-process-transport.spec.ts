// *****************************************************************************
// Copyright (C) 2026 Satish Shivaji Rao.
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
import {
    InProcessMCPServerDescription,
    isInProcessMCPServerDescription,
    isLocalMCPServerDescription,
    isRemoteMCPServerDescription,
} from '../common';
import { createInProcessTransportPair, LinkedTransport } from './in-process-transport';

/** Resolve on the next macrotask so queued microtasks have all flushed. */
function flushMicrotasks(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
}

describe('InProcessMCPServerDescription type guards', () => {
    const inProc: InProcessMCPServerDescription = { name: 'plugin-srv', kind: 'in-process' };

    it('isInProcessMCPServerDescription matches the variant', () => {
        expect(isInProcessMCPServerDescription(inProc)).to.be.true;
    });

    it('isLocalMCPServerDescription rejects the in-process variant', () => {
        expect(isLocalMCPServerDescription(inProc)).to.be.false;
    });

    it('isRemoteMCPServerDescription rejects the in-process variant', () => {
        expect(isRemoteMCPServerDescription(inProc)).to.be.false;
    });

    it('isInProcessMCPServerDescription rejects local descriptions', () => {
        expect(isInProcessMCPServerDescription({ name: 'l', command: 'echo' })).to.be.false;
    });

    it('isInProcessMCPServerDescription rejects remote descriptions', () => {
        expect(isInProcessMCPServerDescription({ name: 'r', serverUrl: 'http://x' })).to.be.false;
    });
});

describe('createInProcessTransportPair', () => {
    it('returns linked client + server endpoints', () => {
        const pair = createInProcessTransportPair();
        expect(pair.client).to.exist;
        expect(pair.server).to.exist;
        expect(pair.client.kind).to.equal('in-process');
    });

    it('delivers messages from server to client (via the SdkTransportAdapter)', async () => {
        const pair = createInProcessTransportPair();
        const received: unknown[] = [];
        pair.client.onMessage(msg => received.push(msg));

        const msg = { jsonrpc: '2.0' as const, method: 'ping', params: { from: 'server' } };
        await pair.server.send(msg);
        await flushMicrotasks();

        expect(received).to.deep.equal([msg]);
    });

    it('delivers messages from client to server (raw SDK transport)', async () => {
        const pair = createInProcessTransportPair();
        const received: unknown[] = [];
        pair.server.onmessage = msg => received.push(msg);

        // The SdkTransportAdapter wraps the underlying LinkedTransport;
        // send() goes through the adapter to the inner transport.
        const msg = { jsonrpc: '2.0' as const, method: 'ping', params: { from: 'client' } };
        await pair.client.send(msg);
        await flushMicrotasks();

        expect(received).to.deep.equal([msg]);
    });

    it('delivery is asynchronous — onmessage does not fire reentrantly inside send', async () => {
        const pair = createInProcessTransportPair();
        let sawReentrantDelivery = false;
        pair.server.onmessage = () => { sawReentrantDelivery = true; };

        const sendPromise = pair.client.send({ jsonrpc: '2.0' as const, method: 'ping' });
        // Right after the synchronous send-call returns: nothing delivered yet.
        expect(sawReentrantDelivery).to.be.false;
        await sendPromise;
        // Even after awaiting the send, the microtask may or may not have
        // flushed depending on engine — but explicitly flushing must show it.
        await flushMicrotasks();
        expect(sawReentrantDelivery).to.be.true;
    });

    it('preserves multi-message ordering', async () => {
        const pair = createInProcessTransportPair();
        const received: unknown[] = [];
        pair.server.onmessage = msg => received.push(msg);

        await pair.client.send({ i: 1 });
        await pair.client.send({ i: 2 });
        await pair.client.send({ i: 3 });
        await flushMicrotasks();

        expect(received).to.deep.equal([{ i: 1 }, { i: 2 }, { i: 3 }]);
    });

    it('mutual close: closing client fires onclose on server', async () => {
        const pair = createInProcessTransportPair();
        let serverClosed = false;
        pair.server.onclose = () => { serverClosed = true; };

        await pair.client.close();
        await flushMicrotasks();

        expect(serverClosed).to.be.true;
    });

    it('mutual close: closing server fires onClose on client', async () => {
        const pair = createInProcessTransportPair();
        const closes: Array<Error | undefined> = [];
        pair.client.onClose(err => closes.push(err));

        await pair.server.close();
        await flushMicrotasks();

        expect(closes).to.have.length(1);
        expect(closes[0]).to.be.undefined;
    });

    it('close is idempotent — repeated close calls fire onclose only once', async () => {
        const pair = createInProcessTransportPair();
        let serverCloses = 0;
        pair.server.onclose = () => { serverCloses += 1; };

        await pair.client.close();
        await pair.client.close();
        await pair.client.close();
        await flushMicrotasks();

        expect(serverCloses).to.equal(1);
    });

    it('send after close throws', async () => {
        const pair = createInProcessTransportPair();
        await pair.client.close();
        await flushMicrotasks();

        let threw: unknown;
        try {
            await pair.client.send({ should: 'fail' });
        } catch (err) {
            threw = err;
        }
        expect(threw).to.be.instanceOf(Error);
    });

    it('send to a closed peer drops silently (defensive code path)', async () => {
        // The public createInProcessTransportPair API enforces mutual
        // close, so this case isn't reachable from a real consumer.
        // Construct LinkedTransports directly to verify the defensive
        // "peer closed, we're not" branch in send() does the right thing.
        const a = new LinkedTransport();
        const b = new LinkedTransport();
        a.peer = b;
        b.peer = a;
        // Mark b closed without going through close() (which would
        // mutual-close a too).
        (b as unknown as { closed: boolean }).closed = true;
        await a.send({ jsonrpc: '2.0' as const, method: 'ping' });
    });

    it('start() is a no-op (linked-pair is connected on construction)', async () => {
        const pair = createInProcessTransportPair();
        await pair.server.start(); // does not throw
        // Verify the transport remains usable after start.
        const received: unknown[] = [];
        pair.server.onmessage = m => received.push(m);
        await pair.client.send({ k: 'v' });
        await flushMicrotasks();
        expect(received).to.deep.equal([{ k: 'v' }]);
    });
});
