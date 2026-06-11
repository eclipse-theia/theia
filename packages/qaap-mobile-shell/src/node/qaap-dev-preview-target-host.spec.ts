// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import * as http from 'http';
import * as net from 'net';
import { QaapDevPreviewTargetHostResolver } from './qaap-dev-preview-target-host';

function listen(server: http.Server, host: string): Promise<number> {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, host, () => {
            resolve((server.address() as net.AddressInfo).port);
        });
    });
}

function close(server: http.Server): Promise<void> {
    return new Promise(resolve => server.close(() => resolve()));
}

describe('QaapDevPreviewTargetHostResolver', () => {

    it('resolves 127.0.0.1 for an IPv4 loopback server', async () => {
        const server = http.createServer((_req, res) => res.end('ok'));
        const port = await listen(server, '127.0.0.1');
        try {
            expect(await new QaapDevPreviewTargetHostResolver().resolve(port)).to.equal('127.0.0.1');
        } finally {
            await close(server);
        }
    });

    it('falls back to ::1 when the server only listens on IPv6 (Vite 7 on macOS)', async function (): Promise<void> {
        const server = http.createServer((_req, res) => res.end('ok'));
        let port: number;
        try {
            port = await listen(server, '::1');
        } catch {
            this.skip(); // environment without IPv6 loopback
            return;
        }
        try {
            expect(await new QaapDevPreviewTargetHostResolver().resolve(port)).to.equal('::1');
        } finally {
            await close(server);
        }
    });

    it('returns undefined when nothing listens on the port', async () => {
        const server = http.createServer((_req, res) => res.end('ok'));
        const port = await listen(server, '127.0.0.1');
        await close(server);
        expect(await new QaapDevPreviewTargetHostResolver().resolve(port)).to.equal(undefined);
    });
});
