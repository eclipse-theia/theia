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
import { Channel, Disposable, DisposableCollection, ReadBuffer, WriteBuffer } from '@theia/core';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '@theia/core/lib/common/message-rpc/uint8-array-message-buffer';
import { ChannelMultiplexer } from '@theia/core/lib/common/message-rpc/channel';
import { ObjectType, RpcMessageDecoder, RpcMessageEncoder } from '@theia/core/lib/common/message-rpc/rpc-message-encoder';
import { Position, Range } from '../plugin/types-impl';
import { ClientProxyHandler, RpcInvocationHandler, RpcMessageCodec } from './proxy-handler';
import TheiaURI from '@theia/core/lib/common/uri';
import { URI as VSCodeURI } from '@theia/core/shared/vscode-uri';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';

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

// Start with 101 to avoid clashes with ObjectType from core.
// All values < 255, still fit into Uint8
export enum PluginObjectType {
    TheiaRange = 101,
    TheiaUri = 102,
    VSCodeUri = 103,
    // eslint-disable-next-line @typescript-eslint/no-shadow
    BinaryBuffer = 104,
}

export class RPCProtocolImpl implements RPCProtocol {
    private readonly locals = new Map<string, RpcInvocationHandler>();
    private readonly proxies = new Map<string, any>();
    private readonly multiplexer: ChannelMultiplexer;
    private messageCodec: RpcMessageCodec;

    private readonly toDispose = new DisposableCollection(
        Disposable.create(() => { /* mark as no disposed */ })
    );

    constructor(channel: Channel) {
        this.messageCodec = {
            encoder: new PluginRpcMessageEncoder(),
            decoder: new PluginRpcMessageDecoder(),
        };
        this.toDispose.push(this.multiplexer = new QueuingChannelMultiplexer(channel));
        this.toDispose.push(Disposable.create(() => this.proxies.clear()));
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
        const handler = new ClientProxyHandler(proxyId, this.messageCodec, () => this.multiplexer.open(proxyId));
        return new Proxy(Object.create(null), handler);
    }

    set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R {
        if (this.isDisposed) {
            throw ConnectionClosedError.create();
        }
        const invocationHandler = this.locals.get(identifier.id);
        if (!invocationHandler) {
            const handler = new RpcInvocationHandler(identifier.id, instance, this.messageCodec);

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

    protected override registerEncoders(): void {
        super.registerEncoders();

        this.registerEncoder(PluginObjectType.TheiaRange, {
            is: value => value instanceof Range,
            write: (buf, value) => {
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
                buf.writeString(JSON.stringify(serializedValue));
            }
        });

        this.registerEncoder(PluginObjectType.TheiaUri, {
            is: value => value instanceof TheiaURI,
            write: (buf, value) => {
                buf.writeString(value.toString());
            }
        });

        this.registerEncoder(PluginObjectType.VSCodeUri, {
            is: value => value instanceof VSCodeURI,
            write: (buf, value) => {
                buf.writeString(value.toString());
            }
        });

        this.registerEncoder(PluginObjectType.BinaryBuffer, {
            is: value => value instanceof BinaryBuffer,
            write: (buf, value) => {
                const binaryBuffer = value as BinaryBuffer;
                buf.writeBytes(binaryBuffer.buffer);
            }
        });

        // We don't want/need special encoding for `ResponseErrors`. Overwrite with no-op encoder.
        // The default Error encoder will be used as fallback
        this.registerEncoder(ObjectType.ResponseError, {
            is: () => false,
            write: () => { }
        }, true);
    }
}

export class PluginRpcMessageDecoder extends RpcMessageDecoder {

    protected override registerDecoders(): void {
        super.registerDecoders();

        this.registerDecoder(PluginObjectType.TheiaRange, {
            read: buf => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const obj: any = JSON.parse(buf.readString());
                const start = new Position(obj.start.line, obj.start.character);
                const end = new Position(obj.end.line, obj.end.character);
                return new Range(start, end);
            }
        });
        this.registerDecoder(PluginObjectType.TheiaUri, {
            read: buf => new TheiaURI(buf.readString())
        });

        this.registerDecoder(PluginObjectType.VSCodeUri, {
            read: buf => VSCodeURI.parse(buf.readString())
        });

        this.registerDecoder(PluginObjectType.BinaryBuffer, {
            read: buf => BinaryBuffer.wrap(buf.readBytes())
        });
    }
}

/**
 * Sends/Receives multiple messages in one go:
 *  - multiple messages to be sent from one stack get sent in bulk at `process.nextTick`.
 *  - each incoming message is handled in a separate `process.nextTick`.
 */
export class QueuingChannelMultiplexer extends ChannelMultiplexer {
    protected messagesToSend: Uint8Array[] = [];

    constructor(underlyingChannel: Channel) {
        super(underlyingChannel);
        this.toDispose.push(Disposable.create(() => this.messagesToSend = []));
    }

    protected override getUnderlyingWriteBuffer(): WriteBuffer {
        const writer = new Uint8ArrayWriteBuffer();
        writer.onCommit(buffer => this.commitSingleMessage(buffer));
        return writer;
    }

    protected commitSingleMessage(msg: Uint8Array): void {
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
            writer.writeLength(cachedMessages.length);
            cachedMessages.forEach(msg => {
                writer.writeBytes(msg);
            });

        }
        writer.commit();
    }

    protected override handleMessage(buffer: ReadBuffer): void {
        // Read in the list of messages and handle each message individually
        const length = buffer.readLength();
        if (length > 0) {
            for (let index = 0; index < length; index++) {
                const message = buffer.readBytes();
                this.handleSingleMessage(new Uint8ArrayReadBuffer(message));

            }
        }
    }

    protected handleSingleMessage(buffer: ReadBuffer): void {
        return super.handleMessage(buffer);
    }
}
