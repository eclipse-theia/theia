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
import { Plugin as InternalPlugin, PluginManager } from '../common/plugin-api-rpc.js';
import { Plugin } from './plugin-context.js';

describe('Plugin', () => {

    const globals = globalThis as any;
    let originalSelf: PropertyDescriptor | undefined;

    beforeEach(() => {
        originalSelf = Object.getOwnPropertyDescriptor(globals, 'self');
    });

    afterEach(() => {
        if (originalSelf) {
            Object.defineProperty(globals, 'self', originalSelf);
        } else {
            delete globals.self;
        }
    });

    /** Creates a frontend plugin as the plugin web worker at `workerUrl` sees it. */
    function createFrontendPlugin(workerUrl: string): Plugin<unknown> {
        const { protocol, host, pathname, search } = new URL(workerUrl);
        globals.self = { location: { protocol, host, pathname, search } };
        const plugin = {
            model: { id: 'acme.sample', publisher: 'acme', name: 'sample', entryPoint: { frontend: 'dist/extension.js' } },
            pluginFolder: 'hostedPlugin/acme_sample/',
            rawModel: {}
        } as unknown as InternalPlugin;
        return new Plugin({} as PluginManager, plugin);
    }

    it('resolves the URI of a frontend plugin at the root of the application', () => {
        const plugin = createFrontendPlugin('http://localhost:3000/plugin-worker.js');

        expect(plugin.pluginUri.toString()).to.equal('http://localhost:3000/hostedPlugin/acme_sample/');
    });

    it('resolves the URI of a frontend plugin under the path the application is served from', () => {
        const plugin = createFrontendPlugin('https://example.com/ide/plugin-worker.js');

        expect(plugin.pluginUri.toString()).to.equal('https://example.com/ide/hostedPlugin/acme_sample/');
    });

});
