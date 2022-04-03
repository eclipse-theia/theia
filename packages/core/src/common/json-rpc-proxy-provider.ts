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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { inject, injectable } from 'inversify';
import { ProxyProvider } from './proxy';
import { JsonRpcConnectionFactory } from './json-rpc';
import { ServiceProvider } from './service-provider';
import { castConnection, Connection, ConnectionEmitter, ConnectionProvider } from './connection';
import { RpcProxyFactory } from './rpc';

@injectable()
export class JsonRpcProxyProvider implements ProxyProvider {

    protected serviceProvider?: ServiceProvider;
    protected connectionProvider?: ConnectionProvider<object>;
    protected connectionEmitter?: ConnectionEmitter<object>;
    protected proxies = new Map<string, any>();
    protected servers = new Map<string, any>();

    @inject(RpcProxyFactory)
    protected rpcProxyFactory: RpcProxyFactory;

    @inject(JsonRpcConnectionFactory)
    protected jsonRpcConnectionFactory: JsonRpcConnectionFactory;

    initialize(serviceProvider: ServiceProvider, connectionProvider: ConnectionProvider<object>, connectionEmitter: ConnectionEmitter<object>): this {
        this.serviceProvider = serviceProvider;
        this.connectionProvider = connectionProvider;
        this.connectionEmitter = connectionEmitter;
        this.connectionEmitter.listen((connection, params) => this.handleConnection(connection, params));
        return this;
    }

    getProxy(serviceId: string): any {
        let proxy = this.proxies.get(serviceId);
        if (!proxy) {
            const channel = this.connectionProvider!.open({ serviceId });
            this.proxies.set(serviceId, proxy = this.rpcProxyFactory.createProxy(this.jsonRpcConnectionFactory(castConnection(channel))));
            channel.onClose(() => {
                this.proxies.delete(serviceId);
            });
        }
        return proxy;
    }

    protected async handleConnection(connection: Connection<object>, params: any): Promise<boolean> {
        const { serviceId, serviceParams } = params;
        if (typeof serviceId === 'string') {
            let service = this.servers.get(serviceId);
            if (!service) {
                this.servers.set(serviceId, service = this.serviceProvider!.getService(serviceId, serviceParams));
            }
            this.rpcProxyFactory.createServer(service, this.jsonRpcConnectionFactory(castConnection(connection)));
            return true;
        }
        return false;
    }
}
