// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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
import { JsonRpc } from '../../common/json-rpc';
import { ipcRenderer } from '../../../electron-shared/electron';
import { FrontendApplicationContribution } from '../../browser/frontend-application';
import { bindServiceProvider, ConnectionMultiplexer, DeferredConnectionFactory, ProxyProvider, Rpc, ServiceProvider } from '../../common';
import { waitForRemote } from '../../common/connection/utils';
import { DefaultConnectionMultiplexer } from '../../common/connection/multiplexer';
import { DefaultRpcProxyProvider } from '../../common/rpc';
import { ElectronMainAndFrontend } from '../../electron-common';
import { IpcRendererConnection } from './electron-ipc-renderer-connection';

export const messagingFrontendModule = new ContainerModule(bind => {
    // #region transients
    bind(IpcRendererConnection)
        .toDynamicValue(ctx => new IpcRendererConnection())
        .inTransientScope();
    // #endregion
    // #region ElectronMainAndFrontend
    bindServiceProvider(bind, ElectronMainAndFrontend);
    bind(ConnectionMultiplexer)
        .toDynamicValue(ctx => {
            const deferredConnectionFactory = ctx.container.get(DeferredConnectionFactory);
            const ipcConnection = ctx.container.get(IpcRendererConnection).initialize(ElectronMainAndFrontend, ipcRenderer);
            const deferredConnection = deferredConnectionFactory(waitForRemote(ipcConnection));
            return ctx.container.get(DefaultConnectionMultiplexer).initialize(deferredConnection);
        })
        .inSingletonScope()
        .whenTargetNamed(ElectronMainAndFrontend);
    bind(ProxyProvider)
        .toDynamicValue(ctx => {
            const multiplexer = ctx.container.getNamed(ConnectionMultiplexer, ElectronMainAndFrontend);
            const jsonRpc = ctx.container.get(JsonRpc);
            return ctx.container.get(DefaultRpcProxyProvider).initialize((serviceId, serviceParams) => {
                const connection = multiplexer.open({ serviceId, serviceParams });
                const messageConnection = jsonRpc.createMessageConnection(connection);
                return jsonRpc.createRpcConnection(messageConnection);
            });
        })
        .inSingletonScope()
        .whenTargetNamed(ElectronMainAndFrontend);
    bind(FrontendApplicationContribution)
        .toDynamicValue(ctx => ({
            initialize(): void {
                const multiplexer = ctx.container.getNamed(ConnectionMultiplexer, ElectronMainAndFrontend);
                const serviceProvider = ctx.container.getNamed(ServiceProvider, ElectronMainAndFrontend);
                const jsonRpc = ctx.container.get(JsonRpc);
                const rpcProxying = ctx.container.get(Rpc);
                multiplexer.listen(({ serviceId, serviceParams }, accept, next) => {
                    const [service, dispose] = serviceProvider.getService(serviceId, serviceParams);
                    if (service) {
                        const connection = accept();
                        const messageConnection = jsonRpc.createMessageConnection(connection);
                        const rpcConnection = jsonRpc.createRpcConnection(messageConnection);
                        rpcProxying.serve(service, rpcConnection);
                        rpcConnection.onClose(dispose);
                    } else {
                        next();
                    }
                });
            }
        }))
        .inSingletonScope();
    // #endregion
});
