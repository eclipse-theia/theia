// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import type { interfaces } from 'inversify';
import { ProxyId, ProxyProvider } from '../proxy-provider';
import { RpcClient, RpcHandler } from './rpc-api';
import { RpcProxyHandler } from './rpc-proxy-handler';

export const RpcClientProvider = Symbol('RpcClientProvider') as symbol & interfaces.Abstract<RpcClientProvider>;
export interface RpcClientProvider {
    getRpcClient(proxyId: string): RpcClient
}

export const RpcHandlerProvider = Symbol('RpcHandlerProvider') as symbol & interfaces.Abstract<RpcHandlerProvider>;
export interface RpcHandlerProvider {
    getRpcHandler(proxyId: string): RpcHandler
}

/**
 * Generic component to get proxies through Theia's RPC API.
 */
export class RpcProxyProvider implements ProxyProvider {

    protected proxies = new Map<string, object>();

    constructor(
        protected clientProvider: RpcClientProvider,
        protected handlerProvider?: RpcHandlerProvider
    ) { }

    getProxy<T extends object>(proxyId: ProxyId<T>): T {
        let proxy = this.proxies.get(proxyId);
        if (!proxy) {
            const client = this.clientProvider.getRpcClient(proxyId);
            const handler = this.handlerProvider?.getRpcHandler(proxyId);
            this.proxies.set(proxyId, proxy = this.createProxy(client, handler));
        }
        return proxy as T;
    }

    protected createProxy(client: RpcClient, handler?: RpcHandler): object {
        // eslint-disable-next-line no-null/no-null
        return new Proxy(Object.create(null), new RpcProxyHandler(client, handler));
    }
}
