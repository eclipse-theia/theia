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

import { expect } from 'chai';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { PLUGINS_BASE_PATH } from '@theia/plugin-utils/lib/common/constants';
import type { PluginManifest } from '@theia/plugin-utils/lib/common/manifest-types';
import {
    resolvePluginEntryFileSync,
    resolvePluginRoot,
    shouldCopyPluginPath,
    shouldIncludePluginInBrowserOnlyBuild,
    getBrowserOnlySkipReason,
    toHostedPluginUri,
} from './prepare-browser-only-plugins';

describe('prepare-browser-only-plugins helpers', () => {

    let tmpRoot: string;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'theia-prepare-plugins-'));
    });

    afterEach(async () => {
        await fs.remove(tmpRoot);
    });

    describe('resolvePluginRoot', () => {
        it('resolves root, extension/, and package/ layouts (root wins)', async () => {
            await fs.writeJson(path.join(tmpRoot, 'package.json'), { name: 'direct' });
            expect(resolvePluginRoot(tmpRoot)).to.equal(tmpRoot);

            await fs.ensureDir(path.join(tmpRoot, 'extension'));
            await fs.writeJson(path.join(tmpRoot, 'extension', 'package.json'), { name: 'nested' });
            expect(resolvePluginRoot(tmpRoot)).to.equal(tmpRoot);

            const onlyExt = path.join(tmpRoot, 'only-ext');
            await fs.ensureDir(path.join(onlyExt, 'extension'));
            await fs.writeJson(path.join(onlyExt, 'extension', 'package.json'), { name: 'ext' });
            expect(resolvePluginRoot(onlyExt)).to.equal(path.join(onlyExt, 'extension'));

            const onlyPkg = path.join(tmpRoot, 'only-pkg');
            await fs.ensureDir(path.join(onlyPkg, 'package'));
            await fs.writeJson(path.join(onlyPkg, 'package', 'package.json'), { name: 'pkg' });
            expect(resolvePluginRoot(onlyPkg)).to.equal(path.join(onlyPkg, 'package'));

            expect(resolvePluginRoot(path.join(tmpRoot, 'empty'))).to.equal(undefined);
        });
    });

    describe('shouldIncludePluginInBrowserOnlyBuild', () => {
        it('includes frontend/browser and declarative contributes; excludes backend-only even with contributes', () => {
            expect(shouldIncludePluginInBrowserOnlyBuild({
                name: 'fe', version: '1', packagePath: '', theiaPlugin: { frontend: 'lib/fe.js' },
            })).to.equal(true);
            expect(shouldIncludePluginInBrowserOnlyBuild({
                name: 'br', version: '1', packagePath: '', browser: 'dist/br.js',
            })).to.equal(true);
            expect(shouldIncludePluginInBrowserOnlyBuild({
                name: 'both', version: '1', packagePath: '', main: 'lib/node.js', browser: 'dist/br.js',
            })).to.equal(true);
            expect(shouldIncludePluginInBrowserOnlyBuild({
                name: 'themes', version: '1', packagePath: '',
                contributes: { themes: [{ path: './theme.json' }] },
            } as PluginManifest)).to.equal(true);

            expect(shouldIncludePluginInBrowserOnlyBuild({
                name: '', version: '1', packagePath: '', browser: 'x.js',
            })).to.equal(false);
            expect(getBrowserOnlySkipReason({
                name: '', version: '1', packagePath: '', browser: 'x.js',
            })).to.equal('malformed');
            expect(shouldIncludePluginInBrowserOnlyBuild({
                name: 'be', version: '1', packagePath: '', theiaPlugin: { backend: 'lib/node.js' },
            })).to.equal(false);
            expect(shouldIncludePluginInBrowserOnlyBuild({
                name: 'git', version: '1', packagePath: '', main: './out/main.js',
                contributes: { commands: [{ command: 'git.status', title: 'Status' }] },
            } as PluginManifest)).to.equal(false);
            expect(shouldIncludePluginInBrowserOnlyBuild({
                name: 'empty', version: '1', packagePath: '', contributes: {},
            } as PluginManifest)).to.equal(false);
            expect(getBrowserOnlySkipReason({
                name: 'empty', version: '1', packagePath: '', contributes: {},
            } as PluginManifest)).to.equal('no-browser-surface');
        });
    });

    describe('resolvePluginEntryFileSync', () => {
        it('resolves exact, extensionless, and .js→.cjs/.mjs fallbacks', async () => {
            const exact = path.join(tmpRoot, 'main.js');
            await fs.writeFile(exact, '');
            expect(resolvePluginEntryFileSync(exact)).to.equal(exact);

            const base = path.join(tmpRoot, 'entry');
            await fs.writeFile(`${base}.js`, '');
            expect(resolvePluginEntryFileSync(base)).to.equal(`${base}.js`);

            const bothJs = path.join(tmpRoot, 'both.js');
            const bothCjs = path.join(tmpRoot, 'both.cjs');
            await fs.writeFile(bothJs, '');
            await fs.writeFile(bothCjs, '');
            expect(resolvePluginEntryFileSync(bothJs)).to.equal(bothJs);

            const onlyCjs = path.join(tmpRoot, 'cjs-only.js');
            await fs.writeFile(path.join(tmpRoot, 'cjs-only.cjs'), '');
            expect(resolvePluginEntryFileSync(onlyCjs)).to.equal(path.join(tmpRoot, 'cjs-only.cjs'));

            const onlyMjs = path.join(tmpRoot, 'mjs-only.js');
            await fs.writeFile(path.join(tmpRoot, 'mjs-only.mjs'), '');
            expect(resolvePluginEntryFileSync(onlyMjs)).to.equal(path.join(tmpRoot, 'mjs-only.mjs'));

            expect(resolvePluginEntryFileSync(path.join(tmpRoot, 'missing.js'))).to.equal(undefined);
        });
    });

    describe('toHostedPluginUri', () => {
        it('rewrites file URIs under the plugin root; leaves others alone', () => {
            const pluginRoot = path.join(tmpRoot, 'my-plugin');
            const nested = path.join(pluginRoot, 'media', 'icon.png');
            expect(toHostedPluginUri(pathToFileURL(nested).href, pluginRoot, 'id')).to.equal(
                `${PLUGINS_BASE_PATH}/id/media/icon.png`
            );
            expect(toHostedPluginUri(pathToFileURL(pluginRoot).href, pluginRoot, 'id')).to.equal(
                `${PLUGINS_BASE_PATH}/id/`
            );
            expect(toHostedPluginUri('https://example.com/icon.png', pluginRoot, 'id')).to.equal(
                'https://example.com/icon.png'
            );

            const outside = path.join(tmpRoot, 'other', 'license.txt');
            const outsideUri = pathToFileURL(outside).href;
            expect(toHostedPluginUri(outsideUri, pluginRoot, 'id')).to.equal(outsideUri);

            // Sibling prefix must not match (`/plugin` vs `/plugin-evil`).
            const sibling = path.join(tmpRoot, 'my-plugin-evil', 'readme.md');
            const siblingUri = pathToFileURL(sibling).href;
            expect(toHostedPluginUri(siblingUri, pluginRoot, 'id')).to.equal(siblingUri);
        });
    });

    describe('shouldCopyPluginPath', () => {
        it('allows plugin files and skips nested node_modules/.git even when root sits under node_modules', () => {
            // Mimics post-realpath absolute paths under a workspace node_modules tree.
            const pluginRoot = path.join(tmpRoot, 'node_modules', 'hosted', 'my-plugin');
            expect(shouldCopyPluginPath(path.join(pluginRoot, 'dist', 'ext.js'), pluginRoot)).to.equal(true);
            expect(shouldCopyPluginPath(pluginRoot, pluginRoot)).to.equal(true);
            expect(shouldCopyPluginPath(path.join(pluginRoot, 'node_modules', 'dep', 'index.js'), pluginRoot)).to.equal(false);
            expect(shouldCopyPluginPath(path.join(pluginRoot, '.git', 'config'), pluginRoot)).to.equal(false);
        });
    });
});
