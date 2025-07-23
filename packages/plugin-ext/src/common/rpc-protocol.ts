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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// copied from https://github.com/Microsoft/vscode/blob/master/src/vs/workbench/services/extensions/node/rpcProtocol.ts
// with small modifications

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Channel, Disposable, DisposableCollection, isObject, ReadBuffer, RpcProtocol, URI, WriteBuffer } from '@theia/core';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { MessageProvider } from '@theia/core/lib/common/message-rpc/channel';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '@theia/core/lib/common/message-rpc/uint8-array-message-buffer';
import { MsgPackExtensionManager } from '@theia/core/lib/common/message-rpc/msg-pack-extension-manager';
import { URI as VSCodeURI } from '@theia/core/shared/vscode-uri';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { Range, Position } from '../plugin/types-impl';

export interface MessageConnection {
    send(msg: string): void;
    onMessage: Event<string>;
}

export const RPCProtocol = Symbol.for('RPCProtocol');
export interface RPCProtocol extends Disposable {
    /**
     * Returns a proxy to an object addressable/named in the plugin process or in the main process.
     */
    getProxy<T>(proxyId: ProxyIdentifier<T>): T;

    /**
     * Register manually created instance.
     */
    set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R;

}

export class ProxyIdentifier<T> {
    public readonly id: string;
    constructor(public readonly isMain: boolean, id: string | T) {
        // TODO this is nasty, rewrite this
        this.id = (id as any).toString();
    }
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
    export function is(error: unknown): error is ConnectionClosedError {
        return isObject(error) && 'code' in error && (error as ConnectionClosedError).code === code;
    }
}

export class RPCProtocolImpl implements RPCProtocol {
    private readonly locals = new Map<string, any>();
    private readonly proxies = new Map<string, any>();
    private readonly rpc: RpcProtocol;

    private readonly toDispose = new DisposableCollection(
        Disposable.create(() => { /* mark as no disposed */ })
    );

    constructor(channel: Channel) {
        this.rpc = new RpcProtocol(new BatchingChannel(channel), (method, args) => this.handleRequest(method, args));
        this.rpc.onNotification((evt: { method: string; args: any[]; }) => this.handleNotification(evt.method, evt.args));
        this.toDispose.push(Disposable.create(() => this.proxies.clear()));
    }

    handleNotification(method: any, args: any[]): void {
        const serviceId = args[0] as string;
        const handler: any = this.locals.get(serviceId);
        if (!handler) {
            throw new Error(`no local service handler with id ${serviceId}`);
        }
        handler[method](...(args.slice(1)));
    }

    handleRequest(method: string, args: any[]): Promise<any> {
        const serviceId = args[0] as string;
        const handler: any = this.locals.get(serviceId);
        if (!handler) {
            throw new Error(`no local service handler with id ${serviceId}`);
        }
        return handler[method](...(args.slice(1)));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected get isDisposed(): boolean {
        return this.toDispose.disposed;
    }

    getProxy<T>(proxyId: ProxyIdentifier<T>): T {
        if (this.isDisposed) {
            throw ConnectionClosedError.create();
        }
        let proxy = this.proxies.get(proxyId.id);
        if (!proxy) {
            proxy = this.createProxy(proxyId.id);
            this.proxies.set(proxyId.id, proxy);
        }
        return proxy;
    }

    protected createProxy<T>(proxyId: string): T {
        const handler = {
            get: (target: any, name: string, receiver: any): any => {
                if (target[name] || name.charCodeAt(0) !== 36 /* CharCode.DollarSign */) {
                    // not a remote property
                    return target[name];
                }
                const isNotify = this.isNotification(name);
                return async (...args: any[]) => {
                    const method = name.toString();
                    if (isNotify) {
                        this.rpc.sendNotification(method, [proxyId, ...args]);
                    } else {
                        return await this.rpc.sendRequest(method, [proxyId, ...args]) as Promise<any>;
                    }
                };
            }

        };
        return new Proxy(Object.create(null), handler);
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

    set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R {
        if (this.isDisposed) {
            throw ConnectionClosedError.create();
        }
        if (!this.locals.has(identifier.id)) {
            this.locals.set(identifier.id, instance);
            if (Disposable.is(instance)) {
                this.toDispose.push(instance);
            }
            this.toDispose.push(Disposable.create(() => this.locals.delete(identifier.id)));
        }
        return instance;
    }
}

/**
 * Wraps and underlying channel to send/receive multiple messages in one go:
 *  - multiple messages to be sent from one stack get sent in bulk at `process.nextTick`.
 *  - each incoming message is handled in a separate `process.nextTick`.
 */
export class BatchingChannel implements Channel {
    protected messagesToSend: Uint8Array[] = [];

    constructor(protected underlyingChannel: Channel) {
        underlyingChannel.onMessage(msg => this.handleMessages(msg()));
    }

    protected onMessageEmitter: Emitter<MessageProvider> = new Emitter();
    get onMessage(): Event<MessageProvider> {
        return this.onMessageEmitter.event;
    };

    readonly onClose = this.underlyingChannel.onClose;
    readonly onError = this.underlyingChannel.onError;

    close(): void {
        this.underlyingChannel.close();
        this.onMessageEmitter.dispose();
        this.messagesToSend = [];
    }

    getWriteBuffer(): WriteBuffer {
        const writer = new Uint8ArrayWriteBuffer();
        writer.onCommit(buffer => this.commitSingleMessage(buffer));
        return writer;
    }

    protected commitSingleMessage(msg: Uint8Array): void {

        if (this.messagesToSend.length === 0) {
            if (typeof setImmediate !== 'undefined') {
                setImmediate(() => this.sendAccumulated());
            } else {
                setTimeout(() => this.sendAccumulated(), 0);
            }
        }
        this.messagesToSend.push(msg);
    }

    protected sendAccumulated(): void {
        const cachedMessages = this.messagesToSend;
        this.messagesToSend = [];
        const writer = this.underlyingChannel.getWriteBuffer();

        if (cachedMessages.length > 0) {
            writer.writeLength(cachedMessages.length);
            cachedMessages.forEach(msg => {
                writer.writeBytes(msg);
            });

        }
        writer.commit();
    }

    protected handleMessages(buffer: ReadBuffer): void {
        // Read in the list of messages and dispatch each message individually
        const length = buffer.readLength();
        if (length > 0) {
            for (let index = 0; index < length; index++) {
                const message = buffer.readBytes();
                this.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(message));
            }
        }
    }
}

export const enum MsgPackExtensionTag {
    Uri = 2,
    // eslint-disable-next-line @typescript-eslint/no-shadow
    Range = 3,
    VsCodeUri = 4,
    // eslint-disable-next-line @typescript-eslint/no-shadow
    BinaryBuffer = 5,
}

export function registerMsgPackExtensions(): void {
    MsgPackExtensionManager.getInstance().registerExtensions(
        {
            class: URI,
            tag: MsgPackExtensionTag.Uri,
            serialize: (instance: URI) => instance.toString(),
            deserialize: data => new URI(data)
        },
        {
            class: Range,
            tag: MsgPackExtensionTag.Range,
            serialize: (range: Range) => ({
                start: {
                    line: range.start.line,
                    character: range.start.character
                },
                end: {
                    line: range.end.line,
                    character: range.end.character
                }
            }),
            deserialize: data => {
                const start = new Position(data.start.line, data.start.character);
                const end = new Position(data.end.line, data.end.character);
                return new Range(start, end);
            }
        },
        {
            class: VSCodeURI,
            tag: MsgPackExtensionTag.VsCodeUri,
            // eslint-disable-next-line arrow-body-style
            serialize: (instance: URI) => {
                return instance.toString();
            },
            deserialize: data => VSCodeURI.parse(data)
        },
        {
            class: BinaryBuffer,
            tag: MsgPackExtensionTag.BinaryBuffer,
            // eslint-disable-next-line arrow-body-style
            serialize: (instance: BinaryBuffer) => {
                return instance.buffer;
            },
            // eslint-disable-next-line arrow-body-style
            deserialize: buffer => {
                return BinaryBuffer.wrap(buffer);
            }
        }
    );
}
