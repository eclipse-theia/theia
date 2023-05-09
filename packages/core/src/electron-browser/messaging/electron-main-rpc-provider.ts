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

import { injectable } from 'inversify';
import { CancellationToken, cancelled, RpcClient, RpcHandler, RpcProvider } from '../../common';
import { Deferred } from '../../common/promise-util';

/**
 * @internal
 */
@injectable()
export class ElectronMainRpcProvider implements RpcProvider {

    protected handles = new Map<string, { client: RpcClient, handler?: RpcHandler }>();

    getRpcClient(proxyId: string): RpcClient {
        throw new TypeError('not implemented');
    }

    getRpcHandler(proxyId: string): RpcHandler {
        throw new TypeError('not implemented');
    }

    protected handleNotification(event: MessageEvent, message: { proxyId: string, method: string, params: unknown[] }): void {
        this.handles.get(message.proxyId)?.rpc.notificationHandler?.(message.method, message.params);
    }

    protected handleResponse(event: MessageEvent, message: { proxyId: string, requestId: number, error?: Error, result?: unknown }): void {
        const cached = this.handles.get(message.proxyId);
        if (!cached) {
            throw new Error(`unknown proxyId: "${message.proxyId}"`);
        }
        const request = cached.rpc.requests.get(message.requestId);
        if (!request) {
            throw new Error(`unknown requestId: ${message.requestId}`);
        }
        if (message.error) {
            request.reject(message.error);
        } else {
            request.resolve(message.result);
        }
    }
}

/**
 * @internal
 */
export class ElectronMainRpcImpl implements RpcClient, RpcHandler {

    requests = new Map<number, Deferred<unknown>>();

    notificationHandler?: (method: string, params: unknown[]) => void;

    protected requestId = 0;

    constructor(
        protected proxyId: string,
        protected rpcMain: ElectronMainRpcProtocol
    ) { }

    handleNotification(handler: (method: string, params: unknown[]) => void): void {
        this.notificationHandler = handler;
    }

    sendNotification(method: string, params: unknown[]): void {
        this.rpcMain.sendNotification({ proxyId: this.proxyId, method, params });
    }

    async sendRequest(method: string, params: unknown[], token?: CancellationToken): Promise<unknown> {
        if (token?.isCancellationRequested) {
            throw cancelled();
        }
        const request = new Deferred<unknown>();
        const requestId = this.requestId++;
        this.requests.set(requestId, request);
        this.rpcMain.sendRequest({ proxyId: this.proxyId, requestId, method, params });
        token?.onCancellationRequested(() => {
            if (request.state === 'unresolved') {
                request.reject(cancelled());
                this.rpcMain.sendCancel({ proxyId: this.proxyId, requestId });
            }
        });
        return request.promise;
    }

    sendRequestSync(method: string, params: unknown[]): unknown {
        return this.rpcMain.sendRequestSync({ proxyId: this.proxyId, method, params });
    }
}
