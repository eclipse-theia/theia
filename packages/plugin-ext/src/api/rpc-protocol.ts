/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// copied from https://github.com/Microsoft/vscode/blob/master/src/vs/workbench/services/extensions/node/rpcProtocol.ts
// with small modifications

/* tslint:disable:no-any */

import { Event } from '@theia/core/lib/common/event';
import { Deferred } from '@theia/core/lib/common/promise-util';
import VSCodeURI from 'vscode-uri';
import URI from '@theia/core/lib/common/uri';
import { CancellationToken, CancellationTokenSource, Range, Position } from 'vscode-languageserver-protocol';

export interface MessageConnection {
    send(msg: {}): void;
    onMessage: Event<{}>;
}

export interface RPCProtocol {
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
        this.id = id.toString();
    }
}

export function createProxyIdentifier<T>(identifier: string): ProxyIdentifier<T> {
    return new ProxyIdentifier(false, identifier);
}

export class RPCProtocolImpl implements RPCProtocol {

    private isDisposed: boolean;
    private readonly locals: { [id: string]: any; };
    private readonly proxies: { [id: string]: any; };
    private lastMessageId: number;
    private readonly invokedHandlers: { [req: string]: Promise<any>; };
    private readonly cancellationTokenSources: { [req: string]: CancellationTokenSource } = {};
    private readonly pendingRPCReplies: { [msgId: string]: Deferred<any>; };
    private readonly multiplexor: RPCMultiplexer;
    private messageToSendHostId: string | undefined;

    constructor(connection: MessageConnection, readonly remoteHostID?: string) {
        this.isDisposed = false;
        // tslint:disable-next-line:no-null-keyword
        this.locals = Object.create(null);
        // tslint:disable-next-line:no-null-keyword
        this.proxies = Object.create(null);
        this.lastMessageId = 0;
        // tslint:disable-next-line:no-null-keyword
        this.invokedHandlers = Object.create(null);
        this.pendingRPCReplies = {};
        this.multiplexor = new RPCMultiplexer(connection, msg => this.receiveOneMessage(msg), remoteHostID);
    }
    getProxy<T>(proxyId: ProxyIdentifier<T>): T {
        if (!this.proxies[proxyId.id]) {
            this.proxies[proxyId.id] = this.createProxy(proxyId.id);
        }
        return this.proxies[proxyId.id];
    }

    set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R {
        this.locals[identifier.id] = instance;
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
        // tslint:disable-next-line:no-null-keyword
        return new Proxy(Object.create(null), handler);
    }

    private remoteCall(proxyId: string, methodName: string, args: any[]): Promise<any> {
        if (this.isDisposed) {
            return Promise.reject(canceled());
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
                this.multiplexor.send(MessageFactory.cancel(callId, this.messageToSendHostId))
            );
        }

        this.pendingRPCReplies[callId] = result;
        this.multiplexor.send(MessageFactory.request(callId, proxyId, methodName, args, this.messageToSendHostId));
        return result.promise;
    }

    private receiveOneMessage(rawmsg: string): void {
        if (this.isDisposed) {
            return;
        }

        const msg = <RPCMessage>JSON.parse(rawmsg, ObjectsTransferrer.reviver);

        // handle message that sets the Host ID
        if ((<any>msg).setHostID) {
            this.messageToSendHostId = (<any>msg).setHostID;
            return;
        }

        // skip message if not matching host
        if (this.remoteHostID && (<any>msg).hostID && this.remoteHostID !== (<any>msg).hostID) {
            return;
        }

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
    }

    private receiveCancel(msg: CancelMessage): void {
        const cancellationTokenSource = this.cancellationTokenSources[msg.id];
        if (cancellationTokenSource) {
            cancellationTokenSource.cancel();
        }
    }

    private receiveRequest(msg: RequestMessage): void {
        const callId = msg.id;
        const proxyId = msg.proxyId;
        // convert `null` to `undefined`, since we don't use `null` in internal plugin APIs
        const args = msg.args.map(arg => arg === null ? undefined : arg);

        const addToken = args.length && args[args.length - 1] === 'add.cancellation.token' ? args.pop() : false;
        if (addToken) {
            const tokenSource = new CancellationTokenSource();
            this.cancellationTokenSources[callId] = tokenSource;
            args.push(tokenSource.token);
        }
        this.invokedHandlers[callId] = this.invokeHandler(proxyId, msg.method, args);

        this.invokedHandlers[callId].then(r => {
            delete this.invokedHandlers[callId];
            delete this.cancellationTokenSources[callId];
            this.multiplexor.send(MessageFactory.replyOK(callId, r, this.messageToSendHostId));
        }, err => {
            delete this.invokedHandlers[callId];
            delete this.cancellationTokenSources[callId];
            this.multiplexor.send(MessageFactory.replyErr(callId, err, this.messageToSendHostId));
        });
    }

    private receiveReply(msg: ReplyMessage): void {
        const callId = msg.id;
        if (!this.pendingRPCReplies.hasOwnProperty(callId)) {
            return;
        }

        const pendingReply = this.pendingRPCReplies[callId];
        delete this.pendingRPCReplies[callId];

        pendingReply.resolve(msg.res);
    }

    private receiveReplyErr(msg: ReplyErrMessage): void {
        const callId = msg.id;
        if (!this.pendingRPCReplies.hasOwnProperty(callId)) {
            return;
        }

        const pendingReply = this.pendingRPCReplies[callId];
        delete this.pendingRPCReplies[callId];

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
        if (!this.locals[proxyId]) {
            throw new Error('Unknown actor ' + proxyId);
        }
        const actor = this.locals[proxyId];
        const method = actor[methodName];
        if (typeof method !== 'function') {
            throw new Error('Unknown method ' + methodName + ' on actor ' + proxyId);
        }
        return method.apply(actor, args);
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
class RPCMultiplexer {

    private readonly connection: MessageConnection;
    private readonly sendAccumulatedBound: () => void;

    private messagesToSend: string[];

    constructor(connection: MessageConnection, onMessage: (msg: string) => void, remoteHostId?: string) {
        this.connection = connection;
        this.sendAccumulatedBound = this.sendAccumulated.bind(this);

        this.messagesToSend = [];
        if (remoteHostId) {
            this.send(`{"setHostID":"${remoteHostId}"}`);
        }

        this.connection.onMessage((data: string[]) => {
            const len = data.length;
            for (let i = 0; i < len; i++) {
                onMessage(data[i]);
            }
        });
    }

    private sendAccumulated(): void {
        const tmp = this.messagesToSend;
        this.messagesToSend = [];
        this.connection.send(tmp);
    }

    public send(msg: string): void {
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

class MessageFactory {

    static cancel(req: string, messageToSendHostId?: string): string {
        let prefix = '';
        if (messageToSendHostId) {
            prefix = `"hostID":"${messageToSendHostId}",`;
        }
        return `{${prefix}"type":${MessageType.Cancel},"id":"${req}"}`;
    }

    public static request(req: string, rpcId: string, method: string, args: any[], messageToSendHostId?: string): string {
        let prefix = '';
        if (messageToSendHostId) {
            prefix = `"hostID":"${messageToSendHostId}",`;
        }
        return `{${prefix}"type":${MessageType.Request},"id":"${req}","proxyId":"${rpcId}","method":"${method}","args":${JSON.stringify(args, ObjectsTransferrer.replacer)}}`;
    }

    public static replyOK(req: string, res: any, messageToSendHostId?: string): string {
        let prefix = '';
        if (messageToSendHostId) {
            prefix = `"hostID":"${messageToSendHostId}",`;
        }
        if (typeof res === 'undefined') {
            return `{${prefix}"type":${MessageType.Reply},"id":"${req}"}`;
        }
        return `{${prefix}"type":${MessageType.Reply},"id":"${req}","res":${JSON.stringify(res, ObjectsTransferrer.replacer)}}`;
    }

    public static replyErr(req: string, err: any, messageToSendHostId?: string): string {
        let prefix = '';
        if (messageToSendHostId) {
            prefix = `"hostID":"${messageToSendHostId}",`;
        }
        if (err instanceof Error) {
            return `{${prefix}"type":${MessageType.ReplyErr},"id":"${req}","err":${JSON.stringify(transformErrorForSerialization(err))}}`;
        }
        return `{${prefix}"type":${MessageType.ReplyErr},"id":"${req}","err":null}`;
    }
}

/**
 * These functions are responsible for correct transferring objects via rpc channel.
 *
 * To reach that some specific kind of objects is converteed to json in some custom way
 * and then, after receiving, revived to objects again,
 * so there is feeling that object was transferred via rpc channel.
 *
 * To distinguish between regular and altered objects, field $type is added to altered ones.
 * Also value of that field specifies kind of the object.
 */
namespace ObjectsTransferrer {

    // tslint:disable-next-line:no-any
    export function replacer(key: string | undefined, value: any): any {
        if (value instanceof URI) {
            return {
                $type: SerializedObjectType.THEIA_URI,
                data: value.toString()
            } as SerializedObject;
        } else if (Range.is(value)) {
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
        }

        return value;
    }

    // tslint:disable-next-line:no-any
    export function reviver(key: string | undefined, value: any): any {
        if (isSerializedObject(value)) {
            switch (value.$type) {
                case SerializedObjectType.THEIA_URI:
                    return new URI(value.data);
                case SerializedObjectType.VSCODE_URI:
                    return VSCodeURI.parse(value.data);
                case SerializedObjectType.THEIA_RANGE:
                    // tslint:disable-next-line:no-any
                    const obj: any = JSON.parse(value.data);
                    // May require to use types-impl there instead of vscode lang server Range for the revival
                    return Range.create(Position.create(obj.start.line, obj.start.character), Position.create(obj.end.line, obj.end.character));
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
    THEIA_RANGE
}

function isSerializedObject(obj: any): obj is SerializedObject {
    return obj && obj.$type !== undefined && obj.data !== undefined;
}

const enum MessageType {
    Request = 1,
    Reply = 2,
    ReplyErr = 3,
    Cancel = 4
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
