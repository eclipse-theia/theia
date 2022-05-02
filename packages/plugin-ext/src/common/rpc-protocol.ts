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

import { Event } from '@theia/core/lib/common/event';
import { Channel, ChannelMultiplexer, Disposable, DisposableCollection, ReadBuffer, WriteBuffer } from '@theia/core';
import { ArrayBufferReadBuffer, ArrayBufferWriteBuffer } from '@theia/core/lib/common/message-rpc/array-buffer-message-buffer';
import { ObjectType, RpcMessageDecoder, RpcMessageEncoder } from '@theia/core/lib/common/message-rpc/rpc-message-encoder';
import URI from '@theia/core/lib/common/uri';
import { URI as VSCodeURI } from '@theia/core/shared/vscode-uri';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { Position, Range } from '../plugin/types-impl';
import { ClientProxyHandler, RpcInvocationHandler, RpcMessageParser } from './proxy-handler';
export interface MessageConnection {
    send(msg: string): void;
    onMessage: Event<string>;
}

export const RPCProtocol = Symbol('RPCProtocol');
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is(error: any): error is ConnectionClosedError {
        return !!error && typeof error === 'object' && 'code' in error && error['code'] === code;
    }
}

export class RPCProtocolImpl implements RPCProtocol {
    private readonly locals = new Map<string, RpcInvocationHandler>();
    private readonly proxies = new Map<string, any>();
    private readonly multiplexer: ChannelMultiplexer;
    private messageParser: RpcMessageParser;

    private readonly toDispose = new DisposableCollection(
        Disposable.create(() => { /* mark as no disposed */ })
    );

    constructor(channel: Channel, transformations: {
        replacer?: (key: string | undefined, value: any) => any,
        reviver?: (key: string | undefined, value: any) => any
    } = {}) {
        this.multiplexer = new QueuingChannelMultiplexer(channel);
        this.toDispose.push(Disposable.create(() => this.multiplexer.closeUnderlyingChannel()));

        const reviver = transformations?.reviver || ObjectsTransferrer.reviver;
        const replacer = transformations?.replacer || ObjectsTransferrer.replacer;

        this.messageParser = {
            encoder: new PluginRpcMessageEncoder(replacer),
            decoder: new PluginRpcMessageDecoder(reviver)
        };
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
        const handler = new ClientProxyHandler(proxyId, this.messageParser);

        this.multiplexer.open(proxyId).then(_channel => {
            handler.listen(_channel);
        });
        return new Proxy(Object.create(null), handler);
    }

    set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R {
        if (this.isDisposed) {
            throw ConnectionClosedError.create();
        }
        const invocationHandler = this.locals.get(identifier.id);
        if (!invocationHandler) {
            const handler = new RpcInvocationHandler(identifier.id, instance, this.messageParser);

            const channel = this.multiplexer.getOpenChannel(identifier.id);
            if (channel) {
                handler.listen(channel);
            } else {
                const channelOpenListener = this.multiplexer.onDidOpenChannel(event => {
                    if (event.id === identifier.id) {
                        handler.listen(event.channel);
                        channelOpenListener.dispose();
                    }
                });
            }

            this.locals.set(identifier.id, handler);
            if (Disposable.is(instance)) {
                this.toDispose.push(instance);
            }
            this.toDispose.push(Disposable.create(() => this.locals.delete(identifier.id)));

        }
        return instance;
    }
}

export class PluginRpcMessageEncoder extends RpcMessageEncoder {
    constructor(protected replacer: (key: string | undefined, value: any) => any) {
        super();
    }
    protected override registerEncoders(): void {
        super.registerEncoders();
        // Overwrite default json encoder.
        this.registerEncoder(ObjectType.JSON, {
            is: value => true,
            write: (buf, value) => {
                const json = JSON.stringify(value, this.replacer);
                buf.writeString(json);
            }
        }, true);
        // We don't want/need special encoding for `ResponseErrors`. Overwrite with no-op encoder.
        // The default Error encoder will be used as fallback
        this.registerEncoder(ObjectType.RESPONSE_ERROR, {
            is: () => false,
            write: () => { }
        }, true);
    }
}

export class PluginRpcMessageDecoder extends RpcMessageDecoder {

    constructor(protected reviver: (key: string | undefined, value: any) => any) {
        super();
    }
    protected override registerDecoders(): void {
        super.registerDecoders();
        this.registerDecoder(ObjectType.JSON, {
            read: buf => JSON.parse(buf.readString(), this.reviver)
        }, true);
    }

}

/**
 * Sends/Receives multiple messages in one go:
 *  - multiple messages to be sent from one stack get sent in bulk at `process.nextTick`.
 *  - each incoming message is handled in a separate `process.nextTick`.
 */
export class QueuingChannelMultiplexer extends ChannelMultiplexer {
    protected messagesToSend: ArrayBuffer[] = [];
    protected readonly toDispose = new DisposableCollection();

    constructor(underlyingChannel: Channel) {
        super(underlyingChannel);
        this.toDispose.push(Disposable.create(() => this.messagesToSend = []));
    }

    protected override getUnderlyingWriteBuffer(): WriteBuffer {
        const writer = new ArrayBufferWriteBuffer();
        writer.onCommit(buffer => this.commitSingleMessage(buffer));
        return writer;
    }

    protected commitSingleMessage(msg: ArrayBuffer): void {
        if (this.toDispose.disposed) {
            throw ConnectionClosedError.create();
        }
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
            writer.writeInteger(cachedMessages.length);
            cachedMessages.forEach(msg => {
                writer.writeBytes(msg);
            });

        }
        writer.commit();
    }

    protected override handleMessage(buffer: ReadBuffer): void {
        // Read in the list of messages and handle each message individually
        const length = buffer.readInteger();
        if (length > 0) {
            for (let index = 0; index < length; index++) {
                const message = buffer.readBytes();
                this.handleSingleMessage(new ArrayBufferReadBuffer(message));

            }
        }
    }

    protected handleSingleMessage(buffer: ReadBuffer): void {
        return super.handleMessage(buffer);
    }
}

interface SerializedObject {
    $type: SerializedObjectType;
    data: string;
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function replacer(key: string | undefined, value: any): any {
        if (value instanceof URI) {
            return {
                $type: SerializedObjectType.THEIA_URI,
                data: value.toString()
            } as SerializedObject;
        } else if (value instanceof Range) {
            const range = value as Range;
            const serializedValue = {
                start: {
                    line: range.start.line,
                    character: range.start.character
                },
                end: {
                    line: range.end.line,
                    character: range.end.character
                }
            };
            return {
                $type: SerializedObjectType.THEIA_RANGE,
                data: JSON.stringify(serializedValue)
            } as SerializedObject;
        } else if (value && value['$mid'] === 1) {
            // Given value is VSCode URI
            // We cannot use instanceof here because VSCode URI has toJSON method which is invoked before this replacer.
            const uri = VSCodeURI.revive(value);
            return {
                $type: SerializedObjectType.VSCODE_URI,
                data: uri.toString()
            } as SerializedObject;
        } else if (value instanceof BinaryBuffer) {
            const bytes = [...value.buffer.values()];
            return {
                $type: SerializedObjectType.TEXT_BUFFER,
                data: JSON.stringify({ bytes })
            };
        }

        return value;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function reviver(key: string | undefined, value: any): any {
        if (isSerializedObject(value)) {
            switch (value.$type) {
                case SerializedObjectType.THEIA_URI:
                    return new URI(value.data);
                case SerializedObjectType.VSCODE_URI:
                    return VSCodeURI.parse(value.data);
                case SerializedObjectType.THEIA_RANGE:
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const obj: any = JSON.parse(value.data);
                    const start = new Position(obj.start.line, obj.start.character);
                    const end = new Position(obj.end.line, obj.end.character);
                    return new Range(start, end);
                case SerializedObjectType.TEXT_BUFFER:
                    const data: { bytes: number[] } = JSON.parse(value.data);
                    return BinaryBuffer.wrap(Uint8Array.from(data.bytes));
            }
        }

        return value;
    }

}

