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
import { castConnection, Connection, ConnectionTransformer, ProxyProvider, ServiceProvider } from '../common';
import { DefaultConnectionMultiplexer } from '../common/connection-multiplexer';
import { JsonRpcProxyProvider } from '../common/json-rpc-proxy-provider';
import { ElectronMainAndBackend } from '../electron-common';
import { cluster } from '../node';
import { InProcessProxyProvider } from '../node/in-process-proxy-provider';
import { NodeIpcConnection } from '../node/messaging/ipc-connection';

export default new ContainerModule(bind => {
    // #region singletons
    bind(InProcessProxyProvider).toSelf().inSingletonScope();
    // #endregion
    // #region ElectronMainAndBackend
    bind(ProxyProvider)
        .toDynamicValue(ctx => {
            const serviceProvider = ctx.container.getNamed(ServiceProvider, ElectronMainAndBackend);
            if (cluster) {
                const transformer = ctx.container.get(ConnectionTransformer);
                const parentConnection = ctx.container.get(NodeIpcConnection).initialize(process);
                const sharedIpcConnection: Connection<object> = transformer(parentConnection, {
                    decode: (message, emit) => {
                        if (typeof message === 'object' && 'theiaIpc' in message) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            emit((message as any).theiaIpc);
                        }
                    },
                    encode: message => ({ theiaIpc: message })
                });
                const multiplexer = new DefaultConnectionMultiplexer().initialize<object>(castConnection(sharedIpcConnection));
                return ctx.container.get(JsonRpcProxyProvider).initialize(serviceProvider, multiplexer, multiplexer);
            } else {
                return ctx.container.get(InProcessProxyProvider).initialize(ElectronMainAndBackend, serviceProvider);
            }
        })
        .inSingletonScope()
        .whenTargetNamed(ElectronMainAndBackend);
    // #endregion
});
