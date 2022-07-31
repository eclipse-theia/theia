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

import { ContainerModule, inject, injectable } from 'inversify';
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
            const mainMultiplexer = ctx.container.get(DefaultConnectionMultiplexer).initialize(mainConnection);
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
            return proxyProvider.initialize(serviceId => {
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
                        const frontendId = socket.handshake.auth.THEIA_FRONTEND_ID;
                        if (typeof frontendId !== 'string') {
                            return next();
                        }
                        router.route({ frontendId, path }, accept, next);
                    });
            }
        }))
        .inSingletonScope();
    // Router handling connections coming from the frontend.
    // It will find the adeguate scoped Inversify container and route the connection there too.
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
                const readyCallbacks = getAllNamedOptional(child, ContainerScope.Init, BackendAndFrontend);
                const containerScope = containerScopeFactory(child, readyCallbacks);
                console.log('CREATE NEW SCOPE FOR', frontendId);
                return rcTracker.track(containerScope);
            });
            // first routing to find the Inversify container scope for `frontendId`
            router.listen((params, accept, next) => {
                if (!params.frontendId) {
                    return next();
                }
                const scopeRc = scopes.cloneOrCreate(params.frontendId);
                console.log('GOT SCOPE FOR', params.frontendId);
                // second routing to dispatch the incoming connection to scoped services
                scopeRc.ref()
                    .container()
                    .getNamed<Router<AnyConnection>>(ConnectionRouter, BackendAndFrontend)
                    .route(params, () => {
                        console.log('HANDLED!', JSON.stringify(params));
                        const connection = accept();
                        connection.onClose(() => scopeRc.dispose());
                        return connection;
                    }, error => {
                        console.log('UNHANDLED:', error);
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
            console.log('MAIN HANDLED!', JSON.stringify(params));
            if (this.mainConnectionDeferred.state === 'unresolved') {
                this.mainConnectionDeferred.resolve(accept());
            } else {
                next(new Error('cannot open two backend service connections'));
            }
        });
    }
}
