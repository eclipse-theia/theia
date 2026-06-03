// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import * as chai from 'chai';
import * as fs from 'fs';
import { nativeDependenciesPlugin } from './esbuild-plugin';

const expect = chai.expect;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCallback = (args: any) => any;

interface Resolvers {
    filter: RegExp;
    callback: AnyCallback;
}

function createFakeBuild(): { build: unknown, resolvers: Resolvers[] } {
    const resolvers: Resolvers[] = [];
    const build = {
        initialOptions: { outdir: '/tmp/fake-outdir' },
        onResolve: () => undefined,
        onLoad: (options: { filter: RegExp }, callback: AnyCallback) => {
            resolvers.push({ filter: options.filter, callback });
        },
        onStart: () => undefined,
        onEnd: () => undefined,
    };
    return { build, resolvers };
}

describe('nativeDependenciesPlugin', () => {

    it('rewrites the @stroncium/procfs parsers.js dynamic require to append `.js` so esbuild\'s glob lookup matches at runtime', async () => {
        // Regression test for the Linux trash bug: @stroncium/procfs (used by
        // `trash` on Linux to map device IDs to mount points) calls
        // `require(`./parsers/${name}`)`. esbuild expands this into a glob map
        // whose keys carry the `.js` extension, but the runtime call passes the
        // bare name, missing every entry and breaking file deletion via trash
        // on esbuild-bundled backends. The onLoad handler is run against the
        // real upstream parsers.js so this test fails if @stroncium/procfs
        // ever changes the dynamic require pattern out from under our patch.
        const { build, resolvers } = createFakeBuild();

        const plugin = nativeDependenciesPlugin({
            trash: false,
            ripgrep: false,
            pty: false,
            nativeBindings: {}
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plugin.setup(build as any);

        const parsersPath = require.resolve('@stroncium/procfs/lib/parsers.js');
        const parsersLoader = resolvers.find(l => l.filter.test(parsersPath));
        expect(parsersLoader, 'plugin should register an onLoad for @stroncium/procfs parsers.js').to.not.equal(undefined);

        const original = await fs.promises.readFile(parsersPath, 'utf8');
        expect(original, 'upstream parsers.js must still contain the bare dynamic require we patch').to.include('require(`./parsers/${name}`)');

        const result = await parsersLoader!.callback({ path: parsersPath });
        expect(result, 'callback must return a load result').to.be.an('object');
        expect(result.loader, 'result must be emitted as JS').to.equal('js');
        expect(result.contents, 'patched contents must append `.js` to the dynamic require').to.include('require(`./parsers/${name}.js`)');
        expect(result.contents, 'patched contents must no longer contain the bare dynamic require').to.not.include('require(`./parsers/${name}`)');
    });
});
