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

/* eslint-disable @typescript-eslint/no-explicit-any, no-null/no-null */

import { Disposable, DisposableCollection } from './disposable';
import { CancellationToken } from './cancellation';
import { Emitter, Event } from './event';
import { Proxied, ProxyProvider } from './proxy';
import { Reflection } from './reflection';
import { NonArray, serviceIdentifier } from './types';

/**
 * Methods to wire JavaScript {@link Proxy} instances over {@link RpcConnection}s.
 */
export interface Rpc {

    /**
     * Create a JS proxy that translates method calls into RPC requests.
     * Calling `proxy.dispose` will close the underlying connection,
     * you most likely want to use this on ephemeral proxies only!
     */
    createProxy<T>(rpcConnection: RpcConnection, options?: RpcProxyOptions): Proxied<T>

    /**
     * Serve {@link rpcConnection} by calling methods on {@link server}.
     *
     * It will only "un-hook" events when the {@link rpcConnection} closes.
     */
    serve<T extends RpcServer>(server: NonArray<T>, rpcConnection: RpcConnection): void
}
export namespace RpcApi {

    export interface Server {
        /**
         *
         * @param clientId
         */
        [kHandleNewConnection]?(clientId: string, rpcConnection: RpcConnection): void
        /**
         *
         * @param clientId
         */
        [kHandleConnectionLost]?(clientId: string, rpcConnection: RpcConnection): void
    }

    /**
     *
     */
    export const kHandleConnectionLost = Symbol.for('kHandleConnectionLost');

    /**
     *
     */
    export const kHandleNewConnection = Symbol.for('kHandleNewConnection');

    // #region decorators

    /**
     * Annotate a method or a property to be ignored by the reflection mechanism.
     */
    export function Ignore(): MethodDecorator | PropertyDecorator {
        return Reflection.Ignore();
    }

    // #endregion
}
export const Rpc = Object.assign(
    serviceIdentifier<Rpc>('Rpc'),
    RpcApi
);

/**
 * Represents a scoped connection to a remote service on which to call methods.
 *
 * There should be a 1-to-1 relationship between a `RpcConnection` and the
 * remote service it represents.
 *
 * `RpcConnection`s must support {@link ApplicationError}s' serialization.
 */
export const RpcConnection = serviceIdentifier<RpcConnection>('RpcConnection');
export interface RpcConnection {
    onClose: Event<void>
    handleRequest(handler: (method: string, params: any[], token: CancellationToken) => any): void
    handleNotification(handler: (method: string, params: any[]) => void): void
    sendRequest<T>(method: string, params: any[]): Promise<T>
    sendNotification(method: string, params: any[]): void
    close(): void
}

export interface RpcServer {
    [key: string | symbol]: any
}

export interface RpcProxyOptions {
    disposeCallback?(): void
}

/**
 * @internal
 */
export class DefaultRpc implements Rpc {

    constructor(
        protected reflection: Reflection
    ) { }

    createProxy<T>(rpcConnection: RpcConnection, options?: RpcProxyOptions): Proxied<T> {
        // eslint-disable-next-line no-null/no-null
        const emptyObject = Object.freeze(Object.create(null));
        const rpcProxyHandler = new RpcProxyHandler(rpcConnection, this.reflection, options?.disposeCallback);
        return new Proxy(emptyObject, rpcProxyHandler);
    }

    serve(server: RpcServer, rpcConnection: RpcConnection): void {
        rpcConnection.handleRequest((method, params, token) => server[method](...params, token));
        const disposables = new DisposableCollection();
        this.reflection.getEventNames(server).forEach(eventName => {
            server[eventName].call(server, (value: any) => {
                rpcConnection.sendNotification(eventName, [value]);
            }, undefined, disposables);
        });
        rpcConnection.onClose(() => disposables.dispose());
    }
}

/**
 * @internal
 */
export type RpcConnectionProvider = (serviceId: string, serviceParams?: any) => RpcConnection;

/**
 * @internal
 */
export class DefaultRpcProxyProvider implements ProxyProvider {

    protected connectionToProxyCache = new WeakMap<RpcConnection, any>();
    protected rpcConnectionProvider?: RpcConnectionProvider;

    constructor(
        protected rpc: Rpc
    ) { }

    initialize(rpcConnectionProvider: RpcConnectionProvider): ProxyProvider {
        this.rpcConnectionProvider = rpcConnectionProvider;
        return this;
    }

    getProxy(serviceId: string, params?: any): any {
        const rpcConnection = this.rpcConnectionProvider!(serviceId, params);
        let proxy = this.connectionToProxyCache.get(rpcConnection);
        if (!proxy) {
            this.connectionToProxyCache.set(rpcConnection, proxy = this.rpc.createProxy(rpcConnection));
        }
        return proxy;
    }
}

/**
 * @internal
 */
export class RpcProxyHandler<T extends object> implements ProxyHandler<T>, Disposable {

    protected emitters = new Map<string, Emitter>();
    protected properties = new Map<string | symbol, any>();
    protected disposed = false;

    constructor(
        protected rpcConnection: RpcConnection,
        protected reflection: Reflection,
        protected disposeCallback?: () => void
    ) {
        this.properties.set('dispose', () => this.dispose());
        rpcConnection.handleNotification((eventName, params) => {
            this.emitters.get(eventName)?.fire(params[0]);
        });
        rpcConnection.onClose(() => this.dispose());
    }

    get(target: T, propertyKey: string | symbol, receiver: T): (...params: any[]) => any {
        if (this.disposed) {
            throw new Error('this instance is no longer valid!');
        }
        if (typeof propertyKey !== 'string') {
            return this.properties.get(propertyKey);
        }
        if (this.properties.has(propertyKey)) {
            return this.properties.get(propertyKey);
        }
        let returnValue;
        if (this.reflection.isEventName(propertyKey)) {
            const emitter = new Emitter();
            this.emitters.set(propertyKey, emitter);
            returnValue = emitter.event;
        } else {
            returnValue = async (...params: any[]) => this.rpcConnection.sendRequest(propertyKey, params);
        }
        this.properties.set(propertyKey, returnValue);
        return returnValue;
    }

    set(target: T, propertyKey: string | symbol, value: any, receiver: T): boolean {
        this.properties.set(propertyKey, value);
        return true;
    }

    deleteProperty(target: T, propertyKey: string | symbol): boolean {
        return this.properties.delete(propertyKey);
    }

    dispose(): void {
        if (!this.disposed) {
            this.disposed = true;
            this.emitters.forEach(emitter => emitter.dispose());
            this.emitters.clear();
            this.properties.clear();
            this.disposeCallback?.();
        }
    }
}
