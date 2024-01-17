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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { ResponseError } from '../message-rpc/rpc-message-encoder';
import { ApplicationError } from '../application-error';
import { Disposable } from '../disposable';
import { Emitter, Event } from '../event';
import { Channel } from '../message-rpc/channel';
import { RequestHandler, RpcProtocol } from '../message-rpc/rpc-protocol';
import { ConnectionHandler } from './handler';
import { Deferred } from '../promise-util';
import { decorate, injectable, unmanaged } from '../../../shared/inversify';

export type RpcServer<Client> = Disposable & {
    /**
     * If this server is a proxy to a remote server then
     * a client is used as a local object
     * to handle RPC messages from the remote server.
     */
    setClient(client: Client | undefined): void;
    getClient?(): Client | undefined;
};

export interface RpcConnectionEventEmitter {
    readonly onDidOpenConnection: Event<void>;
    readonly onDidCloseConnection: Event<void>;
}
export type RpcProxy<T> = T & RpcConnectionEventEmitter;

export class RpcConnectionHandler<T extends object> implements ConnectionHandler {
    constructor(
        readonly path: string,
        readonly targetFactory: (proxy: RpcProxy<T>) => any,
        readonly factoryConstructor: new () => RpcProxyFactory<T> = RpcProxyFactory
    ) { }

    onConnection(connection: Channel): void {
        const factory = new this.factoryConstructor();
        const proxy = factory.createProxy();
        factory.target = this.targetFactory(proxy);
        factory.listen(connection);
    }
}
/**
 * Factory for creating a new {@link RpcProtocol} for a given chanel and {@link RequestHandler}.
 */
export type RpcProtocolFactory = (channel: Channel, requestHandler: RequestHandler) => RpcProtocol;

const defaultRpcProtocolFactory: RpcProtocolFactory = (channel, requestHandler) => new RpcProtocol(channel, requestHandler);

/**
 * Factory for RPC proxy objects.
 *
 * A RPC proxy exposes the programmatic interface of an object through
 * Theia's RPC protocol. This allows remote programs to call methods of this objects by
 * sending RPC requests. This takes place over a bi-directional stream,
 * where both ends can expose an object and both can call methods on each other'
 * exposed object.
 *
 * For example, assuming we have an object of the following type on one end:
 *
 *     class Foo {
 *         bar(baz: number): number { return baz + 1 }
 *     }
 *
 * which we want to expose through a RPC interface.  We would do:
 *
 *     let target = new Foo()
 *     let factory = new RpcProxyFactory<Foo>('/foo', target)
 *     factory.onConnection(connection)
 *
 * The party at the other end of the `connection`, in order to remotely call
 * methods on this object would do:
 *
 *     let factory = new RpcProxyFactory<Foo>('/foo')
 *     factory.onConnection(connection)
 *     let proxy = factory.createProxy();
 *     let result = proxy.bar(42)
 *     // result is equal to 43
 *
 * One the wire, it would look like this:
 *
 *     --> { "type":"1", "id": 1, "method": "bar", "args": [42]}
 *     <-- { "type":"3", "id": 1, "res": 43}
 *
 * Note that in the code of the caller, we didn't pass a target object to
 * RpcProxyFactory, because we don't want/need to expose an object.
 * If we had passed a target object, the other side could've called methods on
 * it.
 *
 * @param <T> - The type of the object to expose to RPC.
 */

export class RpcProxyFactory<T extends object> implements ProxyHandler<T> {

    protected readonly onDidOpenConnectionEmitter = new Emitter<void>();
    protected readonly onDidCloseConnectionEmitter = new Emitter<void>();

    protected rpcDeferred: Deferred<RpcProtocol>;

    /**
     * Build a new RpcProxyFactory.
     *
     * @param target - The object to expose to RPC methods calls.  If this
     *   is omitted, the proxy won't be able to handle requests, only send them.
     */
    constructor(public target?: any, protected rpcProtocolFactory = defaultRpcProtocolFactory) {
        this.waitForConnection();
    }

    protected waitForConnection(): void {
        this.rpcDeferred = new Deferred<RpcProtocol>();
        this.rpcDeferred.promise.then(protocol => {
            protocol.channel.onClose(() => {
                this.onDidCloseConnectionEmitter.fire(undefined);
                // Wait for connection in case the backend reconnects
                this.waitForConnection();
            });
            this.onDidOpenConnectionEmitter.fire(undefined);
        });
    }

    /**
     * Connect a {@link Channel} to the factory by creating an {@link RpcProtocol} on top of it.
     *
     * This protocol will be used to send/receive RPC requests and
     * responses.
     */
    listen(channel: Channel): void {
        const protocol = this.rpcProtocolFactory(channel, (meth, args) => this.onRequest(meth, ...args));
        protocol.onNotification(event => this.onNotification(event.method, ...event.args));

        this.rpcDeferred.resolve(protocol);
    }

    /**
     * Process an incoming RPC method call.
     *
     * onRequest is called when the RPC connection received a method call
     * request.  It calls the corresponding method on [[target]].
     *
     * The return value is a Promise object that is resolved with the return
     * value of the method call, if it is successful.  The promise is rejected
     * if the called method does not exist or if it throws.
     *
     * @returns A promise of the method call completion.
     */
    protected async onRequest(method: string, ...args: any[]): Promise<any> {
        try {
            if (this.target) {
                return await this.target[method](...args);
            } else {
                throw new Error(`no target was set to handle ${method}`);
            }
        } catch (error) {
            throw this.serializeError(error);
        }
    }

    /**
     * Process an incoming RPC notification.
     *
     * Same as [[onRequest]], but called on incoming notifications rather than
     * methods calls.
     */
    protected onNotification(method: string, ...args: any[]): void {
        if (this.target) {
            this.target[method](...args);
        }
    }

    /**
     * Create a Proxy exposing the interface of an object of type T.  This Proxy
     * can be used to do RPC method calls on the remote target object as
     * if it was local.
     *
     * If `T` implements `RpcServer` then a client is used as a target object for a remote target object.
     */
    createProxy(): RpcProxy<T> {
        const result = new Proxy<T>(this as any, this);
        return result as any;
    }

    /**
     * Get a callable object that executes a RPC method call.
     *
     * Getting a property on the Proxy object returns a callable that, when
     * called, executes a RPC call.  The name of the property defines the
     * method to be called.  The callable takes a variable number of arguments,
     * which are passed in the RPC method call.
     *
     * For example, if you have a Proxy object:
     *
     *     let fooProxyFactory = RpcProxyFactory<Foo>('/foo')
     *     let fooProxy = fooProxyFactory.createProxy()
     *
     * accessing `fooProxy.bar` will return a callable that, when called,
     * executes a RPC method call to method `bar`.  Therefore, doing
     * `fooProxy.bar()` will call the `bar` method on the remote Foo object.
     *
     * @param target - unused.
     * @param p - The property accessed on the Proxy object.
     * @param receiver - unused.
     * @returns A callable that executes the RPC call.
     */
    get(target: T, p: PropertyKey, receiver: any): any {
        if (p === 'setClient') {
            return (client: any) => {
                this.target = client;
            };
        }
        if (p === 'getClient') {
            return () => this.target;
        }
        if (p === 'onDidOpenConnection') {
            return this.onDidOpenConnectionEmitter.event;
        }
        if (p === 'onDidCloseConnection') {
            return this.onDidCloseConnectionEmitter.event;
        }
        if (p === 'then') {
            // Prevent inversify from identifying this proxy as a promise object.
            return undefined;
        }
        const isNotify = this.isNotification(p);
        return (...args: any[]) => {
            const method = p.toString();
            const capturedError = new Error(`Request '${method}' failed`);
            return this.rpcDeferred.promise.then(connection =>
                new Promise<void>((resolve, reject) => {
                    try {
                        if (isNotify) {
                            connection.sendNotification(method, args);
                            resolve(undefined);
                        } else {
                            const resultPromise = connection.sendRequest(method, args) as Promise<any>;
                            resultPromise
                                .catch((err: any) => reject(this.deserializeError(capturedError, err)))
                                .then((result: any) => resolve(result));
                        }
                    } catch (err) {
                        reject(err);
                    }
                })
            );
        };
    }

    /**
     * Return whether the given property represents a notification.
     *
     * A property leads to a notification rather than a method call if its name
     * begins with `notify` or `on`.
     *
     * @param p - The property being called on the proxy.
     * @return Whether `p` represents a notification.
     */
    protected isNotification(p: PropertyKey): boolean {
        return p.toString().startsWith('notify') || p.toString().startsWith('on');
    }

    protected serializeError(e: any): any {
        if (ApplicationError.is(e)) {
            return new ResponseError(e.code, '',
                Object.assign({ kind: 'application' }, e.toJson())
            );
        }
        return e;
    }
    protected deserializeError(capturedError: Error, e: any): any {
        if (e instanceof ResponseError) {
            const capturedStack = capturedError.stack || '';
            if (e.data && e.data.kind === 'application') {
                const { stack, data, message } = e.data;
                return ApplicationError.fromJson(e.code, {
                    message: message || capturedError.message,
                    data,
                    stack: `${capturedStack}\nCaused by: ${stack}`
                });
            }
            e.stack = capturedStack;
        }
        return e;
    }

}

/**
 * @deprecated since 1.39.0 use `RpcConnectionEventEmitter` instead
 */
export type JsonRpcConnectionEventEmitter = RpcConnectionEventEmitter;

/**
 * @deprecated since 1.39.0 use `RpcServer` instead
 */
export type JsonRpcServer<Client> = RpcServer<Client>;

/**
 * @deprecated since 1.39.0 use `RpcProxy` instead
 */
export type JsonRpcProxy<T> = RpcProxy<T>;

/**
 * @deprecated since 1.39.0 use `RpcConnectionHandler` instead
 */
export class JsonRpcConnectionHandler<T extends object> extends RpcConnectionHandler<T> {

}

/**
 * @deprecated since 1.39.0 use `RpcProxyFactory` instead
 */
export class JsonRpcProxyFactory<T extends object> extends RpcProxyFactory<T> {

}

// eslint-disable-next-line deprecation/deprecation
decorate(injectable(), JsonRpcProxyFactory);
// eslint-disable-next-line deprecation/deprecation
decorate(unmanaged(), JsonRpcProxyFactory, 0);

