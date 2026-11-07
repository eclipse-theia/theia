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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { URI } from '@theia/core';
import { FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType } from '@theia/filesystem/lib/common/files';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FetchFileServiceContribution, FetchFileSystemProvider } from './fetch-file-system-provider.js';

disableJSDOM();

describe('FetchFileSystemProvider', () => {

    const originalFetch = globalThis.fetch;
    let requests: string[];

    function stubFetch(respond: () => Response | Promise<Response>): void {
        requests = [];
        globalThis.fetch = (async (url: unknown) => {
            requests.push(String(url));
            return respond();
        }) as typeof globalThis.fetch;
    }

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    const resource = new URI('https://example.com/ide/hostedPlugin/acme_sample/data/config.json');

    it('reads the response body of the resource', async () => {
        stubFetch(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

        const content = await new FetchFileSystemProvider().readFile(resource);

        expect(Array.from(content)).to.deep.equal([1, 2, 3]);
        expect(requests).to.deep.equal(['https://example.com/ide/hostedPlugin/acme_sample/data/config.json']);
    });

    it('rejects when the response status is not 200', async () => {
        stubFetch(() => new Response('Not Found', { status: 404, statusText: 'Not Found' }));

        await new FetchFileSystemProvider().readFile(resource).then(
            () => expect.fail('should have rejected'),
            error => {
                expect(error.code).to.equal(FileSystemProviderErrorCode.Unknown);
                expect(error.message).to.contain('404');
            });
    });

    it('rejects when the request fails', async () => {
        globalThis.fetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof globalThis.fetch;

        await new FetchFileSystemProvider().readFile(resource).then(
            () => expect.fail('should have rejected'),
            error => {
                expect(error.code).to.equal(FileSystemProviderErrorCode.Unknown);
                expect(error.message).to.contain('Failed to fetch');
            });
    });

    it('reports every resource as a file without requesting it', async () => {
        stubFetch(() => expect.fail('should not fetch'));

        const stat = await new FetchFileSystemProvider().stat(resource);

        expect(stat).to.deep.equal({ type: FileType.File, size: 0, mtime: 0, ctime: 0 });
        expect(requests).to.be.empty;
    });

    it('is read-only', () => {
        const capabilities = new FetchFileSystemProvider().capabilities;

        expect(capabilities & FileSystemProviderCapabilities.Readonly).to.equal(FileSystemProviderCapabilities.Readonly);
        expect(capabilities & FileSystemProviderCapabilities.FileReadWrite).to.equal(FileSystemProviderCapabilities.FileReadWrite);
    });

    it('does not list directories', () => {
        expect(() => new FetchFileSystemProvider().readdir(resource)).to.throw().with.property('code', FileSystemProviderErrorCode.Unavailable);
    });

    it('is registered for http and https', () => {
        const contribution = new FetchFileServiceContribution();
        const provider = new FetchFileSystemProvider();
        (contribution as unknown as { provider: FetchFileSystemProvider }).provider = provider;
        const registered = new Map<string, unknown>();

        contribution.registerFileSystemProviders({
            registerProvider: (scheme: string, registeredProvider: unknown) => registered.set(scheme, registeredProvider)
        } as unknown as FileService);

        expect([...registered.keys()]).to.deep.equal(['http', 'https']);
        expect(registered.get('http')).to.equal(provider);
        expect(registered.get('https')).to.equal(provider);
    });

});
