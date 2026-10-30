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
import {
    DeployedPlugin, DuplicateExtensionError, PluginDeployerEntry, PluginDeployerResolver, PluginDeployOptions, PluginIdentifiers, PluginType
} from '../../common/plugin-protocol';
import { PluginDeployerImpl } from './plugin-deployer-impl';

describe('PluginDeployerImpl', () => {

    function createDeployer(
        resolve: PluginDeployerResolver['resolve'],
        logs: { info: string[], error: string[] } = { info: [], error: [] },
        services: object = {}
    ): PluginDeployerImpl {
        const deployer = new PluginDeployerImpl();
        const resolver: PluginDeployerResolver = { accept: () => true, resolve };
        Object.assign(deployer, {
            pluginResolvers: [resolver],
            pluginDeployerFileHandlers: [],
            pluginDeployerDirectoryHandlers: [],
            logger: {
                info: (message: string) => logs.info.push(message),
                error: (message: string) => logs.error.push(message)
            },
            ...services
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

    describe('resolvePlugins with extension dependencies', () => {
        const PARENT = 'vscode-extension://vscjava.vscode-java-test';
        const DEPENDENCY = 'vscode-extension://redhat.java';

        let requests: Map<string, PluginDeployOptions | undefined>;
        let deployed: DeployedPlugin[];
        let uninstalled: PluginIdentifiers.VersionedId[];

        function createDependencyDeployer(): PluginDeployerImpl {
            const resolve: PluginDeployerResolver['resolve'] = async (context, options) => {
                requests.set(context.getOriginId(), options);
                if (context.getOriginId() === PARENT) {
                    context.addPlugin('vscjava.vscode-java-test@0.47.0', '/tmp/vscjava.vscode-java-test-0.47.0');
                }
            };
            return createDeployer(resolve, undefined, {
                pluginDeployerHandler: {
                    getPluginDependencies: async (entry: PluginDeployerEntry) => entry.id() === 'vscjava.vscode-java-test@0.47.0'
                        ? {
                            metadata: { model: { publisher: 'vscjava', name: 'vscode-java-test', version: '0.47.0' } },
                            mapping: new Map([['redhat.java', DEPENDENCY]])
                        }
                        : undefined,
                    getDeployedPluginsById: (id: string) => deployed.filter(plugin => PluginIdentifiers.componentsToUnversionedId(plugin.metadata.model) === id)
                },
                uninstallationManager: { isUninstalled: (id: PluginIdentifiers.VersionedId) => uninstalled.includes(id) }
            });
        }

        function deployedPlugin(publisher: string, name: string, version: string): DeployedPlugin {
            return { metadata: { model: { publisher, name, version } } } as DeployedPlugin;
        }

        beforeEach(() => {
            requests = new Map();
            deployed = [];
            uninstalled = [];
        });

        it('resolves a dependency that is not installed without the options of the plugin that requires it', async () => {
            const options = { version: '0.47.0', ignoreOtherVersions: true };

            await createDependencyDeployer().resolvePlugins([{ id: PARENT, type: PluginType.User }], options);

            expect(requests.get(PARENT)).to.deep.equal(options);
            expect(requests.has(DEPENDENCY)).to.be.true;
            expect(requests.get(DEPENDENCY)).to.be.undefined;
        });

        it('keeps an installed dependency, whatever its version', async () => {
            deployed = [deployedPlugin('redhat', 'java', '1.26.0')];

            const entries = await createDependencyDeployer().resolvePlugins([{ id: PARENT, type: PluginType.User }]);

            expect(requests.has(DEPENDENCY)).to.be.false;
            expect(entries.map(entry => entry.id())).to.deep.equal(['vscjava.vscode-java-test@0.47.0']);
        });

        it('resolves a dependency whose installed copy is pending uninstall', async () => {
            deployed = [deployedPlugin('redhat', 'java', '1.26.0')];
            uninstalled = ['redhat.java@1.26.0'];

            await createDependencyDeployer().resolvePlugins([{ id: PARENT, type: PluginType.User }]);

            expect(requests.has(DEPENDENCY)).to.be.true;
        });

        it('still resolves an installed plugin that was requested directly', async () => {
            deployed = [deployedPlugin('redhat', 'java', '1.26.0')];

            await createDependencyDeployer().resolvePlugins([{ id: DEPENDENCY, type: PluginType.User }]);

            expect(requests.has(DEPENDENCY)).to.be.true;
        });
    });
});
