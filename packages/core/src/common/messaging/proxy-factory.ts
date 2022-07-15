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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { ResponseError } from '../message-rpc/rpc-message-encoder';
import { ApplicationError } from '../application-error';
import { Disposable } from '../disposable';
import { Emitter, Event } from '../event';
import { Channel } from '../message-rpc/channel';
import { RequestHandler, RpcProtocol } from '../message-rpc/rpc-protocol';
import { ConnectionHandler } from './handler';

export type JsonRpcServer<Client> = Disposable & {
    /**
     * If this server is a proxy to a remote server then
     * a client is used as a local object
     * to handle JSON-RPC messages from the remote server.
     */
    setClient(client: Client | undefined): void;
    getClient?(): Client | undefined;
};

export interface JsonRpcConnectionEventEmitter {
    readonly onDidOpenConnection: Event<void>;
    readonly onDidCloseConnection: Event<void>;
}
export type JsonRpcProxy<T> = T & JsonRpcConnectionEventEmitter;

export class JsonRpcConnectionHandler<T extends object> implements ConnectionHandler {
    constructor(
        readonly path: string,
        readonly targetFactory: (proxy: JsonRpcProxy<T>) => any,
        readonly factoryConstructor: new () => JsonRpcProxyFactory<T> = JsonRpcProxyFactory
    ) { }

    onConnection(connection: Channel): void {
        const factory = new this.factoryConstructor();
        const proxy = factory.createProxy();
        factory.target = this.targetFactory(proxy);
        factory.listen(connection);
    }
}
/**
 * Factory for creating a new {@link RpcConnection} for a given chanel and {@link RequestHandler}.
 */
export type RpcConnectionFactory = (channel: Channel, requestHandler: RequestHandler) => RpcProtocol;

const defaultRPCConnectionFactory: RpcConnectionFactory = (channel, requestHandler) => new RpcProtocol(channel, requestHandler);

/**
 * Factory for JSON-RPC proxy objects.
 *
 * A JSON-RPC proxy exposes the programmatic interface of an object through
 * JSON-RPC.  This allows remote programs to call methods of this objects by
 * sending JSON-RPC requests.  This takes place over a bi-directional stream,
 * where both ends can expose an object and both can call methods each other's
 * exposed object.
 *
 * For example, assuming we have an object of the following type on one end:
 *
 *     class Foo {
 *         bar(baz: number): number { return baz + 1 }
 *     }
 *
 * which we want to expose through a JSON-RPC interface.  We would do:
 *
 *     let target = new Foo()
 *     let factory = new JsonRpcProxyFactory<Foo>('/foo', target)
 *     factory.onConnection(connection)
 *
 * The party at the other end of the `connection`, in order to remotely call
 * methods on this object would do:
 *
 *     let factory = new JsonRpcProxyFactory<Foo>('/foo')
 *     factory.onConnection(connection)
 *     let proxy = factory.createProxy();
 *     let result = proxy.bar(42)
 *     // result is equal to 43
 *
 * One the wire, it would look like this:
 *
 *     --> {"jsonrpc": "2.0", "id": 0, "method": "bar", "params": {"baz": 42}}
 *     <-- {"jsonrpc": "2.0", "id": 0, "result": 43}
 *
 * Note that in the code of the caller, we didn't pass a target object to
 * JsonRpcProxyFactory, because we don't want/need to expose an object.
 * If we had passed a target object, the other side could've called methods on
 * it.
 *
 * @param <T> - The type of the object to expose to JSON-RPC.
 */

export class JsonRpcProxyFactory<T extends object> implements ProxyHandler<T> {

    protected readonly onDidOpenConnectionEmitter = new Emitter<void>();
    protected readonly onDidCloseConnectionEmitter = new Emitter<void>();

    protected connectionPromiseResolve: (connection: RpcProtocol) => void;
    protected connectionPromise: Promise<RpcProtocol>;

    /**
     * Build a new JsonRpcProxyFactory.
     *
     * @param target - The object to expose to JSON-RPC methods calls.  If this
     *   is omitted, the proxy won't be able to handle requests, only send them.
     */
    constructor(public target?: any, protected rpcConnectionFactory = defaultRPCConnectionFactory) {
        this.waitForConnection();
    }

    protected waitForConnection(): void {
        this.connectionPromise = new Promise(resolve =>
            this.connectionPromiseResolve = resolve
        );
        this.connectionPromise.then(connection => {
            connection.channel.onClose(() => {
                this.onDidCloseConnectionEmitter.fire(undefined);
                // Wait for connection in case the backend reconnects
                this.waitForConnection();
            });
            this.onDidOpenConnectionEmitter.fire(undefined);
        });
    }

    /**
     * Connect a MessageConnection to the factory.
     *
     * This connection will be used to send/receive JSON-RPC requests and
     * response.
     */
    listen(channel: Channel): void {
        const connection = this.rpcConnectionFactory(channel, (meth, args) => this.onRequest(meth, ...args));
        connection.onNotification(event => this.onNotification(event.method, ...event.args));

        this.connectionPromiseResolve(connection);
    }

    /**
     * Process an incoming JSON-RPC method call.
     *
     * onRequest is called when the JSON-RPC connection received a method call
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
            const e = this.serializeError(error);
            if (e instanceof ResponseError) {
                throw e;
            }
            const reason = e.message || '';
            const stack = e.stack || '';
            console.error(`Request ${method} failed with error: ${reason}`, stack);
            throw e;
        }
    }

    /**
     * Process an incoming JSON-RPC notification.
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
     * can be used to do JSON-RPC method calls on the remote target object as
     * if it was local.
     *
     * If `T` implements `JsonRpcServer` then a client is used as a target object for a remote target object.
     */
    createProxy(): JsonRpcProxy<T> {
        const result = new Proxy<T>(this as any, this);
        return result as any;
    }

    /**
     * Get a callable object that executes a JSON-RPC method call.
     *
     * Getting a property on the Proxy object returns a callable that, when
     * called, executes a JSON-RPC call.  The name of the property defines the
     * method to be called.  The callable takes a variable number of arguments,
     * which are passed in the JSON-RPC method call.
     *
     * For example, if you have a Proxy object:
     *
     *     let fooProxyFactory = JsonRpcProxyFactory<Foo>('/foo')
     *     let fooProxy = fooProxyFactory.createProxy()
     *
     * accessing `fooProxy.bar` will return a callable that, when called,
     * executes a JSON-RPC method call to method `bar`.  Therefore, doing
     * `fooProxy.bar()` will call the `bar` method on the remote Foo object.
     *
     * @param target - unused.
     * @param p - The property accessed on the Proxy object.
     * @param receiver - unused.
     * @returns A callable that executes the JSON-RPC call.
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
        const isNotify = this.isNotification(p);
        return (...args: any[]) => {
            const method = p.toString();
            const capturedError = new Error(`Request '${method}' failed`);
            return this.connectionPromise.then(connection =>
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

