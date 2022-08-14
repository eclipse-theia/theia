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
import { ApplicationError } from './application-error';
import { CancellationToken } from './cancellation';
import { Connection, MessageTransformer } from './connection';
import { Disposable } from './disposable';
import { Event } from './event';
import { RpcConnection } from './rpc';
import { serviceIdentifier } from './types';

export const JsonRpc = serviceIdentifier<JsonRpc>('JsonRpc');
export interface JsonRpc {
    createMessageConnection(connection: Connection<jsonrpc.Message>): jsonrpc.MessageConnection
    createRpcConnection(messageConnection: jsonrpc.MessageConnection): RpcConnection
}

export class DefaultJsonRpc implements JsonRpc {

    createMessageConnection(connection: Connection<jsonrpc.Message>): jsonrpc.MessageConnection {
        const reader = this.createReader(connection);
        const writer = this.createWriter(connection);
        const messageConnection = jsonrpc.createMessageConnection(reader, writer);
        messageConnection.onClose(() => messageConnection.dispose());
        return messageConnection;
    }

    createRpcConnection(messageConnection: jsonrpc.MessageConnection): RpcConnection {
        return new JsonRpcConnection(messageConnection);
    }

    protected createReader(connection: Connection<jsonrpc.Message>): jsonrpc.MessageReader {
        return {
            dispose: () => { },
            listen: callback => connection.onMessage(message => callback(message)),
            onClose: callback => connection.onClose(() => callback()),
            onError: callback => connection.onError(error => callback(error)),
            onPartialMessage: callback => Disposable.NULL,
        };
    }

    protected createWriter(connection: Connection<jsonrpc.Message>): jsonrpc.MessageWriter {
        return {
            dispose: () => { },
            onClose: callback => connection.onClose(() => callback()),
            onError: callback => connection.onError(error => callback([error, undefined, undefined])),
            write: async message => connection.sendMessage(message),
            end: () => { }
        };
    }
}

export class JsonRpcConnection implements RpcConnection {

    constructor(
        protected messageConnection: jsonrpc.MessageConnection
    ) {
        this.messageConnection.onClose(() => this.messageConnection.dispose());
        this.messageConnection.listen();
    }

    get onClose(): Event<void> {
        return this.messageConnection.onClose;
    }

    handleNotification(handler: (method: string, params: any[]) => void): void {
        this.messageConnection.onNotification((method, params) => {
            if (!params) {
                handler(method, []);
            } else if (Array.isArray(params)) {
                handler(method, params);
            } else {
                throw new TypeError('this handler expects params to be an array, got an object');
            }
        });
    }

    handleRequest(handler: (method: string, params: any[], token: CancellationToken) => any): void {
        this.messageConnection.onRequest((method, params, token) => {
            if (!params) {
                return this.call(handler, method, [], token);
            } else if (Array.isArray(params)) {
                return this.call(handler, method, params, token);
            } else {
                throw new jsonrpc.ResponseError(jsonrpc.ErrorCodes.InvalidParams, 'this handler expects params to be an array, got an object');
            }
        });
    }

    sendNotification(method: string, params: any[]): void {
        this.messageConnection.sendNotification(method, jsonrpc.ParameterStructures.byPosition, ...params);
    }

    async sendRequest<T>(method: string, params: any[]): Promise<T> {
        const { stack } = new Error();
        try {
            return await this.messageConnection.sendRequest(method, jsonrpc.ParameterStructures.byPosition, ...params);
        } catch (error) {
            if (stack) {
                error.stack ??= 'Stackless Error...';
                error.stack += `\n[concatenated stack] ${stack}`;
            }
            throw this.deserializeError(error);
        }
    }

    close(): void {
        this.messageConnection.end();
    }

    protected async call<T extends any[]>(func: (...params: T) => any, ...args: T): Promise<any> {
        try {
            return await func.apply(undefined, args);
        } catch (error) {
            throw this.serializeError(error);
        }
    }

    protected serializeError(error: any): any {
        if (ApplicationError.is(error)) {
            const { code, data, message } = error;
            return new jsonrpc.ResponseError(code, message, ['ApplicationError', data]);
        }
        return error;
    }

    protected deserializeError(error: any): any {
        if (error instanceof jsonrpc.ResponseError) {
            const { code, data, message, stack } = error;
            if (Array.isArray(data) && data[0] === 'ApplicationError') {
                return ApplicationError.fromJson(code, { data: data[1], message, stack });
            }
        }
        return error;
    }
}

/**
 * Removes/Adds the redundant `jsonrpc` field from the connection messages.
 */
export const JsonRpcMessageShortener: MessageTransformer<Omit<jsonrpc.Message, 'jsonrpc'>, jsonrpc.Message> = {
    decode: (message, emit) => emit({ jsonrpc: '2.0', ...message }),
    encode: ({ jsonrpc: _, ...rest }, write) => write(rest)
};
