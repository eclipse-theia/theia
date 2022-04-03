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

import { inject, injectable } from 'inversify';
import { CancellationToken } from './cancellation';
import { Disposable, DisposableCollection } from './disposable';
import { Emitter, Event } from './event';
import { Proxied, Proxyable } from './proxy';
import { Reflection } from './reflection';
import { serviceIdentifier } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const RpcConnection = serviceIdentifier<RpcConnection>('RpcConnection');
export interface RpcConnection {
    onClose: Event<void>
    onRequest(handler: (method: string, params: any[], token: CancellationToken) => any): void
    onNotification(handler: (method: string, params: any[]) => void): void
    sendRequest<T>(method: string, params: any[]): Promise<T>
    sendNotification(method: string, params: any[]): void
}

/**
 * We need deferred connections for proxies:
 * Using inversify we often need a proxy instance before the connection is actually established.
 */
export const DeferredRpcConnectionFactory = serviceIdentifier<DeferredRpcConnectionFactory>('DeferredRpcConnectionFactory');
export type DeferredRpcConnectionFactory = (rpcConnectionPromise: PromiseLike<RpcConnection>) => RpcConnection;

export const RpcProxyFactory = serviceIdentifier<RpcProxyFactory>('RpcProxyFactory');
export interface RpcProxyFactory {
    createProxy<T extends Proxyable>(rpcConnection: RpcConnection): Proxied<T>
    createServer(server: object, rpcConnection: RpcConnection): Disposable
}

export class DeferredRpcConnection implements RpcConnection {

    protected _onCloseEmitter = new Emitter<void>();
    protected _rpcConnectionPromise: Promise<RpcConnection>;

    constructor(rpcConnectionPromise: PromiseLike<RpcConnection>) {
        this._rpcConnectionPromise = Promise.resolve(rpcConnectionPromise);
    }

    get onClose(): Event<void> {
        return this._onCloseEmitter.event;
    }

    onRequest(handler: (method: string, params: any[], token: CancellationToken) => any): void {
        this._rpcConnectionPromise.then(rpcConnection => rpcConnection.onRequest(handler));
    }

    onNotification(handler: (method: string, params: any[]) => void): void {
        this._rpcConnectionPromise.then(rpcConnection => rpcConnection.onNotification(handler));
    }

    sendRequest<T>(method: string, params: any[]): Promise<T> {
        return this._rpcConnectionPromise.then(rpcConnection => rpcConnection.sendRequest<T>(method, params));
    }

    sendNotification(method: string, params: any[]): void {
        this._rpcConnectionPromise.then(rpcConnection => rpcConnection.sendNotification(method, params));
    }
}

@injectable()
export class DefaultRpcProxyFactory implements RpcProxyFactory {

    @inject(Reflection)
    protected reflection: Reflection;

    createProxy<T extends Proxyable>(rpcConnection: RpcConnection): Proxied<T> {
        this.reflection.ensureMetadata(rpcConnection, 'theia:rpcProxyInstalled', true);
        // eslint-disable-next-line no-null/no-null
        const emptyObject = Object.freeze(Object.create(null));
        const rpcProxyHandler = new RpcProxyHandler(rpcConnection, this.reflection);
        return new Proxy(emptyObject, rpcProxyHandler);
    }

    createServer(server: any, rpcConnection: RpcConnection): Disposable {
        this.reflection.ensureMetadata(rpcConnection, 'theia:rpcServerInstalled', true);
        rpcConnection.onRequest((method, params, token) => server[method](...params, token));
        const disposables = new DisposableCollection(
            ...Array.from(
                this.reflection.getEventNames(server),
                eventName => server[eventName]((event: unknown) => rpcConnection.sendNotification(eventName, [event]))
            ),
            rpcConnection.onClose(() => {
                disposables.dispose();
            }),
            {
                dispose: () => Reflect.deleteMetadata('theia:rpcConnectionServer', rpcConnection)
            }
        );
        return disposables;
    }
}

export class RpcProxyHandler<T extends object> implements ProxyHandler<T> {

    protected emitters = new Map<string, Emitter | undefined>();
    protected cache = new Map<string | symbol, any>();

    constructor(
        protected rpcConnection: RpcConnection,
        protected reflection: Reflection,
    ) {
        rpcConnection.onNotification((method, params) => {
            const emitter = this.emitters.get(method);
            if (emitter) {
                emitter.fire(params);
            }
        });
    }

    get(target: T, property: string | symbol, receiver: T): any {
        if (typeof property !== 'string') {
            throw new Error('you can only index this object with strings');
        }
        let returnValue = this.cache.get(property);
        if (!returnValue) {
            if (this.reflection.isEventName(property)) {
                const emitter = new Emitter();
                this.emitters.set(property, emitter);
                returnValue = emitter.event;
            } else {
                returnValue = async (...params: unknown[]) => this.rpcConnection.sendRequest(property, params);
            }
        }
        return returnValue;
    }
}
