// *****************************************************************************
// Copyright (C) 2026 akysil and others.
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
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import { Emitter } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { DeployedPlugin, PluginIdentifiers, PluginType } from '@theia/plugin-ext';
import { VSXExtensionsModel } from './vsx-extensions-model.js';
import { VSXExtension, VSXExtensionOptions } from './vsx-extension.js';

after(() => disableJSDOM());

interface TestableModel {
    updateInstalled(): Promise<void>;
    initInstalled(): Promise<void>;
}

function deployedPlugin(versionedId: PluginIdentifiers.VersionedId, entryPoint: object = {}): DeployedPlugin {
    const { id, version } = PluginIdentifiers.idAndVersionFromVersionedId(versionedId)!;
    const [publisher, name] = id.split('.');
    return {
        type: PluginType.System,
        metadata: { model: { id, publisher, name, version, displayName: `Local ${name}`, entryPoint } }
    } as unknown as DeployedPlugin;
}

describe('VSXExtensionsModel', () => {

    let queried: string[];
    let synced: Map<string, DeployedPlugin>;
    let onDidChangePlugins: Emitter<void>;

    /**
     * @param installed the response of `getInstalledPluginIds`.
     * @param deployedIds the response of `getDeployedPluginIds`, which can be older than `installed`.
     * @param backend the plugins the backend has metadata for.
     */
    function createModel(
        installed: PluginIdentifiers.VersionedId[],
        deployedIds: PluginIdentifiers.VersionedId[],
        backend: DeployedPlugin[] | Error,
        disabled: PluginIdentifiers.UnversionedId[] = []
    ): VSXExtensionsModel & TestableModel {
        queried = [];
        // The frontend has not synced its plugins yet: no local metadata is known.
        synced = new Map();
        onDidChangePlugins = new Emitter<void>();
        const pluginSupport = {
            willStart: Promise.resolve(),
            getPlugin: (id: string) => synced.get(id),
            onDidChangePlugins: onDidChangePlugins.event
        };
        const model = new VSXExtensionsModel();
        Object.assign(model, {
            logger: new MockLogger(),
            pluginServer: {
                getDeployedPluginIds: async () => deployedIds,
                getUninstalledPluginIds: async () => [],
                getDisabledPluginIds: async () => disabled,
                getInstalledPluginIds: async () => installed,
                getDeployedPlugins: async (ids: string[]) => {
                    if (backend instanceof Error) {
                        throw backend;
                    }
                    return backend.filter(plugin => ids.includes(PluginIdentifiers.componentsToVersionedId(plugin.metadata.model)));
                }
            },
            pluginSupport,
            pluginWatcher: { onDidDeploy: new Emitter<void>().event },
            extensionFactory: (options: VSXExtensionOptions) => Object.assign(new VSXExtension(), { options, pluginSupport }),
            progressService: { withProgress: (_text: string, _location: string, task: () => Promise<unknown>) => task() },
            applicationServer: { getApplicationPlatform: async () => 'universal' },
            vsxRegistryService: {
                findLatestCompatibleExtension: async (query: { extensionId: string, extensionVersion?: string }) => {
                    queried.push(`${query.extensionId}@${query.extensionVersion}`);
                    const [namespace, name] = query.extensionId.split('.');
                    return {
                        namespace, name, version: query.extensionVersion, displayName: `Registry ${name}`,
                        files: {}, verified: true, publishedBy: { loginName: namespace }
                    };
                }
            }
        });
        return model as VSXExtensionsModel & TestableModel;
    }

    it('should not query the registry for deployed extensions before the frontend synced its plugins', async () => {
        const ids: PluginIdentifiers.VersionedId[] = ['vscode.git@1.0.0', 'vscode.json@1.0.0'];
        const model = createModel(ids, ids, ids.map(id => deployedPlugin(id)));
        await model.updateInstalled();
        expect(queried).to.be.empty;
        expect([...model.installed]).to.have.members(ids);
        expect(model.isBuiltIn('vscode.git')).to.be.true;
    });

    it('should not query the registry when the deployed ids are older than the installed ids', async () => {
        const model = createModel(['vscode.git@1.0.0'], [], [deployedPlugin('vscode.git@1.0.0')]);
        await model.updateInstalled();
        expect(queried).to.be.empty;
    });

    it('should query the registry for installed extensions without local metadata', async () => {
        const model = createModel(['vscode.git@1.0.0', 'redhat.java@2.0.0'], ['vscode.git@1.0.0'], [deployedPlugin('vscode.git@1.0.0')]);
        await model.updateInstalled();
        expect(queried).to.deep.equal(['redhat.java@2.0.0']);
    });

    it('should keep the registry data of headless plugins, which the frontend does not load', async () => {
        const model = createModel(['acme.headless@1.0.0'], ['acme.headless@1.0.0'], [deployedPlugin('acme.headless@1.0.0', { headless: 'headless.js' })]);
        await model.updateInstalled();
        expect(queried).to.deep.equal(['acme.headless@1.0.0']);
        expect(model.getExtension('acme.headless')?.displayName).to.equal('Registry headless');
    });

    it('should keep the registry data of disabled plugins, which the frontend does not load', async () => {
        const model = createModel(['vscode.git@1.0.0'], [], [deployedPlugin('vscode.git@1.0.0')], ['vscode.git']);
        await model.updateInstalled();
        expect(queried).to.deep.equal(['vscode.git@1.0.0']);
        expect(model.getExtension('vscode.git')?.displayName).to.equal('Registry git');
    });

    it('should keep the installed extensions and their registry data when the plugin metadata cannot be read', async () => {
        const model = createModel(['vscode.git@1.0.0'], ['vscode.git@1.0.0'], new Error('connection lost'));
        await model.updateInstalled();
        expect([...model.installed]).to.deep.equal(['vscode.git@1.0.0']);
        expect(queried).to.deep.equal(['vscode.git@1.0.0']);
        expect(model.getExtension('vscode.git')?.displayName).to.equal('Registry git');
    });

    it('should render deployed extensions from their local metadata once the frontend synced its plugins', async () => {
        const plugin = deployedPlugin('vscode.git@1.0.0');
        const model = createModel(['vscode.git@1.0.0'], ['vscode.git@1.0.0'], [plugin]);
        await model.initInstalled();
        let changes = 0;
        model.onDidChange(() => changes++);
        synced.set('vscode.git', plugin);
        onDidChangePlugins.fire();
        expect(changes).to.equal(1);
        expect(model.getExtension('vscode.git')?.displayName).to.equal('Local git');
        expect(queried).to.be.empty;
    });
});
