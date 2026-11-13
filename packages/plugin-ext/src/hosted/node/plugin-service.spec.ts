// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { ContributionProvider, Emitter, ILogger } from '@theia/core';
import { Deferred, wait } from '@theia/core/lib/common/promise-util';
import { ShellEnvironmentResolution, ShellEnvironmentServer } from '@theia/core/lib/common/shell-environment';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Container } from '@theia/core/shared/inversify';
import { expect } from 'chai';
import { PluginDeployerImpl } from '../../main/node/plugin-deployer-impl.js';
import { PluginUninstallationManager } from '../../main/node/plugin-uninstallation-manager.js';
import { ExtPluginApiProvider } from '../../common/plugin-ext-api-contribution.js';
import { DeployedPlugin, PluginDeployer } from '../../common/plugin-protocol.js';
import { HostedPluginSupport } from './hosted-plugin.js';
import { HostedPluginLocalizationService } from './hosted-plugin-localization-service.js';
import { PluginDeployerHandlerImpl } from './plugin-deployer-handler-impl.js';
import { HostedPluginServerImpl } from './plugin-service.js';

describe('HostedPluginServerImpl', () => {

    let resolution: Deferred<ShellEnvironmentResolution>;
    /** What the plugin host support was asked to do, in order. */
    let hostCalls: string[];
    /** Why the plugin host cannot be forked, if it cannot. */
    let forkError: Error | undefined;

    const setup = (): HostedPluginServerImpl => {
        resolution = new Deferred();
        hostCalls = [];
        forkError = undefined;
        const backendPlugin = { metadata: { model: { id: 'theia.backend', version: '1.0.0' } } } as DeployedPlugin;
        const container = new Container({ defaultScope: 'Singleton' });
        container.bind(ILogger).to(MockLogger);
        container.bind(PluginDeployerHandlerImpl).toConstantValue(<Partial<PluginDeployerHandlerImpl>>{
            getDeployedBackendPlugins: async () => [backendPlugin],
            getDeployedBackendPluginIds: async () => ['theia.backend@1.0.0'],
            getDeployedFrontendPluginIds: async () => []
        } as PluginDeployerHandlerImpl);
        container.bind(PluginDeployer).toConstantValue(<Partial<PluginDeployerImpl>>{ onDidDeploy: new Emitter<void>().event } as PluginDeployerImpl);
        container.bind(HostedPluginLocalizationService).toConstantValue({} as HostedPluginLocalizationService);
        container.bind(ContributionProvider).toConstantValue(<ContributionProvider<ExtPluginApiProvider>>{ getContributions: () => [] })
            .whenTargetNamed(Symbol.for(ExtPluginApiProvider));
        container.bind(PluginUninstallationManager).toConstantValue(<Partial<PluginUninstallationManager>>{
            getUninstalledPluginIds: () => [],
            getDisabledPluginIds: async () => [],
            onDidChangeUninstalledPlugins: new Emitter<string[]>().event,
            onDidChangeDisabledPlugins: new Emitter<string[]>().event
        } as PluginUninstallationManager);
        container.bind(HostedPluginSupport).toConstantValue(<Partial<HostedPluginSupport>>{
            runPluginServer: (name?: string) => {
                if (forkError) {
                    throw forkError;
                }
                hostCalls.push(`fork ${name}`);
            },
            onMessage: (id: string, message: Uint8Array) => { hostCalls.push(`message ${id} ${Buffer.from(message).toString()}`); },
            clientClosed: () => { hostCalls.push('closed'); }
        } as HostedPluginSupport);
        container.bind(ShellEnvironmentServer).toConstantValue(<ShellEnvironmentServer>{
            whenResolved: () => resolution.promise,
            setResolutionTimeout: async () => { }
        });
        container.bind(HostedPluginServerImpl).toSelf();
        return container.get(HostedPluginServerImpl);
    };

    it('answers which plugins are deployed before the shell environment is known, without forking the plugin host yet', async () => {
        const server = setup();
        expect(await server.getDeployedPluginIds()).to.deep.equal(['theia.backend@1.0.0']);
        expect(hostCalls).to.be.empty;
        resolution.resolve({ status: 'applied' });
        await wait(0);
        expect(hostCalls).to.deep.equal(['fork hosted-plugin']);
    });

    it('forwards the messages for the plugin host after forking it, in order', async () => {
        const server = setup();
        await server.getDeployedPluginIds();
        const first = server.onMessage('main', Buffer.from('first'));
        const second = server.onMessage('main', Buffer.from('second'));
        await wait(0);
        expect(hostCalls).to.be.empty;
        resolution.resolve({ status: 'applied' });
        await Promise.all([first, second]);
        expect(hostCalls).to.deep.equal(['fork hosted-plugin', 'message main first', 'message main second']);
    });

    it('does not fork the plugin host for a frontend that has gone away meanwhile', async () => {
        const server = setup();
        await server.getDeployedPluginIds();
        server.dispose();
        resolution.resolve({ status: 'applied' });
        await wait(0);
        expect(hostCalls).to.deep.equal(['closed']);
    });

    it('reports the plugin host as started at once when it was not asked to start', async () => {
        const server = setup();
        await server.whenPluginServerStarted();
        expect(hostCalls).to.be.empty;
    });

    it('reports the plugin host as started only once it has been forked', async () => {
        const server = setup();
        await server.getDeployedPluginIds();
        let started = false;
        const whenStarted = server.whenPluginServerStarted().then(() => { started = true; });
        await wait(0);
        expect(started).to.be.false;
        resolution.resolve({ status: 'applied' });
        await whenStarted;
        expect(hostCalls).to.deep.equal(['fork hosted-plugin']);
    });

    it('reports a plugin host that could not be forked', async () => {
        const server = setup();
        forkError = new Error('The plugin host cannot be forked');
        await server.getDeployedPluginIds();
        resolution.resolve({ status: 'applied' });
        const failure = await server.whenPluginServerStarted().then(() => undefined, error => error);
        expect(failure).to.equal(forkError);
    });
});
