// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// `webview` transitively pulls in frontend modules that touch `document` and the frontend application config at load time.
let disableJSDOM = enableJSDOM();
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }
// xterm.js (pulled in transitively) calls HTMLCanvasElement.prototype.getContext at load time, which JSDOM does not implement.
const canvasProto = (globalThis as { HTMLCanvasElement?: { prototype: { getContext?: unknown } } }).HTMLCanvasElement?.prototype;
if (canvasProto) {
    canvasProto.getContext = () => undefined;
}

import { expect } from 'chai';
import { BinaryBuffer, BinaryBufferReadableStream } from '@theia/core/lib/common/buffer';
import { WebviewWidget } from './webview.js';

disableJSDOM();

describe('WebviewWidget', () => {

    // `loadResource` builds the cache URL through `Endpoint`, which reads `self.location`.
    before(() => { disableJSDOM = enableJSDOM(); });
    after(() => disableJSDOM());

    interface Read {
        uri: string;
        etag: string | undefined;
    }

    interface Loaded {
        reads: Read[];
        cacheMatches: string[];
        cachePuts: string[];
        status: number | undefined;
    }

    /** Requests `requestPath` from a webview with the given resource roots. */
    async function loadResource(localResourceRoots: string[], requestPath: string): Promise<Loaded> {
        const loaded: Loaded = { reads: [], cacheMatches: [], cachePuts: [], status: undefined };
        const widget = Object.create(WebviewWidget.prototype);
        Object.assign(widget, {
            _contentOptions: { localResourceRoots },
            resourceCache: {
                match: async (url: string) => { loaded.cacheMatches.push(url); return { body: () => BinaryBuffer.fromString('cached'), eTag: 'cached-etag' }; },
                put: async (url: string) => { loaded.cachePuts.push(url); },
                delete: async () => { }
            },
            fileService: {
                readFileStream: async (uri: { toString(): string }, options?: { etag?: string }) => {
                    loaded.reads.push({ uri: uri.toString(), etag: options?.etag });
                    return { value: BinaryBufferReadableStream.fromBuffer(BinaryBuffer.fromString('fresh')), etag: 'fresh-etag' };
                }
            },
            doSend: (channel: string, data: { status: number }) => { loaded.status = data.status; }
        });
        await widget.loadResource(requestPath);
        return loaded;
    }

    it('serves a file resource under a file root through the resource cache', async () => {
        const loaded = await loadResource(['file:///home/user/project'], '/file///home/user/project/media/style.css');

        expect(loaded.status).to.equal(200);
        expect(loaded.reads).to.deep.equal([{ uri: 'file:///home/user/project/media/style.css', etag: 'cached-etag' }]);
        expect(loaded.cachePuts).to.have.length(1);
    });

    it('serves a resource requested in the old vscode-resource form under a file root', async () => {
        // `preprocessHtml` rewrites `vscode-resource:/home/user/...` to `theia-resource/file/home/user/...`.
        const loaded = await loadResource(['file:///home/user/project'], '/file/home/user/project/media/style.css');

        expect(loaded.status).to.equal(200);
        expect(loaded.reads.map(read => read.uri)).to.deep.equal(['file:///home/user/project/media/style.css']);
    });

    it('compares the authority of a UNC root case-insensitively', async () => {
        // The root is serialized with a lower-case authority, the request keeps the authority as the plugin wrote it.
        const loaded = await loadResource(['file://server/share/project'], '/file//SERVER/share/project/media/style.css');

        expect(loaded.status).to.equal(200);
        expect(loaded.reads.map(read => read.uri)).to.have.length(1);
    });

    it('does not serve a resource of another scheme whose path is under a root', async () => {
        const loaded = await loadResource(['file:///home/user/project'], '/https//example.com/home/user/project/media/style.css');

        expect(loaded.status).to.equal(404);
        expect(loaded.reads).to.be.empty;
    });

    it('does not serve a resource of another authority whose path is under a root', async () => {
        const loaded = await loadResource(['http://localhost:3000/hostedPlugin/acme_sample'], '/http//example.com/hostedPlugin/acme_sample/media/style.css');

        expect(loaded.status).to.equal(404);
        expect(loaded.reads).to.be.empty;
    });

    it('serves an http resource under its root without the resource cache', async () => {
        const loaded = await loadResource(['http://localhost:3000/hostedPlugin/acme_sample'], '/http//localhost:3000/hostedPlugin/acme_sample/media/style.css');

        expect(loaded.status).to.equal(200);
        expect(loaded.reads).to.deep.equal([{ uri: 'http://localhost:3000/hostedPlugin/acme_sample/media/style.css', etag: undefined }]);
        expect(loaded.cacheMatches).to.be.empty;
        expect(loaded.cachePuts).to.be.empty;
    });

});
