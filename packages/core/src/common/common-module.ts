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
import { JsonRpcProxyProvider } from './json-rpc-proxy-provider';
import { ConnectionTransformer, TransformedConnection } from './connection-transformer';
import { JsonRpcConnection, JsonRpcConnectionFactory } from './json-rpc';
import { LazyProxyFactory, LazyProxyHandler } from './proxy';
import { DefaultReflection, Reflection } from './reflection';

export default new ContainerModule(bind => {
    // #region transients
    bind(JsonRpcProxyProvider).toSelf().inTransientScope();
    // #endregion
    // #region factories
    bind(ConnectionTransformer)
        .toFunction((connection, transformer) => new TransformedConnection().initialize(connection, transformer));
    bind(JsonRpcConnectionFactory)
        .toFunction(connection => new JsonRpcConnection(connection));
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
    // #region singletons
    bind(Reflection).to(DefaultReflection).inSingletonScope();
    // #endregion
});
