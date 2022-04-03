// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// copied from https://github.com/Microsoft/vscode/blob/master/src/vs/workbench/services/extensions/node/rpcProtocol.ts
// with small modifications

/* eslint-disable @typescript-eslint/no-explicit-any */

import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { URI as VSCodeURI } from '@theia/core/shared/vscode-uri';
import URI from '@theia/core/lib/common/uri';
import { Range } from '../plugin/types-impl';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { AnyConnection } from '@theia/core/lib/common/connection';
import { ConnectionMultiplexer, DefaultConnectionMultiplexer } from '@theia/core/lib/common/connection-multiplexer';
import { DefaultRouter } from '@theia/core/lib/common/routing';
import { DefaultJsonRpc, JsonRpc } from '@theia/core/lib/common/json-rpc';
import { RpcConnection } from '@theia/core/lib/common/rpc';
import { TransformedConnection } from '@theia/core/lib/common/connection-transformer';

export const PluginRpc = Symbol('PluginRpc');
export interface PluginRpc extends Disposable {

    /**
     * Returns a proxy to an object addressable/named in the plugin process or in the main process.
     */
    getProxy<T>(proxyId: ProxyIdentifier<T>): T;

    /**
     * Register manually created instance.
     */
    set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R;
}

/**
 * @deprecated since 1.27.0 use {@link PluginRpc} instead.
 */
export const RPCProtocol = PluginRpc;
export type RPCProtocol = PluginRpc;

export class ProxyIdentifier<T> {

    /** static only */
    protected T?: T;

    constructor(
        readonly isMain: boolean,
        readonly id: string
    ) { }
}

export function createProxyIdentifier<T>(identifier: string): ProxyIdentifier<T> {
    return new ProxyIdentifier(false, identifier);
}

export interface ConnectionClosedError extends Error {
    code: 'RPC_PROTOCOL_CLOSED'
}
export namespace ConnectionClosedError {

    const code: ConnectionClosedError['code'] = 'RPC_PROTOCOL_CLOSED';

    export function create(message: string = 'connection is closed'): ConnectionClosedError {
        return Object.assign(new Error(message), { code });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is(error: any): error is ConnectionClosedError {
        return !!error && typeof error === 'object' && 'code' in error && error['code'] === code;
    }
}

export class DefaultPluginRpc implements PluginRpc {

    private locals = new Map<string, any>();
    private proxies = new Map<string, any>();
    private disposables = new DisposableCollection({ dispose: () => { /* mark as not disposed */ } });
    private jsonRpc: JsonRpc = new DefaultJsonRpc();

    private multiplexer: ConnectionMultiplexer<AnyConnection>;
    private replacer: (key: string | undefined, value: any) => any;
    private reviver: (key: string | undefined, value: any) => any;

    constructor(connection: AnyConnection, transformations?: {
        replacer?: (key: string | undefined, value: any) => any,
        reviver?: (key: string | undefined, value: any) => any
    }) {
        this.reviver = transformations?.reviver || ObjectsTransferrer.reviver;
        this.replacer = transformations?.replacer || ObjectsTransferrer.replacer;
        this.multiplexer = new DefaultConnectionMultiplexer(new DefaultRouter())
            .initialize(new TransformedConnection(connection, {
                decode: (message, emit) => emit(revive(message, this.reviver)),
                encode: (message, write) => write(replace(message, this.replacer))
            }));
        this.multiplexer.listen((params, accept, next) => {
            const local = this.locals.get(params.proxyId);
            if (!local) {
                return next(new Error(`unknown proxyId: ${JSON.stringify(params.proxyId)}`));
            }
            const channel = accept();
            const messageConnection = this.jsonRpc.createMessageConnection(channel);
            const rpcConnection = this.jsonRpc.createRpcConnection(messageConnection);
            this.serveRpcConnection(local, rpcConnection);
        });
    }

    private get isDisposed(): boolean {
        return this.disposables.disposed;
    }

    dispose(): void {
        this.disposables.dispose();
    }

    getProxy<T>(proxyId: ProxyIdentifier<T>): T {
        if (this.isDisposed) {
            throw ConnectionClosedError.create();
        }
        let proxy = this.proxies.get(proxyId.id);
        if (!proxy) {
            this.proxies.set(proxyId.id, proxy = this.createProxy(proxyId.id));
        }
        return proxy;
    }

    set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R {
        if (this.isDisposed) {
            throw ConnectionClosedError.create();
        }
        this.locals.set(identifier.id, instance);
        if (Disposable.is(instance)) {
            this.disposables.push(instance);
        }
        this.disposables.push(Disposable.create(() => this.locals.delete(identifier.id)));
        return instance;
    }

    private serveRpcConnection(server: any, rpcConnection: RpcConnection): void {
        rpcConnection.handleRequest((method, params, token) => server[method](...params, token));
    }

    private createProxy<T>(proxyId: string): T {
        const channel = this.multiplexer.open({ proxyId });
        const messageConnection = this.jsonRpc.createMessageConnection(channel);
        const rpcConnection = this.jsonRpc.createRpcConnection(messageConnection);
        const handler = {
            get: (target: any, name: string) => {
                if (!target[name] && name.charCodeAt(0) === 36 /* CharCode.DollarSign */) {
                    target[name] = (...args: any[]) => rpcConnection.sendRequest(name, args);
                }
                return target[name];
            }
        };
        return new Proxy(Object.create(null), handler);
    }
}

/**
 * @deprecated since 1.27.0 use {@link DefaultPluginRpc} instead.
 */
export const RPCProtocolImpl = DefaultPluginRpc;

/**
 * "Out of band" protocol to interact with the plugin host process itself.
 */
export namespace PluginHostProtocol {

    export function isMessage(what: any): what is Message {
        return typeof what === 'object' && what !== null && '$pluginHostMessageType' in what;
    }

    export function createMessage<T extends keyof MessageTypeMap>(type: T, properties: Omit<MessageTypeMap[T], '$pluginHostMessageType'>): T {
        return {
            ...properties,
            $pluginHostMessageType: type
        } as any;
    }

    export interface MessageType<T extends string> {
        $pluginHostMessageType: T
    }

    export const TerminateRequest = 'terminateRequest';
    export type TerminateRequest = MessageType<typeof TerminateRequest> & {
        timeout?: number
    };

    export const TerminatedEvent = 'terminatedEvent';
    export type TerminatedEvent = MessageType<typeof TerminatedEvent>;

    export interface MessageTypeMap {
        [TerminateRequest]: TerminateRequest
        [TerminatedEvent]: TerminatedEvent
    }

    export type Message = MessageTypeMap[keyof MessageTypeMap];
}

/**
 * These functions are responsible for correct transferring objects via rpc channel.
 *
 * To reach that some specific kind of objects is converted to json in some custom way
 * and then, after receiving, revived to objects again,
 * so there is feeling that object was transferred via rpc channel.
 *
 * To distinguish between regular and altered objects, field $type is added to altered ones.
 * Also value of that field specifies kind of the object.
 */
export namespace ObjectsTransferrer {

    export function replacer(key: string | undefined, value: any): any {
        if (value instanceof URI) {
            return {
                $type: SerializedObjectType.THEIA_URI,
                data: value.toString(true)
            } as SerializedObject;
        } else if (value instanceof Range) {
            return {
                $type: SerializedObjectType.THEIA_RANGE,
                data: [value.start.line, value.start.character, value.end.line, value.end.character]
            } as SerializedObject;
        } else if (value && value['$mid'] === 1) {
            // Given value is VSCode URI
            // We cannot use instanceof here because VSCode URI has toJSON method which is invoked before this replacer.
            const uri = VSCodeURI.revive(value);
            return {
                $type: SerializedObjectType.VSCODE_URI,
                data: uri.toString(true)
            } as SerializedObject;
        } else if (value instanceof BinaryBuffer) {
            return {
                $type: SerializedObjectType.TEXT_BUFFER,
                data: value.buffer
            };
        }
        return value;
    }

    export function reviver(key: string | undefined, value: any): any {
        if (isSerializedObject(value)) {
            switch (value.$type) {
                case SerializedObjectType.THEIA_URI:
                    return new URI(value.data);
                case SerializedObjectType.VSCODE_URI:
                    return VSCodeURI.parse(value.data);
                case SerializedObjectType.THEIA_RANGE:
                    const [startLine, startColumn, endLine, endColumn] = value.data;
                    return new Range(startLine, startColumn, endLine, endColumn);
                case SerializedObjectType.TEXT_BUFFER:
                    return BinaryBuffer.wrap(value.data);
            }
        }
        return value;
    }

}

interface SerializedObject {
    $type: SerializedObjectType;
    data: any;
}

enum SerializedObjectType {
    THEIA_URI,
    VSCODE_URI,
    THEIA_RANGE,
    TEXT_BUFFER
}

function isSerializedObject(obj: any): obj is SerializedObject {
    return obj && obj.$type !== undefined && obj.data !== undefined;
}

export interface SerializedError {
    $isError: true;
    name: string;
    message: string;
    stack: string;
}

export function transformErrorForSerialization(error: any): SerializedError {
    if (error instanceof Error) {
        const { name, message } = error;
        const stack: string = (<any>error).stacktrace || error.stack;
        return {
            $isError: true,
            name,
            message,
            stack
        };
    }
    return error;
}

export function replace(value: any, replacer: (key: string | undefined, nested: any) => any): any {
    if (typeof value === 'object') {
        if (value === null) {
            return null;
        }
        if (Array.isArray(value)) {
            return value.map(element => replacer(undefined, element));
        }
        let replaced = replacer(undefined, value);
        if (value === replaced) {
            replaced = {};
            Object.keys(value).forEach(propertyKey => {
                replaced[propertyKey] = replace(value[propertyKey], replacer);
            });
        }
        return replaced;
    }
    return value;
}

export function revive(value: any, reviver: (key: string | undefined, nested: any) => any): any {
    if (typeof value === 'object') {
        if (value === null) {
            return null;
        }
        if (Array.isArray(value)) {
            return value.map(element => reviver(undefined, element));
        }
        let replaced = reviver(undefined, value);
        if (value === replaced) {
            replaced = {};
            Object.keys(value).forEach(propertyKey => {
                replaced[propertyKey] = replace(value[propertyKey], reviver);
            });
        }
        return replaced;
    }
    return value;
}
