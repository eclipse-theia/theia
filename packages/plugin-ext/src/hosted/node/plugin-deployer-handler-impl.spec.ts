// *****************************************************************************
// Copyright (C) 2026 ankitsharma101 and others.
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

import 'reflect-metadata';
import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { NodeStopwatch } from '@theia/core/lib/node/performance/node-stopwatch';
import { Stopwatch } from '@theia/core/lib/common';
import { PluginDeployerHandlerImpl, PreparedPlugin } from './plugin-deployer-handler-impl';
import { HostedPluginReader } from './plugin-reader';
import { HostedPluginLocalizationService } from './hosted-plugin-localization-service';
import { PluginUninstallationManager } from '../../main/node/plugin-uninstallation-manager';
import { PluginDeployerEntryImpl } from '../../main/node/plugin-deployer-entry-impl';
import {
    PluginDeployerEntry, PluginDeployerEntryType, PluginPackage, PluginMetadata, PluginType, PluginIdentifiers
} from '../../common/plugin-protocol';

class TestPluginDeployerHandler extends PluginDeployerHandlerImpl {
    async exposeDeployPlugin(entry: PluginDeployerEntry, entryPoint: 'frontend' | 'backend'): Promise<boolean> {
        const plugin = await this.readPlugin(entry, entryPoint);
        if (!plugin) {
            return false;
        }
        return this.deployPlugin(plugin);
    }

    countDeployedBackendPlugins(): number {
        return this.deployedBackendPlugins.size;
    }

    countDeployedLocations(id: PluginIdentifiers.VersionedId): number {
        return this.deployedLocations.get(id)?.size ?? 0;
    }
}

class ThrowingTestPluginDeployerHandler extends TestPluginDeployerHandler {
    throwingId?: PluginIdentifiers.VersionedId;

    protected override deployPlugin(plugin: PreparedPlugin): Promise<boolean> {
        if (plugin.id === this.throwingId) {
            return Promise.reject(new Error(`boom: deployPlugin rejected for ${plugin.id}`));
        }
        return super.deployPlugin(plugin);
    }
}

function createFakeEntry(rootPath: string, accepted: PluginDeployerEntryType[]): PluginDeployerEntry {
    const entry = new PluginDeployerEntryImpl('test', rootPath, rootPath);
    entry.accept(...accepted);
    entry.type = PluginType.User;
    return entry;
}

function createFakeMetadata(id: string, name: string, version: string): PluginMetadata {
    return {
        host: 'test',
        model: {
            id,
            name,
            publisher: 'test-publisher',
            version,
            displayName: id,
            description: '',
            engine: { type: 'theiaPlugin', version: '1.0.0' },
            entryPoint: { backend: 'main.js', frontend: 'main.js' },
            packageUri: `file:///${id}`,
            packagePath: `/${id}`
        },
        lifecycle: {
            startMethod: 'start',
            stopMethod: 'stop'
        },
        outOfSync: false
    };
}

function createHandler(overrides: {
    reader?: Partial<HostedPluginReader>;
    localizationService?: Partial<HostedPluginLocalizationService>;
    uninstallationManager?: Partial<PluginUninstallationManager>;
}): TestPluginDeployerHandler {
    const container = new Container();
    container.bind(TestPluginDeployerHandler).toSelf().inSingletonScope();
    container.bind(ILogger).toConstantValue(new MockLogger());
    container.bind(Stopwatch).to(NodeStopwatch).inSingletonScope();
    container.bind(HostedPluginReader).toConstantValue(overrides.reader as HostedPluginReader);
    container.bind(HostedPluginLocalizationService).toConstantValue(overrides.localizationService as HostedPluginLocalizationService);
    container.bind(PluginUninstallationManager).toConstantValue(overrides.uninstallationManager as PluginUninstallationManager);
    return container.get(TestPluginDeployerHandler);
}

function createThrowingHandler(overrides: {
    reader?: Partial<HostedPluginReader>;
    localizationService?: Partial<HostedPluginLocalizationService>;
    uninstallationManager?: Partial<PluginUninstallationManager>;
}, throwingId: PluginIdentifiers.VersionedId): ThrowingTestPluginDeployerHandler {
    const container = new Container();
    container.bind(ThrowingTestPluginDeployerHandler).toSelf().inSingletonScope();
    container.bind(ILogger).toConstantValue(new MockLogger());
    container.bind(Stopwatch).to(NodeStopwatch).inSingletonScope();
    container.bind(HostedPluginReader).toConstantValue(overrides.reader as HostedPluginReader);
    container.bind(HostedPluginLocalizationService).toConstantValue(overrides.localizationService as HostedPluginLocalizationService);
    container.bind(PluginUninstallationManager).toConstantValue(overrides.uninstallationManager as PluginUninstallationManager);
    const handler = container.get(ThrowingTestPluginDeployerHandler);
    handler.throwingId = throwingId;
    return handler;
}

describe('PluginDeployerHandlerImpl - concurrent deployment', () => {

    it('deploys the same plugin id only once when deployPlugin is called concurrently', async () => {
        const pluginId = 'test-publisher.concurrent-plugin';
        const version = '1.0.0';
        const metadata = createFakeMetadata(pluginId, 'concurrent-plugin', version);
        const pluginPackage = {} as PluginPackage;

        let readContributionCallCount = 0;
        let releaseReadContribution!: () => void;
        const readContributionGate = new Promise<void>(resolve => { releaseReadContribution = resolve; });

        const handler = createHandler({
            reader: {
                readPackage: async () => pluginPackage,
                readMetadata: async () => metadata,
                readContribution: async () => {
                    readContributionCallCount++;
                    await readContributionGate;
                    return undefined;
                }
            },
            localizationService: {
                deployLocalizations: async () => { /* no-op */ },
                buildTranslationConfig: async () => { /* no-op */ }
            },
            uninstallationManager: {
                markAsUninstalled: async () => true,
                markAsInstalled: async () => true,
                markAsEnabled: async () => true,
                markAsDisabled: async () => true
            }
        });

        const entryA = createFakeEntry('/plugins/concurrent-plugin-copy-a', [PluginDeployerEntryType.BACKEND]);
        const entryB = createFakeEntry('/plugins/concurrent-plugin-copy-b', [PluginDeployerEntryType.BACKEND]);

        // Start A. It will reach readContribution and block on the gate,
        // meaning it has already reserved but not yet completed.
        const resultAPromise = handler.exposeDeployPlugin(entryA, 'backend');

        // Let A's microtasks run until it's blocked inside readContribution.
        await new Promise(resolve => setImmediate(resolve));

        // Now start B while A is still genuinely in-flight and reserved.
        const resultBPromise = handler.exposeDeployPlugin(entryB, 'backend');
        await new Promise(resolve => setImmediate(resolve));

        // Release A to let both complete.
        releaseReadContribution();

        const [resultA, resultB] = await Promise.all([resultAPromise, resultBPromise]);

        expect(resultA).to.be.true;
        expect(resultB).to.be.true;
        // readContribution must run only once.
        expect(readContributionCallCount).to.equal(1);
        expect(handler.countDeployedBackendPlugins()).to.equal(1);
        expect(handler.countDeployedLocations(PluginIdentifiers.componentsToVersionedId(metadata.model))).to.equal(2);
    });

    it('deploys backend plugins in parallel and reports the correct success count when one fails', async () => {
        const goodIdA = 'plugin-a';
        const goodIdB = 'plugin-b';

        const handler = createHandler({
            reader: {
                readPackage: async (path: string) => ({ name: path } as unknown as PluginPackage),
                readMetadata: async (pkg: PluginPackage) => {
                    const name = (pkg as unknown as { name: string }).name;
                    if (name === '/plugins/bad') {
                        throw new Error('boom: unreadable metadata');
                    }
                    const id = name === '/plugins/a' ? goodIdA : goodIdB;
                    return createFakeMetadata(id, id, '1.0.0');
                },
                readContribution: async () => undefined
            },
            localizationService: {
                deployLocalizations: async () => { /* no-op */ },
                buildTranslationConfig: async () => { /* no-op */ }
            },
            uninstallationManager: {
                markAsUninstalled: async () => true,
                markAsInstalled: async () => true,
                markAsEnabled: async () => true,
                markAsDisabled: async () => true
            }
        });

        const entryA = createFakeEntry('/plugins/a', [PluginDeployerEntryType.BACKEND]);
        const entryB = createFakeEntry('/plugins/b', [PluginDeployerEntryType.BACKEND]);
        const entryBad = createFakeEntry('/plugins/bad', [PluginDeployerEntryType.BACKEND]);

        const successes = await handler.deployBackendPlugins([entryA, entryB, entryBad]);

        expect(successes).to.equal(2);
        expect(handler.countDeployedBackendPlugins()).to.equal(2);
    });

    it('does not abort the batch when deployPlugin itself throws for one entry', async () => {
        const goodMetadata = createFakeMetadata('plugin-good', 'plugin-good', '1.0.0');
        const throwingMetadata = createFakeMetadata('plugin-throws', 'plugin-throws', '1.0.0');
        const throwingVersionedId = PluginIdentifiers.componentsToVersionedId(throwingMetadata.model);

        const handler = createThrowingHandler({
            reader: {
                readPackage: async (path: string) => ({ name: path } as unknown as PluginPackage),
                readMetadata: async (pkg: PluginPackage) => {
                    const name = (pkg as unknown as { name: string }).name;
                    return name === '/plugins/good' ? goodMetadata : throwingMetadata;
                },
                readContribution: async () => undefined
            },
            localizationService: {
                deployLocalizations: async () => { /* no-op */ },
                buildTranslationConfig: async () => { /* no-op */ }
            },
            uninstallationManager: {
                markAsUninstalled: async () => true,
                markAsInstalled: async () => true,
                markAsEnabled: async () => true,
                markAsDisabled: async () => true
            }
        }, throwingVersionedId);

        const entryGood = createFakeEntry('/plugins/good', [PluginDeployerEntryType.BACKEND]);
        const entryThrows = createFakeEntry('/plugins/throws', [PluginDeployerEntryType.BACKEND]);

        const successes = await handler.deployBackendPlugins([entryGood, entryThrows]);

        expect(successes).to.equal(1);
        expect(handler.countDeployedBackendPlugins()).to.equal(1);
    });
});
