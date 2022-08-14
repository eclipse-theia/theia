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

import { ContainerModule, inject, injectable, optional } from 'inversify';
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
import { ConnectionMultiplexer, DefaultConnectionMultiplexer } from '../../common/connection/multiplexer';
import { DefaultRouter, Handler, Router } from '../../common/routing';
import { JsonRpc } from '../../common/json-rpc';
import { ConnectionContainerModule } from './connection-container-module';
import { MsgpackrMessageTransformer } from '../../common/msgpackr';
import { MultiplexerConnection } from '../../common/connection/multiplexer-connection';
import { DefaultProxyConnection, ProxyConnection } from '../../common/connection/proxy-connection';
import { DefaultConnectionRegistry } from '../../common/connection/connection-registry';
import { RunOnceTimeout } from '../../common/run-once-timeout';
import { ConnectionId, ConnectionPath, FrontendId } from '../../common/common-parameters';
import { Packr, Unpackr } from 'msgpackr';

/**
 * Base bindings that will live in Inversify containers scoped to each frontend.
 */
export const BackendAndFrontendContainerScopeModule = new ContainerModule(bind => {
    bind(MainConnectionHandler).toSelf().inSingletonScope();
    bindServiceProvider(bind, BackendAndFrontend);
    // Router running all `ConnectionHandlers` bound to `ConnectionHandler` named `BackendAndFrontend`
    bind(ConnectionRouter)
        .toDynamicValue(ctx => {
            const router = ctx.container.get<DefaultRouter<AnyConnection>>(DefaultRouter);
            getAllNamedOptional(ctx.container, ConnectionHandler, BackendAndFrontend)
                .forEach(handler => router.listen(handler));
            return router;
        })
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
    bind(ConnectionMultiplexer)
        .toDynamicValue(ctx => {
            const router = ctx.container.getNamed(ConnectionRouter, BackendAndFrontend);
            const { mainConnection } = ctx.container.get(MainConnectionHandler);
            const multiplexerConnection = new MultiplexerConnection(mainConnection, new Packr(), new Unpackr());
            const mainMultiplexer = ctx.container.get(DefaultConnectionMultiplexer).initialize(multiplexerConnection);
            mainMultiplexer.listen((params, accept, next) => router.route(params, accept, next));
            return mainMultiplexer;
        })
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
    bind(ContainerScope.Init)
        .toFunction(container => {
            container.getNamed(ConnectionMultiplexer, BackendAndFrontend);
        });
    // Provide proxies to frontend instances using JSON-RPC
    bind(ProxyProvider)
        .toDynamicValue(ctx => {
            const mainMultiplexer = ctx.container.getNamed(ConnectionMultiplexer, BackendAndFrontend);
            const jsonRpc = ctx.container.get(JsonRpc);
            const proxyProvider = ctx.container.get(DefaultRpcProxyProvider);
            const connectionTransformer = ctx.container.get(ConnectionTransformer);
            const msgpackrTransformer = new MsgpackrMessageTransformer();
            return proxyProvider.initialize((serviceId, serviceParams) => {
                const path = JSON_RPC_ROUTE.reverse({ serviceId });
                const connection = mainMultiplexer.open({ path });
                const msgpackConnection = connectionTransformer.transformConnection(connection, msgpackrTransformer);
                return jsonRpc.createRpcConnection(jsonRpc.createMessageConnection(msgpackConnection));
            });
        })
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
    // Main connection handler
    bind(ConnectionHandler)
        .toDynamicValue(ctx => ctx.container.get(MainConnectionHandler).createMainRouteHandler())
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
    // Handler for JSON-RPC connections coming from the frontend
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
                ctx.container.get(SocketIoServer)
                    .initialize(httpServer)
                    .listen(({ socket }, accept, next) => {
                        const path = socket.nsp.name;
                        const frontendId = FrontendId.get(socket.handshake.auth);
                        const connectionId = ConnectionId.get(socket.handshake.auth);
                        if (typeof frontendId !== 'string') {
                            return next();
                        }
                        router.route({
                            ...ConnectionPath.create(path),
                            ...FrontendId.create(frontendId),
                            ...ConnectionId.create(connectionId)
                        }, accept, next);
                    });
            }
        }))
        .inSingletonScope();
    // Router handling connections coming from the frontend.
    // It will find the adequate scoped Inversify container and route the connection there.
    bind(ConnectionRouter)
        .toDynamicValue(ctx => {
            const router = ctx.container.get<DefaultRouter<AnyConnection>>(DefaultRouter);
            const rcTracker = ctx.container.get(Rc.Tracker);
            const containerScopeFactory = ctx.container.get(ContainerScope.Factory);
            const scopes = new Rc.SharedRefMap((frontendId: string) => {
                const child = ctx.container.createChild();
                getAllNamedOptional(ctx.container, ContainerModule, BackendAndFrontend)
                    .forEach(containerModule => child.load(containerModule));
                // TODO: Remove this API?
                getAllOptional(ctx.container, ConnectionContainerModule)
                    .forEach(containerModule => child.load(containerModule));
                const initCallbacks = getAllNamedOptional(child, ContainerScope.Init, BackendAndFrontend);
                const containerScope = containerScopeFactory(child).initialize(initCallbacks);
                return rcTracker.track(containerScope);
            });
            const connections = new DefaultConnectionRegistry<string, ProxyConnection<unknown>>();
            // first routing to find the Inversify container scope for `frontendId`
            router.listen((params, accept, next) => {
                // connections must define a frontendId
                if (!params.frontendId) {
                    return next();
                }
                // support for reconnecting connections
                if (params.connectionId) {
                    let proxy = connections.getConnection(params.connectionId);
                    if (proxy) {
                        return ProxyConnection.ensureFree(proxy).connect(accept());
                    }
                    const accept_ = accept;
                    accept = () => {
                        connections.registerConnection(params.connectionId, proxy = new DefaultProxyConnection(), { allowReplace: false });
                        const timeout = new RunOnceTimeout(() => proxy!.close());
                        proxy.onDisconnect(() => timeout.arm(10_000));
                        proxy.onReconnect(() => timeout.disarm());
                        return proxy.connect(accept_());
                    };
                }
                // second routing to dispatch the incoming connection to scoped services
                const scopeRc = scopes.cloneOrCreate(params.frontendId);
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

/**
 * @internal
 *
 * Handles the "main connection" between frontend and backend.
 *
 * The frontend will open one socket.io connection on `/` and multiplex various
 * channels over it.
 */
@injectable()
export class MainConnectionHandler {

    readonly mainConnection: AnyConnection;

    protected mainConnectionDeferred = new Deferred<AnyConnection>();

    constructor(
        @inject(DeferredConnectionFactory) protected deferredConnectionFactory: DeferredConnectionFactory,
        @inject(RouteHandlerProvider) protected routeHandlerProvider: RouteHandlerProvider
    ) {
        this.mainConnection = this.deferredConnectionFactory(this.mainConnectionDeferred.promise);
    }

    createMainRouteHandler(): Handler<AnyConnection> {
        return this.routeHandlerProvider.createRouteHandler('/', (params, accept, next) => {
            if (this.mainConnectionDeferred.state === 'unresolved') {
                this.mainConnectionDeferred.resolve(accept());
            } else {
                next(new Error('cannot open two "main" connections'));
            }
        });
    }
}
