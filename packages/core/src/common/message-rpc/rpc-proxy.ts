/********************************************************************************
 * Copyright (C) 2021 Red Hat, Inc. and others.
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
import { Deferred } from '../promise-util';
import { Channel } from './channel';
import { RpcClient, RPCServer } from './rpc-protocol';

/**
 * A proxy handler that will send any method invocation on the proxied object
 * as a rcp protocol message over a channel.
 */
export class RpcProxyHandler<T extends object> implements ProxyHandler<T> {
    private channelDeferred: Deferred<RpcClient> = new Deferred();

    onChannelOpen(channel: Channel): void {
        const client = new RpcClient(channel);
        this.channelDeferred.resolve(client);
    }

    get?(target: T, p: string | symbol, receiver: any): any {
        const isNotify = this.isNotification(p);
        return (...args: any[]) => {
            const method = p.toString();
            return this.channelDeferred.promise.then((connection: RpcClient) =>
                new Promise((resolve, reject) => {
                    try {
                        if (isNotify) {
                            // console.info(`Send notification ${method}`);
                            connection.sendNotification(method, args);
                            resolve(undefined);
                        } else {
                            // console.info(`Send request ${method}`);
                            const resultPromise = connection.sendRequest(method, args) as Promise<any>;
                            resultPromise.then((result: any) => {
                                // console.info(`request succeeded: ${method}`);
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
     * the promise returned from the invocation will resolve immediatey to `undefined`
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
}

export class RpcHandler {
    constructor(readonly target: any) {
    }

    onChannelOpen(channel: Channel): void {
        const server = new RPCServer(channel, (method: string, args: any[]) => this.handleRequest(method, args));
        server.onNotification((e: { method: string, args: any }) => this.onNotification(e.method, e.args));
    }

    protected async handleRequest(method: string, args: any[]): Promise<any> {
        return this.target[method](...args);
    }

    protected onNotification(method: string, args: any[]): void {
        this.target[method](args);
    }
}
