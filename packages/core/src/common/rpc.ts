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
import { CancellationToken } from './cancellation';
import { Emitter, Event } from './event';
import { Proxied, ProxyProvider } from './proxy';
import { Reflection } from './reflection';
import { serviceIdentifier } from './types';

/**
 * Represents a scoped connection to a remote service on which to call methods.
 *
 * There should be a 1-to-1 relationship between a `RpcConnection` and the
 * remote service it represents.
 */
export const RpcConnection = serviceIdentifier<RpcConnection>('RpcConnection');
export interface RpcConnection {
    onClose: Event<void>
    onRequest(handler: (method: string, params: any[], token: CancellationToken) => any): void
    onNotification(handler: (method: string, params: any[]) => void): void
    sendRequest<T>(method: string, params: any[]): Promise<T>
    sendNotification(method: string, params: any[]): void
}

/**
 * Methods to wire JavaScript {@link Proxy} instances over {@link RpcConnection}s.
 */
export const RpcProxying = serviceIdentifier<RpcProxying>('RpcProxying');
export interface RpcProxying {
    createProxy<T>(rpcConnection: RpcConnection): Proxied<T>
    serve(server: object, rpcConnection: RpcConnection): void
}

/**
 * @internal
 */
@injectable()
export class DefaultRpcProxying implements RpcProxying {

    @inject(Reflection)
    protected reflection: Reflection;

    createProxy<T>(rpcConnection: RpcConnection): Proxied<T> {
        // eslint-disable-next-line no-null/no-null
        const emptyObject = Object.freeze(Object.create(null));
        const rpcProxyHandler = new RpcProxyHandler(rpcConnection, this.reflection);
        return new Proxy(emptyObject, rpcProxyHandler);
    }

    serve(server: any, rpcConnection: RpcConnection): void {
        rpcConnection.onRequest((method, params, token) => server[method](...params, token));
        this.reflection.getEventNames(server).forEach(
            eventName => server[eventName]((event: unknown) => rpcConnection.sendNotification(eventName, [event]))
        );
    }
}

/**
 * @internal
 */
export type RpcConnectionProvider = (serviceId: string, serviceParams?: any) => RpcConnection;

/**
 * @internal
 */
@injectable()
export class DefaultRpcProxyProvider implements ProxyProvider {

    protected rpcConnectionProvider?: RpcConnectionProvider;
    protected connectionToProxyCache = new WeakMap<RpcConnection, any>();

    @inject(RpcProxying)
    protected rpcProxying: RpcProxying;

    initialize(rpcConnectionProvider: RpcConnectionProvider): ProxyProvider {
        this.rpcConnectionProvider = rpcConnectionProvider;
        return this;
    }

    getProxy(serviceId: string, params?: any): any {
        const rpcConnection = this.rpcConnectionProvider!(serviceId, params);
        let proxy = this.connectionToProxyCache.get(rpcConnection);
        if (!proxy) {
            this.connectionToProxyCache.set(rpcConnection, proxy = this.rpcProxying.createProxy(rpcConnection));
        }
        return proxy;
    }
}

/**
 * @internal
 */
export class RpcProxyHandler<T extends object> implements ProxyHandler<T> {

    protected emitters = new Map<string, Emitter | undefined>();
    protected cache = new Map<string | symbol, any>();

    constructor(
        protected rpcConnection: RpcConnection,
        protected reflection: Reflection,
    ) {
        rpcConnection.onNotification((eventName, params) => {
            this.emitters.get(eventName)?.fire(params[0]);
        });
    }

    get(target: T, property: string | symbol, receiver: T): any {
        if (typeof property !== 'string') {
            throw new Error('you can only index this proxy with strings');
        }
        let returnValue = this.cache.get(property);
        if (!returnValue) {
            if (this.reflection.isEventName(property)) {
                const emitter = new Emitter();
                this.emitters.set(property, emitter);
                returnValue = emitter.event;
            } else {
                returnValue = async (...params: any[]) => this.rpcConnection.sendRequest(property, params);
            }
            this.cache.set(property, returnValue);
        }
        return returnValue;
    }
}
