// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import * as express from '@theia/core/shared/express';
import { expect } from 'chai';
import * as http from 'http';
import { AddressInfo } from 'net';
import { ExternalApiEventStream, ExternalApiEventStreamOptions } from './external-api-event-stream';
import { ExternalApiTestSupport } from './test/external-api-test-support';

describe('ExternalApiEventStream', () => {

    let server: http.Server | undefined;

    afterEach(() => {
        server?.close();
        server?.closeAllConnections();
        server = undefined;
    });

    interface ServedStream<T> {
        url: string;
        stream: ExternalApiEventStream<T>;
    }

    async function serve<T>(options: ExternalApiEventStreamOptions<T>): Promise<ServedStream<T>> {
        const stream = ExternalApiTestSupport.createEventStreamFactory()(options);
        const app = express();
        app.get('/events', (request, response) => stream.handle(request, response));
        await new Promise<void>(resolve => {
            server = app.listen(0, '127.0.0.1', () => resolve());
        });
        return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/events`, stream };
    }

    function wait(milliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    it('sends the snapshot to connecting clients', async () => {
        const { url } = await serve({ event: 'items', snapshot: () => ({ items: ['a'] }) });
        const response = await fetch(url);
        const events = ExternalApiTestSupport.sseReader(response);
        const first = await events.next();
        expect(first).to.contain('event: items');
        expect(first).to.contain('data: {"items":["a"]}');
        await events.cancel();
    });

    it('broadcasts a coalesced snapshot on change notifications', async () => {
        let snapshots = 0;
        const { url, stream } = await serve({ event: 'items', coalesceDelay: 25, snapshot: () => ({ snapshot: ++snapshots }) });
        const response = await fetch(url);
        const events = ExternalApiTestSupport.sseReader(response);
        await events.next();
        stream.notifyChanged();
        stream.notifyChanged();
        stream.notifyChanged();
        expect(await events.next()).to.contain('data: {"snapshot":2}');
        const extra = await Promise.race([events.next(), wait(150).then(() => 'no extra push')]);
        expect(extra).to.equal('no extra push');
        await events.cancel();
    });

    it('sends data immediately to all connected clients', async () => {
        const { url, stream } = await serve({ event: 'items', snapshot: () => ({ initial: true }) });
        const first = ExternalApiTestSupport.sseReader(await fetch(url));
        const second = ExternalApiTestSupport.sseReader(await fetch(url));
        await first.next();
        await second.next();
        expect(stream.clientCount).to.equal(2);
        stream.send({ pushed: true } as unknown as { initial: boolean });
        expect(await first.next()).to.contain('data: {"pushed":true}');
        expect(await second.next()).to.contain('data: {"pushed":true}');
        await first.cancel();
        await second.cancel();
    });

    it('ignores change notifications without a snapshot provider', async () => {
        const { url, stream } = await serve<{ pushed: boolean }>({ event: 'items' });
        const response = await fetch(url);
        const events = ExternalApiTestSupport.sseReader(response);
        stream.notifyChanged();
        await wait(150);
        stream.send({ pushed: true });
        expect(await events.next()).to.contain('data: {"pushed":true}');
        await events.cancel();
    });

    it('sends keep-alive heartbeats', async () => {
        const { url } = await serve({ event: 'items', heartbeatInterval: 30, snapshot: () => ({ initial: true }) });
        const response = await fetch(url);
        const events = ExternalApiTestSupport.sseReader(response);
        await events.next();
        expect(await events.next()).to.contain(': keep-alive');
        await events.cancel();
    });

    it('ends client connections on dispose', async () => {
        const { url, stream } = await serve({ event: 'items', snapshot: () => ({ initial: true }) });
        const response = await fetch(url);
        const events = ExternalApiTestSupport.sseReader(response);
        await events.next();
        stream.dispose();
        expect(await events.next()).to.equal(undefined);
        expect(stream.clientCount).to.equal(0);
    });

    it('rejects clients connecting after dispose', async () => {
        const { url, stream } = await serve({ event: 'items', snapshot: () => ({ initial: true }) });
        stream.dispose();
        const response = await fetch(url);
        expect(response.status).to.equal(503);
    });
});
