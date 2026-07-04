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
import { UNPUBLISHED, VSCODE_BUILTIN_NAME_PREFIX } from '../constants';
import { prepareLoadedManifest, loadManifest, stripVscodeBuiltinNamePrefix } from '../plugin-manifest';
import type { PluginManifest } from '../manifest-types';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

describe('plugin-manifest', () => {

    describe('stripVscodeBuiltinNamePrefix', () => {
        it('removes the vscode builtin prefix from package names', () => {
            const manifest: Pick<PluginManifest, 'name'> = {
                name: `${VSCODE_BUILTIN_NAME_PREFIX}json`
            };
            stripVscodeBuiltinNamePrefix(manifest);
            expect(manifest.name).to.equal('json');
        });
    });

    describe('prepareLoadedManifest', () => {
        it('defaults publisher and derives activation events', () => {
            const manifest = prepareLoadedManifest({
                name: 'sample',
                version: '1.0.0',
                packagePath: '/tmp/sample',
                contributes: {
                    commands: [{ command: 'sample.run', title: 'Run' }]
                }
            } as PluginManifest);

            expect(manifest.publisher).to.equal(UNPUBLISHED);
            expect(manifest.activationEvents).to.include('onCommand:sample.run');
        });

        it('can skip activation event derivation', () => {
            const manifest = prepareLoadedManifest({
                name: 'sample',
                version: '1.0.0',
                packagePath: '/tmp/sample',
                contributes: {
                    commands: [{ command: 'sample.run', title: 'Run' }]
                }
            } as PluginManifest, { updateActivationEvents: false });

            expect(manifest.activationEvents).to.equal(undefined);
        });
    });

    describe('loadManifest', () => {
        let pluginRoot: string;

        beforeEach(async () => {
            pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-manifest-'));
        });

        afterEach(async () => {
            await fs.remove(pluginRoot);
        });

        it('reads and prepares package.json from disk', async () => {
            await fs.writeJson(path.join(pluginRoot, 'package.json'), {
                name: `${VSCODE_BUILTIN_NAME_PREFIX}json`,
                version: '1.0.0',
                contributes: {
                    commands: [{ command: 'json.format', title: 'Format JSON' }]
                }
            });

            const manifest = await loadManifest(pluginRoot);

            expect(manifest.name).to.equal('json');
            expect(manifest.publisher).to.equal(UNPUBLISHED);
            expect(manifest.activationEvents).to.include('onCommand:json.format');
        });
    });
});
