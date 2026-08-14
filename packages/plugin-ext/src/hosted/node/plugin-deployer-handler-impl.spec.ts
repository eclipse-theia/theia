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

import { expect } from 'chai';
import { SimpleStopwatch } from '@theia/core/lib/common/performance/simple-stopwatch';
import { PluginDeployerHandlerImpl } from './plugin-deployer-handler-impl';
import { HostedPluginReader } from './plugin-reader';
import { HostedPluginLocalizationService } from './hosted-plugin-localization-service';
import { PluginUninstallationManager } from '../../main/node/plugin-uninstallation-manager';
import {
    PluginDeployerEntry, PluginDeployerEntryType, PluginPackage, PluginMetadata, PluginType
} from '../../common/plugin-protocol';

class TestPluginDeployerHandler extends PluginDeployerHandlerImpl {
    exposeDeployPlugin(entry: PluginDeployerEntry, entryPoint: 'frontend' | 'backend'): Promise<boolean> {
        return this.deployPlugin(entry, entryPoint);
    }

    countDeployedBackendPlugins(): number {
        return (this as unknown as { deployedBackendPlugins: Map<unknown, unknown> }).deployedBackendPlugins.size;
    }
}

function createFakeEntry(rootPath: string, accepted: PluginDeployerEntryType[]): PluginDeployerEntry {
    const values = new Map<string, unknown>();
    return {
        id: () => rootPath,
        originalPath: () => rootPath,
        path: () => rootPath,
        getValue: <T>(key: string) => values.get(key) as T,
        storeValue: <T>(key: string, value: T) => { values.set(key, value); },
        updatePath: () => { /* no-op */ },
        getChanges: () => [],
        isFile: async () => false,
        isDirectory: async () => true,
        isResolved: () => true,
        resolvedBy: () => 'test',
        isAccepted: (...types) => types.some(type => accepted.includes(type)),
        accept: () => { /* no-op */ },
        hasError: () => false,
        type: PluginType.User,
        rootPath
    };
}

function createFakeMetadata(id: string, version: string): PluginMetadata {
    return {
        host: 'test',
        model: {
            id,
            name: 'concurrent-plugin',
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

describe('PluginDeployerHandlerImpl - concurrent deployment', () => {

    it('deploys the same plugin id only once when deployPlugin is called concurrently', async () => {
        const pluginId = 'test-publisher.concurrent-plugin';
        const version = '1.0.0';
        const metadata = createFakeMetadata(pluginId, version);
        const pluginPackage = {} as PluginPackage;

        let readContributionCallCount = 0;
        let releaseReadContribution!: () => void;
        const readContributionGate = new Promise<void>(resolve => { releaseReadContribution = resolve; });

        const fakeReader = {
            readPackage: async () => pluginPackage,
            readMetadata: async () => metadata,
            readContribution: async () => {
                readContributionCallCount++;
                // Hold call A open here so call B's reservation check runs
                // while A is still mid-flight, genuinely racing the window
                // between reserving and completing.
                await readContributionGate;
                return undefined;
            }
        } as unknown as HostedPluginReader;

        const fakeLocalizationService = {
            deployLocalizations: async () => { /* no-op */ },
            buildTranslationConfig: async () => { /* no-op */ }
        } as unknown as HostedPluginLocalizationService;

        const fakeUninstallationManager = {
            markAsUninstalled: async () => true,
            markAsInstalled: async () => true,
            markAsEnabled: async () => true,
            markAsDisabled: async () => true
        } as unknown as PluginUninstallationManager;

        const handler = new TestPluginDeployerHandler();
        (handler as unknown as { reader: HostedPluginReader }).reader = fakeReader;
        (handler as unknown as { localizationService: HostedPluginLocalizationService }).localizationService = fakeLocalizationService;
        (handler as unknown as { uninstallationManager: PluginUninstallationManager }).uninstallationManager = fakeUninstallationManager;
        (handler as unknown as { stopwatch: SimpleStopwatch }).stopwatch = new SimpleStopwatch('test', () => Date.now());

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
        // The real assertion: readContribution — the actual deploy work —
        // must only run once, proving B reused A's in-flight reservation
        // rather than performing a second, concurrent deploy.
        expect(readContributionCallCount).to.equal(1);
        expect(handler.countDeployedBackendPlugins()).to.equal(1);
    });
});
