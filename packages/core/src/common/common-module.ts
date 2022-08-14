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
import { DeferredConnection, DeferredConnectionFactory } from './connection/deferred';
import { DefaultConnectionMultiplexer } from './connection/multiplexer';
import { ConnectionTransformer, DefaultConnectionTransformer } from './connection/transformer';
import { ContainerScope, DefaultContainerScope } from './container-scope';
import { DefaultJsonRpc, JsonRpc } from './json-rpc';
import { LazyProxyFactory, LazyProxyHandler } from './proxy';
import { DefaultRc, DefaultTracker, Rc } from './reference-counter';
import { DefaultReflection, Reflection } from './reflection';
import { DefaultRouteHandlerProvider, RouteHandlerProvider } from './route-handler';
import { DefaultRouter } from './routing';
import { DefaultRpc, DefaultRpcProxyProvider, Rpc } from './rpc';

export default new ContainerModule(bind => {
    // #region transients
    bind(DefaultRouter)
        .toDynamicValue(ctx => new DefaultRouter())
        .inTransientScope();
    bind(DefaultConnectionMultiplexer)
        .toDynamicValue(ctx => new DefaultConnectionMultiplexer(ctx.container.get(DefaultRouter)))
        .inTransientScope();
    bind(DefaultRpcProxyProvider)
        .toDynamicValue(ctx => new DefaultRpcProxyProvider(ctx.container.get(Rpc)))
        .inTransientScope();
    // #endregion
    // #region singletons
    bind(ConnectionTransformer)
        .toDynamicValue(ctx => new DefaultConnectionTransformer())
        .inSingletonScope();
    bind(RouteHandlerProvider)
        .toDynamicValue(ctx => new DefaultRouteHandlerProvider())
        .inSingletonScope();
    bind(JsonRpc)
        .toDynamicValue(ctx => new DefaultJsonRpc())
        .inSingletonScope();
    bind(Reflection)
        .toDynamicValue(ctx => new DefaultReflection())
        .inSingletonScope();
    bind(Rpc)
        .toDynamicValue(ctx => new DefaultRpc(ctx.container.get(Reflection)))
        .inSingletonScope();
    bind(Rc.Tracker)
        .toDynamicValue(ctx => new DefaultTracker(disposable => DefaultRc.New(disposable), Rc.GlobalMap))
        .inSingletonScope();
    // #endregion
    // #region factories
    bind(DeferredConnectionFactory)
        .toFunction(promise => new DeferredConnection(promise));
    bind(ContainerScope.Factory)
        .toFunction(container => new DefaultContainerScope(container));
    bind(LazyProxyFactory)
        .toDynamicValue(ctx => promise => {
            // eslint-disable-next-line no-null/no-null
            const nullObject = Object.freeze(Object.create(null));
            const reflection = ctx.container.get(Reflection);
            const proxyHandler = new LazyProxyHandler(promise, reflection);
            return new Proxy(nullObject, proxyHandler);
        })
        .inSingletonScope();
    // #endregion
});
