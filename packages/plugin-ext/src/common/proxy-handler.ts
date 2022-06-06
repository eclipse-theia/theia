/********************************************************************************
 * Copyright (C) 2022 STMicroelectronics and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Channel, MaybePromise, RpcProtocol, RpcProtocolOptions } from '@theia/core/';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { RpcMessageDecoder, RpcMessageEncoder } from '@theia/core/lib/common/message-rpc/rpc-message-encoder';

export interface RpcMessageCodec {
    encoder: RpcMessageEncoder,
    decoder: RpcMessageDecoder
}
/**
 * A proxy handler that will send any method invocation on the proxied object
 * as a rcp protocol message over a channel.
 */
export class ClientProxyHandler<T extends object> implements ProxyHandler<T> {
    private rpcDeferred: Deferred<RpcProtocol> = new Deferred();
    private isRpcInitialized = false;

    constructor(protected readonly id: string, protected readonly codec: RpcMessageCodec, protected readonly channelProvider: () => MaybePromise<Channel>) { }

    private async initializeRpc(): Promise<void> {
        const clientOptions: RpcProtocolOptions = { ...this.codec, mode: 'clientOnly' };
        const channel = await this.channelProvider();
        const rpc = new RpcProtocol(channel, undefined, clientOptions);
        this.rpcDeferred.resolve(rpc);
        this.isRpcInitialized = true;
    }

    get(target: any, name: string, receiver: any): any {
        if (!this.isRpcInitialized) {
            this.initializeRpc();
        }

        if (target[name] || name.charCodeAt(0) !== 36 /* CharCode.DollarSign */) {
            return target[name];
        }
        const isNotify = this.isNotification(name);
        return (...args: any[]) => {
            const method = name.toString();
            return this.rpcDeferred.promise.then((connection: RpcProtocol) =>
                new Promise((resolve, reject) => {
                    try {
                        if (isNotify) {
                            connection.sendNotification(method, args);
                            resolve(undefined);
                        } else {
                            const resultPromise = connection.sendRequest(method, args) as Promise<any>;
                            resultPromise.then((result: any) => {
                                resolve(result);
                            }).catch(e => {
                                reject(e);
                            });
                        }
                    } catch (err) {
                        reject(err);
                    }
                })
            );
        };
    }

    /**
     * Return whether the given property represents a notification. If true,
     * the promise returned from the invocation will resolve immediately to `undefined`
     *
     * A property leads to a notification rather than a method call if its name
     * begins with `notify` or `on`.
     *
     * @param p - The property being called on the proxy.
     * @return Whether `p` represents a notification.
     */
    protected isNotification(p: PropertyKey): boolean {
        let propertyString = p.toString();
        if (propertyString.charCodeAt(0) === 36/* CharCode.DollarSign */) {
            propertyString = propertyString.substring(1);
        }
        return propertyString.startsWith('notify') || propertyString.startsWith('on');
    }
}

export class RpcInvocationHandler {
    private rpcDeferred: Deferred<RpcProtocol> = new Deferred();

    constructor(readonly id: string, readonly target: any, protected readonly codec: RpcMessageCodec) {
    }

    listen(channel: Channel): void {
        const serverOptions: RpcProtocolOptions = { ...this.codec, mode: 'serverOnly' };
        const server = new RpcProtocol(channel, (method: string, args: any[]) => this.handleRequest(method, args), serverOptions);
        server.onNotification((e: { method: string, args: any }) => this.onNotification(e.method, e.args));
        this.rpcDeferred.resolve(server);
    }

    protected handleRequest(method: string, args: any[]): Promise<any> {
        return this.rpcDeferred.promise.then(() => this.target[method](...args));
    }

    protected onNotification(method: string, args: any[]): void {
        this.target[method](...args);
    }
}

