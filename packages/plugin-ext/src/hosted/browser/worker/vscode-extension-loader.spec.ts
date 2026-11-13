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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from 'chai';
import { VsCodeExtensionLoader } from './vscode-extension-loader.js';

describe('VsCodeExtensionLoader', () => {

    const originalFetch = globalThis.fetch;
    const scripts = new Map<string, string>();
    const loader = new VsCodeExtensionLoader();

    before(() => {
        globalThis.fetch = (async (url: string) => {
            const source = scripts.get(url);
            return {
                ok: source !== undefined,
                status: source !== undefined ? 200 : 404,
                statusText: source !== undefined ? 'OK' : 'Not Found',
                url: `http://localhost/${url}`,
                text: async () => source
            };
        }) as any;
    });

    after(() => {
        globalThis.fetch = originalFetch;
    });

    afterEach(() => {
        scripts.clear();
    });

    async function load(source: string, api: unknown = {}): Promise<any> {
        scripts.set('extension.js', source);
        return loader.load('extension.js', api);
    }

    it('returns exports assigned to exports', async () => {
        const extension = await load('exports.activate = () => "activated"; exports.deactivate = () => "deactivated";');

        expect(extension.activate()).to.equal('activated');
        expect(extension.deactivate()).to.equal('deactivated');
    });

    it('returns the object assigned to module.exports', async () => {
        const extension = await load('module.exports = { activate: () => "activated" };');

        expect(extension.activate()).to.equal('activated');
    });

    it('resolves exports that are defined after module.exports is assigned', async () => {
        // Shape of an esbuild CommonJS bundle: getters on the exports object, functions assigned afterwards.
        const extension = await load(`
            var y = {};
            Object.defineProperty(y, 'activate', { get: () => d, enumerable: true });
            module.exports = y;
            var d = () => 'activated';
        `);

        expect(extension.activate()).to.equal('activated');
    });

    it('gives each extension its own vscode API, also when required lazily', async () => {
        const apiA = { name: 'a' };
        const apiB = { name: 'b' };
        const source = 'exports.activate = () => require("vscode").name;';
        const extensionA = await load(source, apiA);
        const extensionB = await load(source, apiB);

        expect(extensionA.activate()).to.equal('a');
        expect(extensionB.activate()).to.equal('b');
    });

    it('throws for modules other than vscode', async () => {
        const extension = await load('exports.activate = () => require("fs");');

        expect(() => extension.activate()).to.throw("Cannot load module 'fs'");
    });

    it('appends .js to an entry point without a file extension', async () => {
        scripts.set('dist/web/extension.js', 'exports.activate = () => "activated";');
        const extension: any = await loader.load('dist/web/extension', {});

        expect(extension.activate()).to.equal('activated');
    });

    it('keeps the file extension of an entry point', async () => {
        scripts.set('dist/extension.cjs', 'exports.activate = () => "activated";');
        const extension: any = await loader.load('dist/extension.cjs', {});

        expect(extension.activate()).to.equal('activated');
    });

    it('rejects when the script cannot be fetched', async () => {
        let error: Error | undefined;
        try {
            await loader.load('missing.js', {});
        } catch (e) {
            error = e;
        }

        expect(error?.message).to.equal("Failed to fetch 'missing.js': 404 Not Found");
    });

});
