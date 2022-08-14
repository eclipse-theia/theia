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
import { THEIA_ELECTRON_IPC_CHANNEL_NAME } from '../electron-common/messaging/electron-messages';
import { v4 } from 'uuid';
import {
    AnyConnection,
    bindServiceProvider,
    ConnectionMultiplexer,
    ConnectionTransformer,
    DeferredConnectionFactory,
    DisposableCollection,
    ProxyProvider,
    Rpc,
    ServiceContribution,
    ServiceProvider
} from '../common';
import { DefaultConnectionMultiplexer } from '../common/connection/multiplexer';
import { ContainerScope } from '../common/container-scope';
import { bindContributionProvider } from '../common/contribution-provider';
import { getAllNamedOptional } from '../common/inversify-utils';
import { DefaultRpcProxyProvider } from '../common/rpc';
import { ElectronMainAndBackend, ElectronMainAndFrontend } from '../electron-common';
import { ElectronMainWindowService, electronMainWindowServicePath } from '../electron-common/electron-main-window-service';
import { ElectronSecurityToken } from '../electron-common/electron-token';
import { cluster } from '../node';
import { InProcessProxyProvider } from '../node/in-process-proxy-provider';
import { NodeIpcConnectionFactory } from '../node/messaging/ipc-connection';
import { ElectronMainApplication, ElectronMainApplicationContribution, ElectronMainProcessArgv } from './electron-main-application';
import { ElectronMainWindowServiceImpl } from './electron-main-window-service-impl';
import { ElectronSecurityTokenService } from './electron-security-token-service';
import { WebContentsConnection } from './electron-web-contents-connection';
import { TheiaBrowserWindowOptions, TheiaElectronWindow, TheiaElectronWindowFactory, WindowApplicationConfig } from './theia-electron-window';
import { waitForRemote } from '../common/connection/utils';
import { pushDisposableListener } from '../common/node-event-utils';
import { JsonRpc } from '../common/json-rpc';

const electronSecurityToken: ElectronSecurityToken = { value: v4() };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any)[ElectronSecurityToken] = electronSecurityToken;

/**
 * Main container module loaded when a `BrowserWindow` running the Theia
 * frontend is opened.
 */
export const ElectronMainAndFrontendContainerModule = new ContainerModule(bind => {
    bindServiceProvider(bind, ElectronMainAndFrontend);
    bind(ContainerScope.Init)
        .toFunction(container => {
            const multiplexer = container.getNamed(ConnectionMultiplexer, ElectronMainAndFrontend);
            const serviceProvider = container.getNamed(ServiceProvider, ElectronMainAndFrontend);
            const jsonRpc = container.get(JsonRpc);
            const rpc = container.get(Rpc);
            multiplexer.listen(({ serviceId, serviceParams }, accept, next) => {
                const [service, dispose] = serviceProvider.getService(serviceId, serviceParams);
                if (service) {
                    const rpcConnection = jsonRpc.createRpcConnection(jsonRpc.createMessageConnection(accept()));
                    rpc.serve(service, rpcConnection);
                    rpcConnection.onClose(dispose);
                } else {
                    next();
                }
            });
        })
        .whenTargetNamed(ElectronMainAndFrontend);
    bind(ConnectionMultiplexer)
        .toDynamicValue(ctx => {
            const theiaWindow = ctx.container.get(TheiaElectronWindow);
            const deferredConnectionFactory = ctx.container.get(DeferredConnectionFactory);
            const ipcConnection = ctx.container.get(WebContentsConnection)
                .initialize(ElectronMainAndFrontend, theiaWindow.window.webContents, {
                    closeOnNavigation: true,
                    targetFrameId: theiaWindow.window.webContents.mainFrame.routingId
                });
            return ctx.container.get(DefaultConnectionMultiplexer)
                .initialize(deferredConnectionFactory(waitForRemote(ipcConnection)));
        })
        .inSingletonScope()
        .whenTargetNamed(ElectronMainAndFrontend);
    bind(ProxyProvider)
        .toDynamicValue(ctx => {
            const multiplexer = ctx.container.getNamed(ConnectionMultiplexer, ElectronMainAndFrontend);
            const jsonRpc = ctx.container.get(JsonRpc);
            return ctx.container.get(DefaultRpcProxyProvider).initialize(serviceId => {
                const channel = multiplexer.open({ serviceId });
                return jsonRpc.createRpcConnection(jsonRpc.createMessageConnection(channel));
            });
        })
        .inSingletonScope()
        .whenTargetNamed(ElectronMainAndFrontend);
    bind(ServiceContribution)
        .toDynamicValue(ctx => ServiceContribution.fromEntries(
            [electronMainWindowServicePath, () => ctx.container.get(ElectronMainWindowService)]
        ))
        .inSingletonScope()
        .whenTargetNamed(ElectronMainAndFrontend);
});

export default new ContainerModule(bind => {
    // #region constants
    bind(ElectronSecurityToken).toConstantValue(electronSecurityToken);
    // #endregion
    // #region transients
    bind(TheiaElectronWindow).toSelf().inTransientScope();
    bind(WebContentsConnection)
        .toDynamicValue(ctx => new WebContentsConnection())
        .inTransientScope();
    // #endregion
    // #region factories
    bind(TheiaElectronWindowFactory).toFactory(({ container }) => (options, config) => {
        const child = container.createChild();
        child.bind(TheiaBrowserWindowOptions).toConstantValue(options);
        child.bind(WindowApplicationConfig).toConstantValue(config);
        return child.get(TheiaElectronWindow);
    });
    // #endregion
    // #region contribution providers
    bindContributionProvider(bind, ElectronMainApplicationContribution);
    // #endregion
    // #region singletons
    bind(ElectronMainProcessArgv).toSelf().inSingletonScope();
    bind(ElectronMainApplication).toSelf().inSingletonScope();
    bind(ElectronSecurityTokenService).toSelf().inSingletonScope();
    bind(ElectronMainWindowService).to(ElectronMainWindowServiceImpl).inSingletonScope();
    // #endregion
    // #region ElectronMainAndFrontend
    bind(ElectronMainApplicationContribution)
        .toDynamicValue(ctx => ({
            onStart(app): void {
                const containerScopeFactory = ctx.container.get(ContainerScope.Factory);
                app.onDidCreateTheiaWindow(theiaWindow => {
                    recursiveCreateFrontendContainerScope(theiaWindow);
                });
                /**
                 * A browser window may host multiple instances of a Theia
                 * frontend over time (but never at the same time).
                 *
                 * When we detect that a frontend instance will be destroyed
                 * and a new one will be created (e.g. reload) we need to
                 * destroy the previously allocated resources and re-create
                 * those.
                 */
                function recursiveCreateFrontendContainerScope(theiaWindow: TheiaElectronWindow): void {
                    const disposables = new DisposableCollection();
                    disposables.push(createFrontendContainerScope(theiaWindow));
                    pushDisposableListener(disposables, theiaWindow.window.webContents, 'did-navigate', function (): void {
                        disposables.dispose();
                        recursiveCreateFrontendContainerScope(theiaWindow);
                    });
                    theiaWindow.onDidClose(() => disposables.dispose(), undefined, disposables);
                }
                function createFrontendContainerScope(theiaWindow: TheiaElectronWindow): ContainerScope {
                    const child = ctx.container.createChild();
                    child.bind(TheiaElectronWindow).toConstantValue(theiaWindow);
                    ctx.container.getAllNamed(ContainerModule, ElectronMainAndFrontend)
                        .forEach(containerModule => child.load(containerModule));
                    const initCallbacks = getAllNamedOptional(child, ContainerScope.Init, ElectronMainAndFrontend);
                    return containerScopeFactory(child).initialize(initCallbacks);
                }
            }
        }))
        .inSingletonScope();
    bind(ContainerModule)
        .toConstantValue(ElectronMainAndFrontendContainerModule)
        .whenTargetNamed(ElectronMainAndFrontend);
    // #endregion
    // #region ElectronMainAndBackend
    bindServiceProvider(bind, ElectronMainAndBackend);
    if (cluster) {
        // We need to setup the JSON-RPC connection between electron-main and backend:
        // We'll multiplex messages over a Node IPC connection and talk JSON-RPC over the channels.
        bind(ConnectionMultiplexer)
            .toDynamicValue(ctx => {
                const app = ctx.container.get(ElectronMainApplication);
                const connectionTransformer = ctx.container.get(ConnectionTransformer);
                const nodeIpcConnectionFactory = ctx.container.get(NodeIpcConnectionFactory);
                const deferredConnectionFactory = ctx.container.get(DeferredConnectionFactory);
                const deferredConnection = deferredConnectionFactory(app.backendProcess.then(backend => {
                    const backendIpc = nodeIpcConnectionFactory(backend);
                    const sharedIpc: AnyConnection = connectionTransformer.transformConnection(backendIpc, {
                        decode: (message, emit) => {
                            if (typeof message === 'object' && THEIA_ELECTRON_IPC_CHANNEL_NAME in message) {
                                emit(message[THEIA_ELECTRON_IPC_CHANNEL_NAME]);
                            }
                        },
                        encode: (message, write) => {
                            write({ [THEIA_ELECTRON_IPC_CHANNEL_NAME]: message });
                        }
                    });
                    return waitForRemote(sharedIpc);
                }));
                return ctx.container.get(DefaultConnectionMultiplexer).initialize(deferredConnection);
            })
            .inSingletonScope()
            .whenTargetNamed(ElectronMainAndBackend);
        bind(ElectronMainApplicationContribution)
            .toDynamicValue(ctx => ({
                onStart(): void {
                    const multiplexer = ctx.container.getNamed(ConnectionMultiplexer, ElectronMainAndBackend);
                    const serviceProvider = ctx.container.getNamed(ServiceProvider, ElectronMainAndBackend);
                    const jsonRpc = ctx.container.get(JsonRpc);
                    const rpc = ctx.container.get(Rpc);
                    multiplexer.listen(({ serviceId, serviceParams }, accept, next) => {
                        const [service, dispose] = serviceProvider.getService(serviceId, serviceParams);
                        if (service) {
                            const rpcConnection = jsonRpc.createRpcConnection(jsonRpc.createMessageConnection(accept()));
                            rpc.serve(service, rpcConnection);
                            rpcConnection.onClose(dispose);
                        } else {
                            next();
                        }
                    });
                }
            }))
            .inSingletonScope();
        bind(ProxyProvider)
            .toDynamicValue(ctx => {
                const multiplexer = ctx.container.getNamed(ConnectionMultiplexer, ElectronMainAndBackend);
                const jsonRpc = ctx.container.get(JsonRpc);
                return ctx.container.get(DefaultRpcProxyProvider).initialize((serviceId, serviceParams) => {
                    const channel = multiplexer.open({ serviceId, serviceParams });
                    return jsonRpc.createRpcConnection(jsonRpc.createMessageConnection(channel));
                });
            })
            .inSingletonScope()
            .whenTargetNamed(ElectronMainAndBackend);
    } else {
        const inProcessProxyProvider = Symbol();
        bind(inProcessProxyProvider)
            .toDynamicValue(ctx => {
                const serviceProvider = ctx.container.getNamed(ServiceProvider, ElectronMainAndBackend);
                return ctx.container.get(InProcessProxyProvider).initialize(ElectronMainAndBackend, serviceProvider);
            })
            .inSingletonScope();
        bind(ProxyProvider)
            .toDynamicValue(ctx => ctx.container.get(inProcessProxyProvider))
            .inSingletonScope()
            .whenTargetNamed(ElectronMainAndBackend);
        bind(ElectronMainApplicationContribution)
            .toDynamicValue(ctx => ({
                onStart(): void {
                    ctx.container.get(inProcessProxyProvider); // start listening
                }
            }))
            .inSingletonScope();
    }
    // #endregion
});
