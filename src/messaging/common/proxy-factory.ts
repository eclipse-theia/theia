/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { DisposableCollection } from '../../application/common';
import { ConnectionHandler } from './handler';
import { MessageConnection } from "vscode-jsonrpc";

export class JsonRpcProxyFactory<T extends object> implements ConnectionHandler, ProxyHandler<T> {

    protected readonly connectionListeners = new DisposableCollection();

    constructor(readonly path: string, private readonly target?: any) {}

    onConnection(connection: MessageConnection) {
        this.connectionListeners.dispose();
        connection.onError( error => {
            console.error(error)
        })
        let disposed = false;
        this.connectionListeners.push({
            dispose() {
                disposed = true;
            }
        });
        if (this.target) {
            for (let prop in this.target) {
                if (typeof this.target[prop] === 'function') {
                    connection.onRequest(prop, (...args) => this.onRequest(prop, ...args));
                    connection.onNotification(prop, (...args) => this.onNotification(prop, ...args));
                }
            }
        }
        connection.onDispose(() => {
            this.connectionListeners.dispose();
            this.connectionPromise = new Promise(resolve => {this.connectionPromiseResolve = resolve});
        });
        connection.listen();
        this.connectionPromiseResolve(connection);
    }

    private connectionPromiseResolve: (connection: MessageConnection) => void;
    private connectionPromise: Promise<MessageConnection> = new Promise(resolve => {this.connectionPromiseResolve = resolve})

    protected onRequest(method: string, ...args: any[]): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            try {
                let promise = this.target[method](...args) as Promise<any>
                promise
                    .catch( err => reject(err))
                    .then( result => resolve(result))
            } catch (err) {
                reject(err)
            }
        })
    }

    protected onNotification(method: string, ...args: any[]): void {
        this.target[method](...args)
    }

    createProxy(): T {
        const result = new Proxy<T>(this as any, this)
        return result as any
    }

    get(target: T, p: PropertyKey, receiver: any): any {
        const isNotify = this.isNotification(p)
        return (...args: any[]) => {
            return this.connectionPromise.then( connection => {
                return new Promise((resolve, reject) => {
                    try {
                        if (isNotify) {
                            connection.sendNotification(p.toString(), ...args)
                            resolve();
                        } else {
                            const resultPromise = connection.sendRequest(p.toString(), ...args) as Promise<any>
                            resultPromise
                                .catch((err: any) => reject(err))
                                .then((result: any) => resolve(result))
                        }
                    } catch (err) {
                        reject(err)
                    }
                })
            })
        }
    }

    protected isNotification(p: PropertyKey): boolean {
        return p.toString().startsWith("notify")
    }
}
