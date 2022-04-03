// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
import { JsonRpc } from '../common/json-rpc';
import {
    AnyConnection,
    bindServiceProvider,
    ConnectionMultiplexer,
    ConnectionTransformer,
    DeferredConnectionFactory,
    ProxyProvider,
    Rpc,
    ServiceProvider
} from '../common';
import { waitForRemote } from '../common/connection';
import { DefaultConnectionMultiplexer } from '../common/connection-multiplexer';
import { DefaultRpcProxyProvider } from '../common/rpc';
import { ElectronMainAndBackend } from '../electron-common';
import { THEIA_ELECTRON_IPC_CHANNEL_NAME } from '../electron-common/messaging/electron-messages';
import { BackendApplicationContribution, cluster } from '../node';
import { InProcessProxyProvider } from '../node/in-process-proxy-provider';
import { NodeIpcConnectionFactory } from '../node/messaging/ipc-connection';

export default new ContainerModule(bind => {
    // #region ElectronMainAndBackend
    bindServiceProvider(bind, ElectronMainAndBackend);
    if (cluster) {
        // We need to setup the JSON-RPC connection between electron-main and backend:
        // We'll multiplex messages over a Node IPC connection and talk JSON-RPC over the channels.
        bind(ConnectionMultiplexer)
            .toDynamicValue(ctx => {
                const transformer = ctx.container.get(ConnectionTransformer);
                const nodeIpcConnectionFactory = ctx.container.get(NodeIpcConnectionFactory);
                const deferredConnectionFactory = ctx.container.get(DeferredConnectionFactory);
                const parentIpc = nodeIpcConnectionFactory(process);
                const sharedIpc: AnyConnection = transformer(parentIpc, {
                    decode: (message, emit) => {
                        if (typeof message === 'object' && THEIA_ELECTRON_IPC_CHANNEL_NAME in message) {
                            emit(message[THEIA_ELECTRON_IPC_CHANNEL_NAME]);
                        }
                    },
                    encode: (message, write) => {
                        write({ [THEIA_ELECTRON_IPC_CHANNEL_NAME]: message });
                    }
                });
                const deferredConnection = deferredConnectionFactory(waitForRemote(sharedIpc));
                return ctx.container.get(DefaultConnectionMultiplexer).initialize(deferredConnection);
            })
            .inSingletonScope()
            .whenTargetNamed(ElectronMainAndBackend);
        bind(BackendApplicationContribution)
            .toDynamicValue(ctx => ({
                initialize(): void {
                    const multiplexer = ctx.container.getNamed(ConnectionMultiplexer, ElectronMainAndBackend);
                    const serviceProvider = ctx.container.getNamed(ServiceProvider, ElectronMainAndBackend);
                    const jsonRpc = ctx.container.get(JsonRpc);
                    const rpcProxying = ctx.container.get(Rpc);
                    multiplexer.listen(({ serviceId, serviceParams }, accept, next) => {
                        const [service, dispose] = serviceProvider.getService(serviceId, serviceParams);
                        if (service) {
                            const messageConnection = jsonRpc.createMessageConnection(accept());
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
        bind(ProxyProvider)
            .toDynamicValue(ctx => {
                const multiplexer = ctx.container.getNamed(ConnectionMultiplexer, ElectronMainAndBackend);
                const jsonRpc = ctx.container.get(JsonRpc);
                return ctx.container.get(DefaultRpcProxyProvider).initialize((serviceId, serviceParams) => {
                    const channel = multiplexer.open({ serviceId, serviceParams });
                    const messageConnection = jsonRpc.createMessageConnection(channel);
                    return jsonRpc.createRpcConnection(messageConnection);
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
        bind(BackendApplicationContribution)
            .toDynamicValue(ctx => ({
                initialize(): void {
                    ctx.container.get(inProcessProxyProvider);
                }
            }))
            .inSingletonScope();
    }
    // #endregion
});
