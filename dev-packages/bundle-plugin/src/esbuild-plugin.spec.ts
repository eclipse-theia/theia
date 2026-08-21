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
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { compressAssetsPlugin, nativeDependenciesPlugin } from './esbuild-plugin';

const expect = chai.expect;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCallback = (args: any) => any;

interface Resolvers {
    filter: RegExp;
    callback: AnyCallback;
}

function createFakeBuild(outdir: string = '/tmp/fake-outdir'): { build: unknown, resolvers: Resolvers[], onEnd: AnyCallback[] } {
    const resolvers: Resolvers[] = [];
    const onEnd: AnyCallback[] = [];
    const build = {
        initialOptions: { outdir },
        onResolve: (options: { filter: RegExp }, callback: AnyCallback) => {
            resolvers.push({ filter: options.filter, callback });
        },
        onLoad: (options: { filter: RegExp }, callback: AnyCallback) => {
            resolvers.push({ filter: options.filter, callback });
        },
        onStart: () => undefined,
        onEnd: (callback: AnyCallback) => {
            onEnd.push(callback);
        },
    };
    return { build, resolvers, onEnd };
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

    it('resolves the parcel-watcher native binding into the `node-file` namespace so the runtime require wrapper is emitted', () => {
        // Regression test for #17595: a missing `namespace: 'node-file'` on the
        // watcher resolver caused esbuild's default `.node: 'file'` loader to emit
        // the binding path *as a string* instead of wrapping it in a runtime
        // require(). In packaged apps where the dynamic `require('@parcel/watcher-<platform>')`
        // first-choice path fails, the fallback then returned a string instead of
        // the native module, breaking every watch and triggering the misleading
        // "Unable to watch for file changes in this large workspace" popup.
        const { build, resolvers } = createFakeBuild();

        const plugin = nativeDependenciesPlugin({
            trash: false,
            ripgrep: false,
            pty: false,
            nativeBindings: {}
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plugin.setup(build as any);

        const watcherResolver = resolvers.find(r => r.filter.test('./build/Release/watcher.node'));
        expect(watcherResolver, 'plugin should register an onResolve for the parcel-watcher native binding').to.not.equal(undefined);

        const result = watcherResolver!.callback({ path: './build/Release/watcher.node' });
        expect(result, 'callback must return a resolution result').to.be.an('object');
        expect(result.namespace, 'binding must be routed through the `node-file` namespace').to.equal('node-file');
        expect(result.path, 'binding must point at a prebuilt watcher.node file').to.match(/watcher\.node$/);
    });
});

describe('compressAssetsPlugin', () => {

    let outdir: string;

    beforeEach(() => {
        outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'theia-compress-assets-'));
    });

    afterEach(() => {
        fs.rmSync(outdir, { recursive: true, force: true });
    });

    async function runPlugin(options: { compress?: boolean, errors?: object[] } = {}): Promise<void> {
        const { build, onEnd } = createFakeBuild(outdir);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        compressAssetsPlugin({ compress: options.compress }).setup(build as any);
        expect(onEnd.length, 'plugin should register an onEnd callback').to.equal(1);
        await onEnd[0]({ errors: options.errors ?? [] });
    }

    it('emits a `.gz` sibling for compressible assets and leaves other file types alone', async () => {
        fs.writeFileSync(path.join(outdir, 'bundle.js'), 'const theia = 1;'.repeat(500));
        fs.mkdirSync(path.join(outdir, 'nested'));
        fs.writeFileSync(path.join(outdir, 'nested', 'style.css'), '.theia-widget { color: red; }'.repeat(500));
        fs.writeFileSync(path.join(outdir, 'index.html'), '<html></html>');

        await runPlugin();

        expect(fs.existsSync(path.join(outdir, 'bundle.js.gz')), 'JS assets must be compressed').to.equal(true);
        expect(fs.existsSync(path.join(outdir, 'nested', 'style.css.gz')), 'assets in nested directories must be compressed').to.equal(true);
        expect(fs.existsSync(path.join(outdir, 'index.html.gz')), 'HTML is not served pre-compressed by the backend').to.equal(false);
    });

    it('removes a stale `.gz` file when the current asset does not compress well enough', async () => {
        // The backend serves any existing `.gz` sibling, so an outdated one must not survive a rebuild.
        const asset = path.join(outdir, 'bundle.js');
        fs.writeFileSync(asset, crypto.randomBytes(4096));
        fs.writeFileSync(asset + '.gz', 'stale');

        await runPlugin();

        expect(fs.existsSync(asset + '.gz'), 'stale compressed file must be removed').to.equal(false);
    });

    it('removes the `.gz` files of a previous build when compression is disabled', async () => {
        // Otherwise a development build after a production build would keep serving the production assets.
        const asset = path.join(outdir, 'bundle.js');
        fs.writeFileSync(asset, 'const theia = 1;'.repeat(500));
        fs.writeFileSync(asset + '.gz', 'from the previous build');

        await runPlugin({ compress: false });

        expect(fs.existsSync(asset), 'the asset itself must be kept').to.equal(true);
        expect(fs.existsSync(asset + '.gz'), 'compressed files of a previous build must be removed').to.equal(false);
    });

    it('does not touch the output directory when the build failed', async () => {
        fs.writeFileSync(path.join(outdir, 'bundle.js'), 'const theia = 1;'.repeat(500));

        await runPlugin({ errors: [{ text: 'build failed' }] });

        expect(fs.existsSync(path.join(outdir, 'bundle.js.gz')), 'a failed build must not produce compressed assets').to.equal(false);
    });
});
