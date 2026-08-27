// *****************************************************************************
// Copyright (C) 2026 robertjndw
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
// ****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// `HostedPluginFileSystemProvider` transitively imports `Endpoint` via `@theia/core/lib/browser`,
// which touches `document` at load time, so JSDOM is enabled before it for that import.
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { URI } from '@theia/core';
import { FileSystemProviderErrorCode } from '@theia/filesystem/lib/common/files';
import { PLUGINS_SCHEME } from '@theia/plugin-utils/lib/common/constants';
import { HostedPluginFileSystemProvider } from './hosted-plugin-file-system-provider';

disableJSDOM();

describe('HostedPluginFileSystemProvider', () => {

    // The provider builds asset URLs through `Endpoint`, which reads `self.location`.
    before(() => { disableJSDOM = enableJSDOM(); });
    after(() => disableJSDOM());

    const originalFetch = globalThis.fetch;
    let requests: Array<{ url: string, method: string | undefined }>;

    function stubFetch(respond: () => Response | Promise<Response>): void {
        requests = [];
        globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
            requests.push({ url: String(url), method: init?.method });
            return respond();
        }) as typeof globalThis.fetch;
    }

    function stubFetchFailure(error: Error): void {
        requests = [];
        globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
            requests.push({ url: String(url), method: init?.method });
            throw error;
        }) as typeof globalThis.fetch;
    }

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    function assetUri(path: string): URI {
        return new URI(`${PLUGINS_SCHEME}:/`).resolve(path);
    }

    function createProvider(): HostedPluginFileSystemProvider {
        return new HostedPluginFileSystemProvider();
    }

    it('rejects a resource whose scheme is not the plugin asset scheme', async () => {
        const provider = createProvider();

        await provider.stat(new URI('file:///theia.foo/1.0.0/package.json')).then(
            () => expect.fail('should have rejected'),
            error => expect(error.code).to.equal(FileSystemProviderErrorCode.FileNotFound));
    });

    it('maps content-length and last-modified into size and mtime', async () => {
        const modified = new Date('2020-01-01T00:00:00.000Z');
        stubFetch(() => new Response(undefined, {
            status: 200,
            headers: { 'content-length': '42', 'last-modified': modified.toUTCString() }
        }));
        const provider = createProvider();

        const stat = await provider.stat(assetUri('theia.foo/1.0.0/icon.svg'));

        expect(stat.size).to.equal(42);
        expect(stat.mtime).to.equal(modified.getTime());
        expect(stat.ctime).to.equal(modified.getTime());
        expect(requests).to.deep.equal([{ url: 'http://localhost/hostedPlugin/theia.foo/1.0.0/icon.svg', method: 'HEAD' }]);
    });

    it('falls back to 0 when content-length/last-modified are absent', async () => {
        stubFetch(() => new Response(undefined, { status: 200 }));
        const provider = createProvider();

        const stat = await provider.stat(assetUri('theia.foo/1.0.0/icon.svg'));

        expect(stat.size).to.equal(0);
        expect(stat.mtime).to.equal(0);
        expect(stat.ctime).to.equal(0);
    });

    it('falls back to 0 when content-length/last-modified cannot be parsed', async () => {
        stubFetch(() => new Response(undefined, {
            status: 200,
            headers: { 'content-length': 'not-a-number', 'last-modified': 'not-a-date' }
        }));
        const provider = createProvider();

        const stat = await provider.stat(assetUri('theia.foo/1.0.0/icon.svg'));

        expect(stat.size).to.equal(0);
        expect(stat.mtime).to.equal(0);
        expect(stat.ctime).to.equal(0);
    });

    it('returns the response body as bytes', async () => {
        const bytes = new Uint8Array([1, 2, 3, 4]);
        stubFetch(() => new Response(bytes, { status: 200 }));
        const provider = createProvider();

        const result = await provider.readFile(assetUri('theia.foo/1.0.0/icon.svg'));

        expect(Array.from(result)).to.deep.equal(Array.from(bytes));
        expect(requests).to.deep.equal([{ url: 'http://localhost/hostedPlugin/theia.foo/1.0.0/icon.svg', method: 'GET' }]);
    });

    it('maps a 404 response to FileNotFound', async () => {
        stubFetch(() => new Response('', { status: 404, statusText: 'Not Found' }));
        const provider = createProvider();

        await provider.readFile(assetUri('theia.foo/1.0.0/missing.svg')).then(
            () => expect.fail('should have rejected'),
            error => expect(error.code).to.equal(FileSystemProviderErrorCode.FileNotFound));
    });

    it('maps other non-ok responses to Unknown', async () => {
        stubFetch(() => new Response('', { status: 500, statusText: 'Internal Server Error' }));
        const provider = createProvider();

        await provider.readFile(assetUri('theia.foo/1.0.0/icon.svg')).then(
            () => expect.fail('should have rejected'),
            error => expect(error.code).to.equal(FileSystemProviderErrorCode.Unknown));
    });

    it('maps a network failure to Unavailable', async () => {
        stubFetchFailure(new Error('network down'));
        const provider = createProvider();

        await provider.readFile(assetUri('theia.foo/1.0.0/icon.svg')).then(
            () => expect.fail('should have rejected'),
            error => expect(error.code).to.equal(FileSystemProviderErrorCode.Unavailable));
    });

    it('rejects mutating operations as read-only', () => {
        const provider = createProvider();
        const uri = assetUri('theia.foo/1.0.0/icon.svg');

        expect(() => provider.mkdir(uri)).to.throw().that.has.property('code', FileSystemProviderErrorCode.NoPermissions);
        expect(() => provider.delete(uri, { recursive: false, useTrash: false })).to.throw()
            .that.has.property('code', FileSystemProviderErrorCode.NoPermissions);
        expect(() => provider.rename(uri, uri, { overwrite: false })).to.throw()
            .that.has.property('code', FileSystemProviderErrorCode.NoPermissions);
        expect(() => provider.writeFile(uri, new Uint8Array(), { create: true, overwrite: true })).to.throw()
            .that.has.property('code', FileSystemProviderErrorCode.NoPermissions);
    });

    it('resolves the request URL through Endpoint, re-encoding # ? % and spaces while keeping / literal', async () => {
        stubFetch(() => new Response(undefined, { status: 200 }));
        const provider = createProvider();

        await provider.stat(assetUri('theia.foo/1.0.0/a b#c?d%e.svg'));

        expect(requests).to.deep.equal([{
            url: 'http://localhost/hostedPlugin/theia.foo/1.0.0/a%20b%23c%3Fd%25e.svg',
            method: 'HEAD'
        }]);
    });
});
