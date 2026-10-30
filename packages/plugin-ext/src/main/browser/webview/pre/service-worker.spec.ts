// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// https://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

const SERVICE_WORKER = fs.readFileSync(path.join(__dirname, '../../../../../src/main/browser/webview/pre/service-worker.js'), 'utf8');
const ORIGIN = 'http://webview.test';
const RESOURCE = '/file///workspace/plot.png';

interface LoadResourceMessage {
    channel: string;
    path: string;
    query: string;
}

interface WorkerEvent {
    request?: { url: string };
    clientId?: string;
    respondWith?: (response: Promise<Response>) => void;
    data?: unknown;
    source?: { url: string };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

function startServiceWorker(): {
    loads: LoadResourceMessage[];
    fetch(query: string): Promise<string>;
    answer(query: string, body: string): void;
    dispose(): void;
} {
    const listeners = new Map<string, (event: WorkerEvent) => unknown>();
    const timers: NodeJS.Timeout[] = [];
    const loads: LoadResourceMessage[] = [];
    const outer = {
        url: `${ORIGIN}/webview/index.html?id=preview`,
        postMessage: (message: LoadResourceMessage) => loads.push(message)
    };
    const inner = { id: 'inner', url: `${ORIGIN}/webview/fake.html?id=preview` };
    const self = {
        location: new URL(`${ORIGIN}/webview/service-worker.js`),
        origin: ORIGIN,
        addEventListener: (type: string, handler: (event: WorkerEvent) => unknown) => listeners.set(type, handler),
        clients: {
            get: async (id: string) => id === inner.id ? inner : undefined,
            matchAll: async () => [outer, inner]
        }
    };
    vm.runInNewContext(SERVICE_WORKER, {
        self, URL, Response, console, clearTimeout,
        setTimeout: (callback: () => void, ms: number) => {
            const timer = setTimeout(callback, ms);
            timers.push(timer);
            return timer;
        }
    });
    const listener = (type: string) => {
        const found = listeners.get(type);
        if (!found) {
            throw new Error(`The service worker registered no ${type} listener`);
        }
        return found;
    };
    return {
        loads,
        async fetch(query: string): Promise<string> {
            const response = await new Promise<Response>(resolve => listener('fetch')({
                request: { url: `${ORIGIN}/webview/theia-resource${RESOURCE}?${query}` },
                clientId: inner.id,
                respondWith: answer => answer.then(resolve)
            }));
            return response.text();
        },
        answer(query: string, body: string): void {
            listener('message')({
                data: { channel: 'did-load-resource', data: { status: 200, path: RESOURCE, query, data: body, mime: 'image/png' } },
                source: inner
            });
        },
        dispose(): void {
            timers.forEach(clearTimeout);
        }
    };
}

describe('webview service worker', () => {

    let worker: ReturnType<typeof startServiceWorker>;

    beforeEach(() => {
        worker = startServiceWorker();
    });

    afterEach(() => worker.dispose());

    it('loads a resource again when its query changes', async () => {
        const first = worker.fetch('version=1');
        await settle();
        worker.answer('version=1', 'first');
        expect(await first).to.equal('first');

        const second = worker.fetch('version=2');
        await settle();
        expect(worker.loads.map(load => load.query)).to.deep.equal(['version=1', 'version=2']);
        worker.answer('version=2', 'second');
        expect(await second).to.equal('second');
    });

    it('shares one load between fetches with the same query', async () => {
        const both = Promise.all([worker.fetch('version=1'), worker.fetch('version=1')]);
        await settle();
        expect(worker.loads).to.have.length(1);
        worker.answer('version=1', 'first');
        expect(await both).to.deep.equal(['first', 'first']);
    });

    it('answers each pending query with its own load', async () => {
        const first = worker.fetch('version=1');
        const second = worker.fetch('version=2');
        await settle();
        expect(worker.loads.map(load => load.query)).to.deep.equal(['version=1', 'version=2']);
        worker.answer('version=2', 'second');
        worker.answer('version=1', 'first');
        expect(await Promise.all([first, second])).to.deep.equal(['first', 'second']);
    });
});
