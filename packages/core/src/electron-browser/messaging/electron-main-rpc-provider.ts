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

import { inject, injectable } from 'inversify';
import {
    ELECTRON_MAIN_RPC_IPC as ipc, TheiaIpcWindow, RpcResponseMessage, RpcNotificationMessage, RpcRequestMessage, ElectronRpcSync, RpcCancelMessage
} from '../../electron-common';
import { ChannelHandler, ChannelHandlerFactory, CancellationToken, CancellationTokenSource, cancelled, RpcClient, RpcHandler, RpcProvider, ChannelDescriptor } from '../../common';
import { Deferred } from '../../common/promise-util';

/**
 * @internal
 */
@injectable()
export class ElectronMainRpcProvider implements RpcProvider {

    @inject(TheiaIpcWindow)
    protected ipcWindow: TheiaIpcWindow;

    @inject(ElectronRpcSync)
    protected rpcSync: ElectronRpcSync;

    @inject(ChannelHandlerFactory)
    protected channelHandlerFactory: ChannelHandlerFactory;

    getRpc(proxyPath: string): { client: RpcClient, handler?: RpcHandler } {
        const proxyId = this.rpcSync.createProxy(proxyPath);
        const { port1, port2 } = new MessageChannel();
        this.ipcWindow.postMessage(ipc.portForward, { proxyId }, [port1]);
        const rpc = new ElectronMainRpc(this.channelHandlerFactory());
        rpc.sendRequestSync = (method, params) => this.rpcSync.requestSync(proxyId, method, params);
        rpc.listen(port2);
        return {
            client: rpc,
            handler: rpc
        };
    }
}

export class ElectronMainRpc implements RpcClient, RpcHandler {

    sendRequestSync?: (method: string, params: unknown[]) => unknown;

    #notificationHandler?: (method: string, params?: unknown[]) => void;
    #requestHandler?: (method: string, params?: unknown[], cancel?: CancellationToken) => unknown;

    #channels: ChannelHandler<MessageEvent>;
    #port: MessagePort;

    #requestId = 0;
    #requests = new Map<number, Deferred<unknown>>();
    #cancellation = new Map<number, CancellationTokenSource>();

    constructor(channels: ChannelHandler<MessageEvent>) {
        this.#channels = channels;
    }

    listen(port: MessagePort): void {
        this.#port = port;
        this.#port.addEventListener('message', event => this.#channels.handleMessage(event.data, event));
        this.#channels.on(ipc.cancel, this.#handleCancelMessage, this);
        this.#channels.on(ipc.notification, this.#handleNotificationMessage, this);
        this.#channels.on(ipc.request, this.#handleRequestMessage, this);
        this.#channels.on(ipc.response, this.#handleResponseMessage, this);
        this.#port.start();
    }

    handleNotification(handler: (method: string, params?: unknown[]) => void): void {
        this.#notificationHandler = handler;
    }

    handleRequest(handler: (method: string, params: unknown[] | undefined, cancel: CancellationToken) => unknown): void {
        this.#requestHandler = handler;
    }

    sendNotification(method: string, params?: unknown[]): void {
        this.#sendChannelMessage(ipc.notification, { method, params });
    }

    async sendRequest(method: string, params?: unknown[], cancel?: CancellationToken): Promise<unknown> {
        if (cancel?.isCancellationRequested) {
            throw cancelled();
        }
        const request = new Deferred<unknown>();
        const requestId = this.#requestId++;
        this.#requests.set(requestId, request);
        this.#sendChannelMessage(ipc.request, { requestId, method, params });
        cancel?.onCancellationRequested(() => {
            this.#sendChannelMessage(ipc.cancel, { requestId });
            request.reject(cancelled());
        });
        return request.promise.finally(() => {
            this.#requests.delete(requestId);
        });
    }

    #sendChannelMessage<T>(channel: ChannelDescriptor<(message: T) => void>, message: T): void {
        this.#port.postMessage(this.#channels.createMessage(channel, message));
    }

    #handleCancelMessage(event: MessageEvent, { requestId }: RpcCancelMessage): void {
        this.#cancellation.get(requestId)?.cancel();
    }

    #handleNotificationMessage(event: MessageEvent, { method, params }: RpcNotificationMessage): void {
        this.#notificationHandler?.(method, params);
    }

    async #handleRequestMessage(event: MessageEvent, { requestId, method, params }: RpcRequestMessage): Promise<void> {
        if (this.#requestHandler) {
            const cancel = new CancellationTokenSource();
            this.#cancellation.set(requestId, cancel);
            try {
                const result = await this.#requestHandler(method, params, cancel.token);
                this.#sendChannelMessage(ipc.response, { requestId, result });
            } catch (error) {
                this.#sendChannelMessage(ipc.response, { requestId, error });
            } finally {
                this.#cancellation.delete(requestId);
            }
        } else {
            this.#sendChannelMessage(ipc.response, { requestId, error: new Error('no handler') });
        }
    }

    #handleResponseMessage(event: MessageEvent, { requestId, error, result }: RpcResponseMessage): void {
        const request = this.#requests.get(requestId);
        if (!request) {
            throw new Error(`no request for id: ${requestId}`);
        }
        if (error) {
            request.reject(error);
        } else {
            request.resolve(result);
        }
    }
}
