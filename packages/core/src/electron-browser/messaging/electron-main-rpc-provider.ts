// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import { TheiaIpcWindow } from '../../electron-common';
import * as ipc from '../../electron-common/electron-proxying';
import { CancellationToken, CancellationTokenSource, cancelled, RpcClient, RpcHandler, RpcProvider } from '../../common';
import { Deferred } from '../../common/promise-util';

/**
 * @internal
 */
@injectable()
export class ElectronMainRpcProvider implements RpcProvider {

    protected requestId = 0;
    protected requests = new Map<number, Deferred<void>>();
    // protected handles = new Map<string, { port: MessagePort, client: RpcClient, handler?: RpcHandler }>();

    @inject(TheiaIpcWindow)
    protected ipcWindow: TheiaIpcWindow;

    @postConstruct()
    protected init(): void {
        this.ipcWindow.on(ipc.ELECTRON_PROXYING_IPC.notification, this.handleNotification, this);
        this.ipcWindow.on(ipc.ELECTRON_PROXYING_IPC.response, this.handleResponse, this);
    }

    getRpcClient(proxyId: string): RpcClient {
        const request = new Deferred<void>();
        const requestId = this.requestId++;
        this.requests.set(requestId, request);
        const { port1, port2 } = new MessageChannel();
        request.promise.then(() => port2.start());
        this.ipcWindow.postMessage(origin, ipc.ELECTRON_PROXYING_IPC.create, { proxyId, requestId }, [port1]);
        return new ElectronMainRpc(port2);
    }

    getRpcHandler(proxyId: string): RpcHandler {
        throw new TypeError('not implemented');
    }

    protected handleNotification(event: MessageEvent, message: { proxyId: string, method: string, params: unknown[] }): void {
        // this.handles.get(message.proxyId)?.rpc.notificationHandler?.(message.method, message.params);
    }

    protected handleResponse(event: MessageEvent, message: { proxyId: string, requestId: number, error?: Error, result?: unknown }): void {
        const request = this.requests.get(message.requestId);
        if (!request) {
            return;
        }
        this.requests.delete(message.requestId);
        if (message.error) {
            request.reject(message.error);
        } else {
            request.resolve();
        }
    }
}

export class ElectronMainRpc implements RpcClient, RpcHandler {

    sendRequestSync?: (method: string, params: unknown[]) => unknown

    #port: MessagePort
    #requestId = 0;
    #requests = new Map<number, Deferred<unknown>>();
    #cancellation = new Map<number, CancellationTokenSource>();
    #notificationHandler?: (method: string, params: unknown[]) => void;
    #requestHandler?: (method: string, params: unknown[], cancel?: CancellationToken) => unknown;

    constructor(port: MessagePort) {
        this.#port = port;
        this.#port.addEventListener('message', event => this.#handleMessage(event));
    }

    handleNotification(handler: (method: string, params?: unknown[] | undefined) => void): void {
        this.#notificationHandler = handler;
    }

    handleRequest(handler: (method: string, params: unknown[] | undefined, cancel: CancellationToken) => unknown): void {
        this.#requestHandler = handler;
    }

    sendNotification(method: string, params?: unknown[] | undefined): void {
        this.#port.postMessage(['notification', { method, params }]);
    }

    async sendRequest(method: string, params?: unknown[] | undefined, cancel?: CancellationToken | undefined): Promise<unknown> {
        if (cancel?.isCancellationRequested) {
            throw cancelled();
        }
        const request = new Deferred<unknown>();
        const requestId = this.#requestId++;
        this.#requests.set(requestId, request);
        this.#port.postMessage(['request', { requestId, method, params }]);
        cancel?.onCancellationRequested(() => {
            this.#port.postMessage(['cancel', { requestId }]);
            request.reject(cancelled());
        })
        return request.promise.finally(() => {
            this.#requests.delete(requestId)
        });
    }

    #handleMessage(event: MessageEvent): void {
        if (!Array.isArray(event.data)) {
            throw new TypeError();
        }
        const [type, message] = event.data;
        if (typeof type !== 'string' || typeof message !== 'object' || message === null) {
            throw new TypeError();
        }
        switch (type) {
            case 'notification': return this.#handleNotification(message);
            case 'request': return this.#handleRequest(message);
            case 'response': return this.#handleResponse(message);
        }
        throw new TypeError();
    }

    #handleNotification(message: ipc.Notification): void {
        this.#notificationHandler?.(message.method, message.params);
    }

    #handleRequest(message: ipc.Request): void {
        if (this.#requestHandler) {
            const cancel = new CancellationTokenSource();
            this.#cancellation.set(message.requestId, cancel);
            Promise.resolve(this.#requestHandler(message.method, message.params, cancel.token)).then(
                result => this.#port.postMessage(['response', { requestId: message.requestId, result }]),
                error => this.#port.postMessage(['response', { requestId: message.requestId, error }])
            ).finally(() => {
                this.#cancellation.delete(message.requestId);
            });
        } else {
            this.#port.postMessage(['response', { requestId: message.requestId, error: new Error('no handler') }]);
        }
    }

    #handleResponse(message: ipc.Response): void {
        const request = this.#requests.get(message.requestId);
        if (!request) {
            throw new Error();
        }
        if (message.error) {
            request.reject(message.error);
        } else {
            request.resolve(message.result);
        }
    }
}
