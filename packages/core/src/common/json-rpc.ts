// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import * as jsonrpc from 'vscode-jsonrpc';
import { CancellationToken } from './cancellation';
import { Disposable } from './disposable';
import { RpcConnection } from './rpc';
import { Connection } from './connection';
import { serviceIdentifier } from './types';

/**
 * Create a `RpcConnection` from a `Connection` using the JSON-RPC protocol.
 */
export const JsonRpcConnectionFactory = serviceIdentifier<JsonRpcConnectionFactory>('JsonRpcConnectionFactory');
export type JsonRpcConnectionFactory = (connection: Connection<jsonrpc.Message>) => RpcConnection;

export class JsonRpcConnection implements RpcConnection {

    protected messageConnection: jsonrpc.MessageConnection;

    constructor(connection: Connection<jsonrpc.Message>) {
        const reader = this.createReader(connection);
        const writer = this.createWriter(connection);
        this.messageConnection = jsonrpc.createMessageConnection(reader, writer);
    }

    onClose(handler: () => void, thisArg: unknown): Disposable {
        return this.messageConnection.onClose(handler, thisArg);
    }

    onNotification(handler: (method: string, params: any[]) => void): void {
        this.messageConnection.onNotification(handler);
    }

    onRequest(handler: (method: string, params: any[], token: CancellationToken) => any): void {
        this.messageConnection.onRequest(handler);
    }

    sendNotification(method: string, params: any[]): void {
        this.messageConnection.sendNotification(method, jsonrpc.ParameterStructures.byPosition, ...params);
    }

    sendRequest<T>(method: string, params: any[]): Promise<T> {
        return this.messageConnection.sendRequest(method, jsonrpc.ParameterStructures.byPosition, ...params);
    }

    protected createReader(connection: Connection<jsonrpc.Message>): jsonrpc.MessageReader {
        return {
            dispose: () => { },
            listen: callback => connection.onMessage(message => callback(message as jsonrpc.Message)),
            onClose: listener => connection.onClose(() => listener()),
            onError: () => Disposable.NULL,
            onPartialMessage: () => Disposable.NULL,
        };
    }

    protected createWriter(connection: Connection<jsonrpc.Message>): jsonrpc.MessageWriter {
        return {
            dispose: () => { },
            onClose: listener => connection.onClose(() => listener()),
            onError: () => Disposable.NULL,
            write: async message => connection.sendMessage(message),
            end: () => { }
        };
    }
}
