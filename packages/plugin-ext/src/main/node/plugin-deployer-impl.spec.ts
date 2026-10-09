// *****************************************************************************
// Copyright (C) 2026 Vinay Kaushal and others.
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
import { DuplicateExtensionError, PluginDeployerResolver, PluginType } from '../../common/plugin-protocol';
import { PluginDeployerImpl } from './plugin-deployer-impl';

describe('PluginDeployerImpl', () => {

    function createDeployer(resolve: PluginDeployerResolver['resolve'], logs: { info: string[], error: string[] }): PluginDeployerImpl {
        const deployer = new PluginDeployerImpl();
        const resolver: PluginDeployerResolver = { accept: () => true, resolve };
        Object.assign(deployer, {
            pluginResolvers: [resolver],
            pluginDeployerFileHandlers: [],
            pluginDeployerDirectoryHandlers: [],
            logger: {
                info: (message: string) => logs.info.push(message),
                error: (message: string) => logs.error.push(message)
            }
        });
        return deployer;
    }

    describe('resolvePlugins', () => {

        it('logs an already installed plugin as info instead of an error', async () => {
            const logs = { info: [] as string[], error: [] as string[] };
            const deployer = createDeployer(async () => { throw DuplicateExtensionError.create('Extension a.b is already installed.'); }, logs);

            await deployer.resolvePlugins([{ id: 'local-file:/a.vsix', type: PluginType.User }]).catch(() => undefined);

            expect(logs.error).to.be.empty;
            expect(logs.info).to.have.lengthOf(1);
            expect(logs.info[0]).to.contain('Extension a.b is already installed.');
        });

        it('rethrows the duplicate error when nothing else resolved, so a single install can report it', async () => {
            const logs = { info: [] as string[], error: [] as string[] };
            const deployer = createDeployer(async () => { throw DuplicateExtensionError.create('Extension a.b is already installed.'); }, logs);

            let error: unknown;
            try {
                await deployer.resolvePlugins([{ id: 'local-file:/a.vsix', type: PluginType.User }]);
            } catch (e) {
                error = e;
            }

            expect(DuplicateExtensionError.is(error)).to.be.true;
        });

        it('still logs other resolution failures as errors', async () => {
            const logs = { info: [] as string[], error: [] as string[] };
            const deployer = createDeployer(async () => { throw new Error('boom'); }, logs);

            await deployer.resolvePlugins([{ id: 'local-file:/a.vsix', type: PluginType.User }]).catch(() => undefined);

            expect(logs.error).to.have.lengthOf(1);
            expect(logs.info).to.be.empty;
        });
    });
});
