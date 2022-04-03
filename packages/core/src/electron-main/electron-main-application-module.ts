// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import { v4 } from 'uuid';
import { castConnection, Connection, ContributionFilterRegistry, DeferredConnectionFactory, ProxyProvider, Reflection, ServiceContribution, ServiceProvider } from '../common';
import { ChannelMessage, DefaultConnectionMultiplexer } from '../common/connection-multiplexer';
import { bindContributionProvider } from '../common/contribution-provider';
import { JsonRpcProxyProvider } from '../common/json-rpc-proxy-provider';
import { DefaultReflection } from '../common/reflection';
import { DefaultServiceProvider } from '../common/service-provider';
import { ElectronMainAndBackend, ElectronMainAndFrontend } from '../electron-common';
import { ElectronMainWindowService, electronMainWindowServicePath } from '../electron-common/electron-main-window-service';
import { ElectronSecurityToken } from '../electron-common/electron-token';
import { cluster } from '../node';
import { InProcessProxyProvider } from '../node/in-process-proxy-provider';
import { NodeIpcConnection } from '../node/messaging/ipc-connection';
import { ElectronMainApplication, ElectronMainApplicationContribution, ElectronMainProcessArgv } from './electron-main-application';
import { ElectronMainWindowServiceImpl } from './electron-main-window-service-impl';
import { ElectronSecurityTokenService } from './electron-security-token-service';
import { TheiaBrowserWindowOptions, TheiaElectronWindow, TheiaElectronWindowFactory, WindowApplicationConfig } from './theia-electron-window';

const electronSecurityToken: ElectronSecurityToken = { value: v4() };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any)[ElectronSecurityToken] = electronSecurityToken;

export default new ContainerModule(bind => {
    // #region constants
    bind(ElectronSecurityToken).toConstantValue(electronSecurityToken);
    // #endregion
    // #region transients
    bind(TheiaElectronWindow).toSelf().inTransientScope();
    bind(InProcessProxyProvider).toSelf().inTransientScope();
    // #endregion
    // #region factories
    bind(TheiaElectronWindowFactory)
        .toDynamicValue(ctx => (options, config) => {
            const child = ctx.container.createChild();
            child.bind(TheiaBrowserWindowOptions).toConstantValue(options);
            child.bind(WindowApplicationConfig).toConstantValue(config);
            return child.get(TheiaElectronWindow);
        })
        .inSingletonScope();
    // #endregion
    // #region contribution providers
    bindContributionProvider(bind, ElectronMainApplicationContribution);
    // #endregion
    // #region singletons
    bind(Reflection).to(DefaultReflection).inSingletonScope();
    bind(ElectronMainProcessArgv).toSelf().inSingletonScope();
    bind(ElectronMainApplication).toSelf().inSingletonScope();
    bind(ElectronSecurityTokenService).toSelf().inSingletonScope();
    bind(ElectronMainWindowService).to(ElectronMainWindowServiceImpl).inSingletonScope();
    // #endregion
    // #region ElectronMainAndFrontend
    bind(ServiceContribution)
        .toDynamicValue(ctx => ({
            [electronMainWindowServicePath]: () => ctx.container.get(ElectronMainWindowService)
        }))
        .inSingletonScope()
        .whenTargetNamed(ElectronMainAndFrontend);
    // #endregion
    // #region ElectronMainAndBackend
    bind(ServiceProvider)
        .toDynamicValue(ctx => {
            let contributionFilter; try { contributionFilter = ctx.container.get(ContributionFilterRegistry); } catch { }
            const contributions = ctx.container.getAllNamed(ServiceContribution, ElectronMainAndBackend);
            return new DefaultServiceProvider(contributionFilter?.applyFilters(contributions, ServiceContribution) ?? contributions);
        })
        .inSingletonScope()
        .whenTargetNamed(ElectronMainAndBackend);
    bind(ProxyProvider)
        .toDynamicValue(ctx => {
            const serviceProvider = ctx.container.getNamed(ServiceProvider, ElectronMainAndBackend);
            if (cluster) {
                // Connect to the backend sub-process once spawned:
                const app = ctx.container.get(ElectronMainApplication);
                const deferredConnectionFactory = ctx.container.get(DeferredConnectionFactory);
                const connectionPromise = app.backendProcess.then(
                    backend => ctx.container.get(NodeIpcConnection).initialize(backend)
                );
                const ipcConnection: Connection<ChannelMessage> = castConnection(deferredConnectionFactory(connectionPromise));
                const multiplexer = new DefaultConnectionMultiplexer().initialize<object>(ipcConnection);
                return ctx.container.get(JsonRpcProxyProvider).initialize(serviceProvider, multiplexer, multiplexer);
            } else {
                return ctx.container.get(InProcessProxyProvider).initialize(ElectronMainAndBackend, serviceProvider);
            }
        })
        .inSingletonScope()
        .whenTargetNamed(ElectronMainAndBackend);
    // #endregion
});
