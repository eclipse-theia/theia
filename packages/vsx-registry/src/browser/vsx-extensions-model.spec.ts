// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
const disableJSDOM = enableJSDOM();
// xterm.js (pulled in transitively via plugin-ext) calls HTMLCanvasElement.prototype.getContext
// at module-load time. JSDOM's default impl throws 'Not implemented' without the optional
// `canvas` package; replace it with a no-op so the module graph evaluates.
const canvasProto = (globalThis as { HTMLCanvasElement?: { prototype: { getContext?: unknown } } }).HTMLCanvasElement?.prototype;
if (canvasProto) {
    canvasProto.getContext = () => undefined;
}
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import { VSXExtension } from './vsx-extension.js';
import { VSXExtensionsModel } from './vsx-extensions-model.js';

after(() => disableJSDOM());

describe('VSXExtensionsModel: README resolution', () => {

    const originalFetch = globalThis.fetch;
    let fetchedUrls: string[];
    let fetchResponse: Response;
    let backendReadmeUrls: string[];
    let loggedErrors: unknown[][];
    let readmeUpdate: string | undefined;

    function createModel(extension: Partial<VSXExtension>): VSXExtensionsModel {
        const model = new VSXExtensionsModel();
        Object.assign(model, {
            initialized: Promise.resolve(),
            progressService: { withProgress: (_text: string, _location: string, task: () => Promise<unknown>) => task() },
            logger: { error: (...args: unknown[]) => loggedErrors.push(args) },
            vsxRegistryService: {
                fetchReadme: async (url: string) => {
                    backendReadmeUrls.push(url);
                    return '# Remote README';
                }
            },
            request: {
                request: async () => {
                    throw new Error('The RequestService must not be used to fetch a local README.');
                }
            },
            refresh: async () => ({
                readme: undefined,
                update: (data: { readme?: string }) => readmeUpdate = data.readme,
                ...extension
            })
        });
        return model;
    }

    beforeEach(() => {
        fetchedUrls = [];
        fetchResponse = new Response('# Local README', { status: 200 });
        backendReadmeUrls = [];
        loggedErrors = [];
        readmeUpdate = undefined;
        globalThis.fetch = (async (input: string | URL | Request) => {
            fetchedUrls.push(input.toString());
            return fetchResponse;
        }) as typeof fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('fetches the README of an installed extension directly from the local plugin host', async () => {
        const localReadmeUrl = 'http://localhost:3000/hostedPlugin/foo_bar/README.md';
        const model = createModel({ readmeUrl: localReadmeUrl, localReadmeUrl } as Partial<VSXExtension>);

        await model.resolve('foo.bar');

        expect(fetchedUrls).to.deep.equal([localReadmeUrl]);
        expect(backendReadmeUrls).to.be.empty;
        expect(loggedErrors).to.be.empty;
        expect(readmeUpdate).to.contain('Local README');
    });

    it('fetches the README of a registry extension through the backend', async () => {
        const readmeUrl = 'https://open-vsx.org/api/foo/bar/1.0.0/file/README.md';
        const model = createModel({ readmeUrl, localReadmeUrl: undefined } as Partial<VSXExtension>);

        await model.resolve('foo.bar');

        expect(fetchedUrls).to.be.empty;
        expect(backendReadmeUrls).to.deep.equal([readmeUrl]);
        expect(readmeUpdate).to.contain('Remote README');
    });

    it('logs an error and leaves the README unset if the local plugin host responds with an error', async () => {
        const localReadmeUrl = 'http://localhost:3000/hostedPlugin/foo_bar/README.md';
        fetchResponse = new Response('Not Found', { status: 404 });
        const model = createModel({ readmeUrl: localReadmeUrl, localReadmeUrl } as Partial<VSXExtension>);

        const extension = await model.resolve('foo.bar');

        expect(extension).to.not.equal(undefined);
        expect(readmeUpdate).to.equal(undefined);
        expect(loggedErrors).to.have.lengthOf(1);
    });
});
