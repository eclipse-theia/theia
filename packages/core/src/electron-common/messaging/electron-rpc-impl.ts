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

// eslint-disable-next-line max-len
import { CancellationToken, CancellationTokenSource, ChannelDescriptor, ChannelHandler, PostMessage, RpcCancelMessage, RpcClient, RpcHandler, RpcNotificationMessage, RpcRequestMessage, RpcResponseMessage, cancelled, THEIA_RPC_CHANNELS as ipc } from '../../common';
import { Deferred } from '../../common/promise-util';

export class ElectronRpcImpl implements RpcClient, RpcHandler {

    /**
     * Field to be set from outside if supported.
     */
    sendRequestSync?: (method: string, params: unknown[]) => unknown;

    #notificationHandler?: (method: string, params?: unknown[]) => void;
    #requestHandler?: (method: string, params?: unknown[], cancel?: CancellationToken) => unknown;

    #channels: ChannelHandler<void>;
    #port: PostMessage;

    #requestId = 0;
    #requests = new Map<number, Deferred<unknown>>();
    #cancellation = new Map<number, CancellationTokenSource>();
    #disposed = false;

    constructor(port: PostMessage, channels: ChannelHandler<void>) {
        this.#port = port;
        this.#channels = channels;
        this.#channels.on(ipc.cancel, this.#handleCancelMessage, this);
        this.#channels.on(ipc.notification, this.#handleNotificationMessage, this);
        this.#channels.on(ipc.request, this.#handleRequestMessage, this);
        this.#channels.on(ipc.response, this.#handleResponseMessage, this);
    }

    handleNotification(handler: (method: string, params?: unknown[]) => void): void {
        this.#ensureNotDisposed();
        this.#notificationHandler = handler;
    }

    handleRequest(handler: (method: string, params: unknown[] | undefined, cancel: CancellationToken) => unknown): void {
        this.#ensureNotDisposed();
        this.#requestHandler = handler;
    }

    sendNotification(method: string, params?: unknown[]): void {
        this.#ensureNotDisposed();
        this.#sendChannelMessage(ipc.notification, { method, params });
    }

    async sendRequest(method: string, params?: unknown[], cancel?: CancellationToken): Promise<unknown> {
        this.#ensureNotDisposed();
        if (cancel?.isCancellationRequested) {
            throw cancelled();
        }
        const request = new Deferred<unknown>();
        const requestId = this.#requestId++;
        this.#requests.set(requestId, request);
        this.#sendChannelMessage(ipc.request, { requestId, method, params });
        const cancellation = cancel?.onCancellationRequested(() => {
            this.#sendChannelMessage(ipc.cancel, { requestId });
            request.reject(cancelled());
        });
        return request.promise.finally(() => {
            this.#requests.delete(requestId);
            cancellation?.dispose();
        });
    }

    dispose(): void {
        if (this.#disposed) {
            return;
        }
        this.#disposed = true;
        this.#channels.dispose();
        // Keep the field undefined if it already is:
        if (this.sendRequestSync) {
            this.sendRequestSync = () => this.#ensureNotDisposed();
        }
        this.#notificationHandler = undefined;
        this.#requestHandler = undefined;
        this.#cancellation.forEach(source => source.cancel());
        this.#cancellation.clear();
        this.#requests.clear();
    }

    #ensureNotDisposed(): void {
        if (this.#disposed) {
            throw new Error('this instance is disposed');
        }
    }

    #sendChannelMessage<T>(channel: ChannelDescriptor<(message: T) => void>, message: T): void {
        this.#port.postMessage(this.#channels.createMessage(channel, message));
    }

    #handleCancelMessage(event: void, { requestId }: RpcCancelMessage): void {
        this.#cancellation.get(requestId)?.cancel();
    }

    #handleNotificationMessage(event: void, { method, params }: RpcNotificationMessage): void {
        this.#notificationHandler?.(method, params);
    }

    async #handleRequestMessage(event: void, { requestId, method, params }: RpcRequestMessage): Promise<void> {
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

    #handleResponseMessage(event: void, { requestId, error, result }: RpcResponseMessage): void {
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
