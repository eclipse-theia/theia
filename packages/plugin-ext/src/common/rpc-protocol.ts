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

import { Emitter, Event } from '@theia/core/lib/common/event';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { URI as VSCodeURI } from '@theia/core/shared/vscode-uri';
import URI from '@theia/core/lib/common/uri';
import { CancellationToken, CancellationTokenSource } from '@theia/core/shared/vscode-languageserver-protocol';
import { Range, Position } from '../plugin/types-impl';
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
    export function is(error: unknown): error is ConnectionClosedError {
        return !!error && typeof error === 'object' && 'code' in error && (error as ConnectionClosedError).code === code;
    }
}

export class RPCProtocolImpl implements RPCProtocol {

    private readonly locals = new Map<string, any>();
    private readonly proxies = new Map<string, any>();
    private lastMessageId = 0;
    private readonly cancellationTokenSources = new Map<string, CancellationTokenSource>();
    private readonly pendingRPCReplies = new Map<string, Deferred<any>>();
    private readonly multiplexer: RPCMultiplexer;

    private replacer: (key: string | undefined, value: any) => any;
    private reviver: (key: string | undefined, value: any) => any;

    private readonly toDispose = new DisposableCollection(
        Disposable.create(() => { /* mark as no disposed */ })
    );

    constructor(connection: MessageConnection, transformations?: {
        replacer?: (key: string | undefined, value: any) => any,
        reviver?: (key: string | undefined, value: any) => any
    }) {
        this.toDispose.push(
            this.multiplexer = new RPCMultiplexer(connection)
        );
        this.multiplexer.onMessage(msg => this.receiveOneMessage(msg));
        this.toDispose.push(Disposable.create(() => {
            this.proxies.clear();
            for (const reply of this.pendingRPCReplies.values()) {
                reply.reject(ConnectionClosedError.create());
            }
            this.pendingRPCReplies.clear();
        }));

        this.reviver = transformations?.reviver || ObjectsTransferrer.reviver;
        this.replacer = transformations?.replacer || ObjectsTransferrer.replacer;
    }

    private get isDisposed(): boolean {
        return this.toDispose.disposed;
    }

    dispose(): void {
        this.toDispose.dispose();
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

    set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R {
        if (this.isDisposed) {
            throw ConnectionClosedError.create();
        }
        this.locals.set(identifier.id, instance);
        if (Disposable.is(instance)) {
            this.toDispose.push(instance);
        }
        this.toDispose.push(Disposable.create(() => this.locals.delete(identifier.id)));
        return instance;
    }

    private createProxy<T>(proxyId: string): T {
        const handler = {
            get: (target: any, name: string) => {
                if (!target[name] && name.charCodeAt(0) === 36 /* CharCode.DollarSign */) {
                    target[name] = (...myArgs: any[]) =>
                        this.remoteCall(proxyId, name, myArgs);
                }
                return target[name];
            }
        };
        return new Proxy(Object.create(null), handler);
    }

    private remoteCall(proxyId: string, methodName: string, args: any[]): Promise<any> {
        if (this.isDisposed) {
            return Promise.reject(ConnectionClosedError.create());
        }
        const cancellationToken: CancellationToken | undefined = args.length && CancellationToken.is(args[args.length - 1]) ? args.pop() : undefined;
        if (cancellationToken && cancellationToken.isCancellationRequested) {
            return Promise.reject(canceled());
        }

        const callId = String(++this.lastMessageId);
        const result = new Deferred();

        if (cancellationToken) {
            args.push('add.cancellation.token');
            cancellationToken.onCancellationRequested(() =>
                this.multiplexer.send(this.cancel(callId))
            );
        }

        this.pendingRPCReplies.set(callId, result);
        this.multiplexer.send(this.request(callId, proxyId, methodName, args));
        return result.promise;
    }

    private receiveOneMessage(rawmsg: string): void {
        if (this.isDisposed) {
            return;
        }
        try {
            const msg = <RPCMessage>JSON.parse(rawmsg, this.reviver);

            switch (msg.type) {
                case MessageType.Request:
                    this.receiveRequest(msg);
                    break;
                case MessageType.Reply:
                    this.receiveReply(msg);
                    break;
                case MessageType.ReplyErr:
                    this.receiveReplyErr(msg);
                    break;
                case MessageType.Cancel:
                    this.receiveCancel(msg);
                    break;
            }
        } catch (e) {
            // exception does not show problematic content: log it!
            console.log('failed to parse message: ' + rawmsg);
            throw e;
        }

    }

    private receiveCancel(msg: CancelMessage): void {
        const cancellationTokenSource = this.cancellationTokenSources.get(msg.id);
        if (cancellationTokenSource) {
            cancellationTokenSource.cancel();
        }
    }

    private receiveRequest(msg: RequestMessage): void {
        const callId = msg.id;
        const proxyId = msg.proxyId;
        // convert `null` to `undefined`, since we don't use `null` in internal plugin APIs
        const args = msg.args.map(arg => arg === null ? undefined : arg); // eslint-disable-line no-null/no-null

        const addToken = args.length && args[args.length - 1] === 'add.cancellation.token' ? args.pop() : false;
        if (addToken) {
            const tokenSource = new CancellationTokenSource();
            this.cancellationTokenSources.set(callId, tokenSource);
            args.push(tokenSource.token);
        }
        const invocation = this.invokeHandler(proxyId, msg.method, args);

        invocation.then(result => {
            this.cancellationTokenSources.delete(callId);
            this.multiplexer.send(this.replyOK(callId, result));
        }, error => {
            this.cancellationTokenSources.delete(callId);
            this.multiplexer.send(this.replyErr(callId, error));
        });
    }

    private receiveReply(msg: ReplyMessage): void {
        const callId = msg.id;
        const pendingReply = this.pendingRPCReplies.get(callId);
        if (!pendingReply) {
            return;
        }
        this.pendingRPCReplies.delete(callId);
        pendingReply.resolve(msg.res);
    }

    private receiveReplyErr(msg: ReplyErrMessage): void {
        const callId = msg.id;
        const pendingReply = this.pendingRPCReplies.get(callId);
        if (!pendingReply) {
            return;
        }
        this.pendingRPCReplies.delete(callId);

        let err: Error | undefined = undefined;
        if (msg.err && msg.err.$isError) {
            err = new Error();
            err.name = msg.err.name;
            err.message = msg.err.message;
            err.stack = msg.err.stack;
        }
        pendingReply.reject(err);
    }

    private invokeHandler(proxyId: string, methodName: string, args: any[]): Promise<any> {
        try {
            return Promise.resolve(this.doInvokeHandler(proxyId, methodName, args));
        } catch (err) {
            return Promise.reject(err);
        }
    }

    private doInvokeHandler(proxyId: string, methodName: string, args: any[]): any {
        const actor = this.locals.get(proxyId);
        if (!actor) {
            throw new Error('Unknown actor ' + proxyId);
        }
        const method = actor[methodName];
        if (typeof method !== 'function') {
            throw new Error('Unknown method ' + methodName + ' on actor ' + proxyId);
        }
        return method.apply(actor, args);
    }

    private cancel(req: string): string {
        return `{"type":${MessageType.Cancel},"id":"${req}"}`;
    }

    private request(req: string, rpcId: string, method: string, args: any[]): string {
        return `{"type":${MessageType.Request},"id":"${req}","proxyId":"${rpcId}","method":"${method}","args":${JSON.stringify(args, this.replacer)}}`;
    }

    private replyOK(req: string, res: any): string {
        if (typeof res === 'undefined') {
            return `{"type":${MessageType.Reply},"id":"${req}"}`;
        }
        return `{"type":${MessageType.Reply},"id":"${req}","res":${safeStringify(res, this.replacer)}}`;
    }

    private replyErr(req: string, err: any): string {
        err = typeof err === 'string' ? new Error(err) : err;
        if (err instanceof Error) {
            return `{"type":${MessageType.ReplyErr},"id":"${req}","err":${safeStringify(transformErrorForSerialization(err))}}`;
        }
        return `{"type":${MessageType.ReplyErr},"id":"${req}","err":null}`;
    }
}

function canceled(): Error {
    const error = new Error('Canceled');
    error.name = error.message;
    return error;
}

/**
 * Sends/Receives multiple messages in one go:
 *  - multiple messages to be sent from one stack get sent in bulk at `process.nextTick`.
 *  - each incoming message is handled in a separate `process.nextTick`.
 */
class RPCMultiplexer implements Disposable, MessageConnection {

    private readonly connection: MessageConnection;
    private readonly sendAccumulatedBound: () => void;

    private messagesToSend: string[];

    private readonly messageEmitter = new Emitter<string>();
    private readonly toDispose = new DisposableCollection();

    constructor(connection: MessageConnection) {
        this.connection = connection;
        this.sendAccumulatedBound = this.sendAccumulated.bind(this);

        this.toDispose.push(Disposable.create(() => this.messagesToSend = []));
        this.toDispose.push(this.connection.onMessage((msg: string) => {
            const messages = JSON.parse(msg);
            for (const message of messages) {
                this.messageEmitter.fire(message);
            }
        }));
        this.toDispose.push(this.messageEmitter);

        this.messagesToSend = [];
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get onMessage(): Event<string> {
        return this.messageEmitter.event;
    }

    private sendAccumulated(): void {
        const tmp = this.messagesToSend;
        this.messagesToSend = [];
        this.connection.send(JSON.stringify(tmp));
    }

    public send(msg: string): void {
        if (this.toDispose.disposed) {
            throw ConnectionClosedError.create();
        }
        if (this.messagesToSend.length === 0) {
            if (typeof setImmediate !== 'undefined') {
                setImmediate(this.sendAccumulatedBound);
            } else {
                setTimeout(this.sendAccumulatedBound, 0);
            }
        }
        this.messagesToSend.push(msg);
    }
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

function isSerializedObject(obj: unknown): obj is SerializedObject {
    const serializedObject = obj as SerializedObject;
    return !!obj && typeof obj === 'object' && serializedObject.$type !== undefined && serializedObject.data !== undefined;
}

export const enum MessageType {
    Request = 1,
    Reply = 2,
    ReplyErr = 3,
    Cancel = 4,
    Terminate = 5,
    Terminated = 6
}

class CancelMessage {
    type: MessageType.Cancel;
    id: string;
}

class RequestMessage {
    type: MessageType.Request;
    id: string;
    proxyId: string;
    method: string;
    args: any[];
}

class ReplyMessage {
    type: MessageType.Reply;
    id: string;
    res: any;
}

class ReplyErrMessage {
    type: MessageType.ReplyErr;
    id: string;
    err: SerializedError;
}

type RPCMessage = RequestMessage | ReplyMessage | ReplyErrMessage | CancelMessage;

export interface SerializedError {
    readonly $isError: true;
    readonly name: string;
    readonly message: string;
    readonly stack: string;
}

export function transformErrorForSerialization(error: Error): SerializedError {
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

    // return as is
    return error;
}

interface JSONStringifyReplacer {
    (key: string, value: any): any;
}

function safeStringify(obj: any, replacer?: JSONStringifyReplacer): string {
    try {
        return JSON.stringify(obj, replacer);
    } catch (err) {
        console.error('error stringifying response: ', err);
        return 'null';
    }
}
