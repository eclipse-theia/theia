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
    BackendAndFrontend,
    bindServiceProvider, ConnectionHandler, ConnectionRouter,
    Deferred,
    ProxyProvider,
    RouteHandlerProvider,
    Rpc,
    ServiceProvider,
    Rc,
    ConnectionTransformer
} from '../../common';
import { AnyConnection, DeferredConnectionFactory } from '../../common/connection';
import { ContainerScope } from '../../common/container-scope';
import { getAllNamedOptional, getAllOptional } from '../../common/inversify-utils';
import { BackendApplicationContribution } from '../backend-application';
import { SocketIoServer } from '../socket-io-server';
import { DefaultRpcProxyProvider } from '../../common/rpc';
import { JSON_RPC_ROUTE } from '../../common/json-rpc-protocol';
import { DefaultConnectionMultiplexer } from '../../common/connection/multiplexer';
import { DefaultRouter, Router } from '../../common/routing';
import { JsonRpc } from '../../common/json-rpc';
import { ConnectionContainerModule } from './connection-container-module';
import { MsgpackrMessageTransformer } from '../../common/msgpackr';

export const BackendAndFrontendContainerScopeModule = new ContainerModule(bind => {
    bindServiceProvider(bind, BackendAndFrontend);
    bind(ConnectionRouter)
        .toDynamicValue(ctx => {
            const handlers = getAllNamedOptional(ctx.container, ConnectionHandler, BackendAndFrontend);
            const router = ctx.container.get<DefaultRouter<AnyConnection>>(DefaultRouter);
            handlers.forEach(handler => router.listen(handler));
            return router;
        })
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
    /** Resolves when the frontend opens its `/backend-services/` connection. */
    const backendServiceConnectionDeferred = new Deferred<AnyConnection>();
    // Connection handler for the backend service connection used for reverse service requests
    bind(ConnectionHandler)
        .toDynamicValue(ctx => ctx.container.get(RouteHandlerProvider)
            .createRouteHandler('/backend-services/', (params, accept, next) => {
                if (backendServiceConnectionDeferred.state === 'unresolved') {
                    backendServiceConnectionDeferred.resolve(accept());
                } else {
                    next(new Error('cannot open two backend service connections'));
                }
            })
        )
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
    // JSON-RPC proxy from backend to frontend instances provider
    bind(ProxyProvider)
        .toDynamicValue(ctx => {
            const jsonRpc = ctx.container.get(JsonRpc);
            const proxyProvider = ctx.container.get(DefaultRpcProxyProvider);
            const connectionTransformer = ctx.container.get(ConnectionTransformer);
            const deferredConnectionFactory = ctx.container.get(DeferredConnectionFactory);
            const backendServiceConnection = deferredConnectionFactory(backendServiceConnectionDeferred.promise);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const multiplexer = ctx.container.get(DefaultConnectionMultiplexer).initialize<any>(backendServiceConnection);
            const msgpackrTransformer = new MsgpackrMessageTransformer();
            return proxyProvider.initialize(serviceId => {
                const path = JSON_RPC_ROUTE.reverse({ serviceId });
                const connection = multiplexer.open({ path });
                const msgpackConnection = connectionTransformer(connection, msgpackrTransformer);
                return jsonRpc.createRpcConnection(jsonRpc.createMessageConnection(msgpackConnection));
            });
        })
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
    // JSON-RPC proxy from frontend to backend connection handler
    bind(ConnectionHandler)
        .toDynamicValue(ctx => {
            const serviceProvider = ctx.container.getNamed(ServiceProvider, BackendAndFrontend);
            const jsonRpc = ctx.container.get(JsonRpc);
            const rpcProxying = ctx.container.get(Rpc);
            const connectionTransformer = ctx.container.get(ConnectionTransformer);
            const msgpackrTransformer = new MsgpackrMessageTransformer();
            return ctx.container.get(RouteHandlerProvider)
                .createRouteHandler(JSON_RPC_ROUTE, (params, accept, next) => {
                    const [service, dispose] = serviceProvider.getService(params.route.params.serviceId);
                    if (!service) {
                        return next();
                    }
                    const msgpackConnection = connectionTransformer(accept(), msgpackrTransformer);
                    const rpcConnection = jsonRpc.createRpcConnection(jsonRpc.createMessageConnection(msgpackConnection));
                    rpcProxying.serve(service, rpcConnection);
                    rpcConnection.onClose(dispose);
                });
        })
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
});

export const messagingBackendModule = new ContainerModule(bind => {
    // #region transients
    bind(SocketIoServer).toSelf().inTransientScope();
    // #endregion
    // #region BackendAndFrontend
    bind(BackendApplicationContribution)
        .toDynamicValue(ctx => ({
            onStart(httpServer): void {
                const router = ctx.container.getNamed(ConnectionRouter, BackendAndFrontend);
                ctx.container.get(SocketIoServer).initialize(httpServer, router, {
                    // middlewares: [
                    //     (socket, next) => {
                    //         if (socket.request.headers.origin) {
                    //             next();
                    //         } else {
                    //             next(new Error('invalid connection'));
                    //         }
                    //     }
                    // ]
                });
            }
        }))
        .inSingletonScope();
    // Router handling the frontend to backend connections
    bind(ConnectionRouter)
        .toDynamicValue(ctx => {
            const rcTracker = ctx.container.get(Rc.Tracker);
            const containerScopeFactory = ctx.container.get(ContainerScope.Factory);
            const router = ctx.container.get<DefaultRouter<AnyConnection>>(DefaultRouter);
            const scopes = new Rc.SharedRefMap((frontendId: string) => {
                const scopedModules = getAllNamedOptional(ctx.container, ContainerModule, BackendAndFrontend);
                // TODO: Remove this API?
                const scopedModules2 = getAllOptional(ctx.container, ConnectionContainerModule);
                const child = ctx.container.createChild();
                child.load(...scopedModules2, ...scopedModules);
                const readyCallbacks = getAllNamedOptional(child, ContainerScope.Init, BackendAndFrontend);
                const containerScope = containerScopeFactory(child, readyCallbacks);
                return rcTracker.track(containerScope);
            });
            // first routing to find the Inversify container scope for `frontendId`
            router.listen((params, accept, next) => {
                if (!params.frontendId) {
                    return next();
                }
                const scopeRc = scopes.cloneOrCreate(params.frontendId);
                // second routing to dispatch the incoming connection to scoped services
                scopeRc.ref()
                    .container()
                    .getNamed<Router<AnyConnection>>(ConnectionRouter, BackendAndFrontend)
                    .route(params, () => {
                        const connection = accept();
                        connection.onClose(() => scopeRc.dispose());
                        return connection;
                    }, error => {
                        scopeRc.dispose();
                        next(error);
                    });
            });
            return router;
        })
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
    bind(ContainerModule)
        .toConstantValue(BackendAndFrontendContainerScopeModule)
        .whenTargetNamed(BackendAndFrontend);
    // #endregion
});
