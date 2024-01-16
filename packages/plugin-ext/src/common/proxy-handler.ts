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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Channel, RpcProtocol, RpcProtocolOptions } from '@theia/core/';
import { RpcMessageDecoder, RpcMessageEncoder } from '@theia/core/lib/common/message-rpc/rpc-message-encoder';
import { Deferred } from '@theia/core/lib/common/promise-util';

export interface RpcHandlerOptions {
    id: string
    encoder: RpcMessageEncoder,
    decoder: RpcMessageDecoder
}
export interface ProxyHandlerOptions extends RpcHandlerOptions {
    channelProvider: () => Promise<Channel>,
    proxySynchronizer: ProxySynchronizer,
}

export interface InvocationHandlerOptions extends RpcHandlerOptions {
    target: any
}

export interface ProxySynchronizer {
    startProxyInitialization(id: string, init: Promise<void>): void
    pendingProxyInitializations(): Promise<void>
}

/**
 * A proxy handler that will send any method invocation on the proxied object
 * as a rcp protocol message over a channel.
 */
export class ClientProxyHandler<T extends object> implements ProxyHandler<T> {
    private rpcDeferred: Deferred<RpcProtocol> = new Deferred();
    private isRpcInitialized = false;

    readonly id: string;
    private readonly channelProvider: () => Promise<Channel>;
    private readonly proxySynchronizer: ProxySynchronizer;
    private readonly encoder: RpcMessageEncoder;
    private readonly decoder: RpcMessageDecoder;

    constructor(options: ProxyHandlerOptions) {
        Object.assign(this, options);
    }

    private initializeRpc(): void {
        // we need to set the flag to true before waiting for the channel provider. Otherwise `get` might
        // get called again and we'll try to open a channel more than once
        this.proxySynchronizer.startProxyInitialization(this.id, this.rpcDeferred.promise.then(() => { }));
        this.isRpcInitialized = true;
        const clientOptions: RpcProtocolOptions = { encoder: this.encoder, decoder: this.decoder, mode: 'clientOnly' };
        this.channelProvider().then(channel => {
            const rpc = new RpcProtocol(channel, undefined, clientOptions);
            this.rpcDeferred.resolve(rpc);
        });
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
            return this.sendWhenNoInit(async (connection: RpcProtocol) => {
                if (isNotify) {
                    connection.sendNotification(method, args);
                } else {
                    return await connection.sendRequest(method, args) as Promise<any>;
                }
            });
        };
    }

    private sendWhenNoInit(send: (connection: RpcProtocol) => Promise<any>): Promise<any> {
        return this.proxySynchronizer.pendingProxyInitializations().then(() => this.rpcDeferred.promise.then(send));
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
    readonly id: string;
    readonly target: any;

    private rpcDeferred: Deferred<RpcProtocol> = new Deferred();
    private readonly encoder: RpcMessageEncoder;
    private readonly decoder: RpcMessageDecoder;

    constructor(options: InvocationHandlerOptions) {
        Object.assign(this, options);
    }

    listen(channel: Channel): void {
        const serverOptions: RpcProtocolOptions = { encoder: this.encoder, decoder: this.decoder, mode: 'serverOnly' };
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

