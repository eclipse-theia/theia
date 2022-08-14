// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
import {
    BackendAndFrontend, bindServiceProvider, Connection, ConnectionHandler, ConnectionProvider, ConnectionTransformer, DeferredConnectionFactory, ProxyProvider,
    RouteHandlerProvider, ServiceProvider
} from '../../common';
import { ConnectionMultiplexer, DefaultConnectionMultiplexer } from '../../common/connection/multiplexer';
import { getAllNamedOptional } from '../../common/inversify-utils';
import { JsonRpc } from '../../common/json-rpc';
import { JSON_RPC_ROUTE } from '../../common/json-rpc-protocol';
import { MsgpackrMessageTransformer } from '../../common/msgpackr';
import { DefaultRpcProxyProvider, Rpc } from '../../common/rpc';
import { FrontendApplicationContribution } from '../frontend-application';
import { DefaultFrontendInstance, FrontendInstance } from '../frontend-instance';
import { SocketIoConnectionProvider } from './socket-io-connection-provider';
import { MultiplexerConnection } from '../../common/connection/multiplexer-connection';
import { Packr, Unpackr } from 'msgpackr';

export default new ContainerModule(bind => {
    bind(FrontendInstance).to(DefaultFrontendInstance).inSingletonScope();
    bind(SocketIoConnectionProvider).toSelf().inSingletonScope();
    bind(ConnectionMultiplexer)
        .toDynamicValue(ctx => {
            const socketIoConnectionProvider = ctx.container.get(SocketIoConnectionProvider);
            const mainConnection = socketIoConnectionProvider.open({ path: '/', reconnection: true });
            const multiplexerConnection = new MultiplexerConnection(mainConnection, new Packr(), new Unpackr());
            const multiplexer = ctx.container.get(DefaultConnectionMultiplexer).initialize(multiplexerConnection);
            getAllNamedOptional(ctx.container, ConnectionHandler, BackendAndFrontend)
                .forEach(handler => multiplexer.listen(handler));
            return multiplexer;
        })
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
    bindServiceProvider(bind, BackendAndFrontend);
    // Force activation of the main connection + multiplexing
    bind(FrontendApplicationContribution)
        .toDynamicValue(ctx => ({
            initialize: () => {
                ctx.container.getNamed(ConnectionMultiplexer, BackendAndFrontend);
            }
        }))
        .inSingletonScope();
    // Handler for JSON-RPC connections coming from the backend
    bind(ConnectionHandler)
        .toDynamicValue(ctx => {
            const serviceProvider = ctx.container.getNamed(ServiceProvider, BackendAndFrontend);
            const jsonRpc = ctx.container.get(JsonRpc);
            const rpc = ctx.container.get(Rpc);
            const connectionTransformer = ctx.container.get(ConnectionTransformer);
            const msgpackrTransformer = new MsgpackrMessageTransformer();
            return ctx.container.get(RouteHandlerProvider)
                .createRouteHandler(JSON_RPC_ROUTE, (params, accept, next) => {
                    const [service, dispose] = serviceProvider.getService(params.route.params.serviceId);
                    if (!service) {
                        return next();
                    }
                    const msgpackConnection = connectionTransformer.transformConnection(accept(), msgpackrTransformer);
                    const rpcConnection = jsonRpc.createRpcConnection(jsonRpc.createMessageConnection(msgpackConnection));
                    rpc.serve(service, rpcConnection);
                    rpcConnection.onClose(dispose);
                });
        })
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
    bind(ProxyProvider)
        .toDynamicValue(ctx => {
            const jsonRpc = ctx.container.get(JsonRpc);
            const proxyProvider = ctx.container.get(DefaultRpcProxyProvider);
            const connectionTransformer = ctx.container.get(ConnectionTransformer);
            const connectionProvider = ctx.container.getNamed(ConnectionProvider, BackendAndFrontend);
            const deferredConnectionFactory = ctx.container.get(DeferredConnectionFactory);
            const msgpackrTransformer = new MsgpackrMessageTransformer();
            return proxyProvider.initialize(serviceId => {
                const jsonRpcServicePath = JSON_RPC_ROUTE.reverse({ serviceId });
                const connection = deferredConnectionFactory(Connection.waitForOpen(connectionProvider.open({ path: jsonRpcServicePath })));
                const msgpackConnection = connectionTransformer.transformConnection(connection, msgpackrTransformer);
                return jsonRpc.createRpcConnection(jsonRpc.createMessageConnection(msgpackConnection));
            });
        })
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
    // Get multiplexed connections over the "main connection"
    bind(ConnectionProvider)
        .toDynamicValue(ctx => ctx.container.getNamed(ConnectionMultiplexer, BackendAndFrontend))
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
});
