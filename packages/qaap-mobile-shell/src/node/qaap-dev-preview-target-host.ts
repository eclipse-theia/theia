// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as net from 'net';

/**
 * Dev servers on modern Node/macOS may bind only IPv6 `::1` when asked for `localhost`
 * (Vite 7 does), so proxies must try both loopback families before giving up.
 */
export const QAAP_DEV_PREVIEW_TARGET_HOSTS = ['127.0.0.1', '::1'] as const;

const TARGET_HOST_CACHE_TTL_MS = 10_000;
const TARGET_CONNECT_TIMEOUT_MS = 1000;

/**
 * Resolves which loopback address a local dev server actually listens on, with a short
 * per-port cache so request bursts (HTML + assets) do not re-handshake every time.
 */
export class QaapDevPreviewTargetHostResolver {

    protected readonly cache = new Map<number, { host: string; at: number }>();

    async resolve(port: number): Promise<string | undefined> {
        const cached = this.cache.get(port);
        if (cached && Date.now() - cached.at < TARGET_HOST_CACHE_TTL_MS) {
            return cached.host;
        }
        for (const host of QAAP_DEV_PREVIEW_TARGET_HOSTS) {
            if (await this.canConnect(host, port)) {
                this.cache.set(port, { host, at: Date.now() });
                return host;
            }
        }
        this.cache.delete(port);
        return undefined;
    }

    protected canConnect(host: string, port: number): Promise<boolean> {
        return new Promise(resolve => {
            const socket = net.connect({ host, port });
            const done = (ok: boolean): void => {
                socket.destroy();
                resolve(ok);
            };
            socket.setTimeout(TARGET_CONNECT_TIMEOUT_MS);
            socket.once('connect', () => done(true));
            socket.once('timeout', () => done(false));
            socket.once('error', () => done(false));
        });
    }
}
