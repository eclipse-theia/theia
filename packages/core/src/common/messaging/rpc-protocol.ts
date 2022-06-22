// *****************************************************************************
// Copyright (C) 2021 Red Hat, Inc. and others.
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

import { CancellationError, CancellationToken, CancellationTokenSource } from '../cancellation';
import { DisposableCollection } from '../disposable';
import { Emitter, Event } from '../event';
import { Deferred } from '../promise-util';
import { Channel } from './channel';

/**
 * This code lets you encode rpc protocol messages (request/reply/notification/error/cancel)
 * into a channel write buffer and decode the same messages from a read buffer.
 * Custom encoders/decoders can be registered to specially handling certain types of values
 * to be encoded. Clients are responsible for ensuring that the set of tags for encoders
 * is distinct and the same at both ends of a channel.
 */

export type RpcMessage = RequestMessage | ReplyMessage | ReplyErrMessage | CancelMessage | NotificationMessage;

export const enum RpcMessageType {
    Request = 1,
    Notification = 2,
    Reply = 3,
    ReplyErr = 4,
    Cancel = 5,
}

export interface CancelMessage {
    type: RpcMessageType.Cancel;
    id: number;
}

export interface RequestMessage {
    type: RpcMessageType.Request;
    id: number;
    method: string;
    args: any[];
}

export interface NotificationMessage {
    type: RpcMessageType.Notification;
    id: number;
    method: string;
    args: any[];
}

export interface ReplyMessage {
    type: RpcMessageType.Reply;
    id: number;
    result: any;
}

export interface ReplyErrMessage {
    type: RpcMessageType.ReplyErr;
    id: number;
    error: any;
}

/**
 * A special error that can be returned in case a request
 * has failed. Provides additional information i.e. an error code
 * and additional error data.
 */
export class ResponseError extends Error {
    constructor(readonly code: number, message: string, readonly data: any) {
        super(message);
    }
}

/**
 * Handles request messages received by the {@link RpcServer}.
 */
export type RequestHandler = (method: string, args: any[]) => Promise<any>;

/**
 * Establish a bi-directional RPC protocol on top of a given channel. Bi-directional means to send
 * sends requests and notifications to the remote side as well as receiving requests and notifications from the remote side.
 * Clients can get a promise for a remote request result that will be either resolved or
 * rejected depending on the success of the request. Keeps track of outstanding requests and matches replies to the appropriate request *
 * Currently, there is no timeout handling for long running requests implemented.
 */
export class RpcProtocol {
    static readonly CANCELLATION_TOKEN_KEY = 'add.cancellation.token';

    protected readonly pendingRequests: Map<number, Deferred<any>> = new Map();

    protected nextMessageId: number = 0;

    protected readonly onNotificationEmitter: Emitter<{ method: string; args: any[]; }> = new Emitter();
    protected readonly cancellationTokenSources = new Map<number, CancellationTokenSource>();

    get onNotification(): Event<{ method: string; args: any[]; }> {
        return this.onNotificationEmitter.event;
    }

    protected toDispose = new DisposableCollection();

    constructor(public readonly channel: Channel<RpcMessage>, public readonly requestHandler: RequestHandler) {
        this.toDispose.push(this.onNotificationEmitter);
        this.toDispose.push(channel.onMessage(message => this.handleMessage(message)));
        channel.onClose(() => this.toDispose.dispose());
    }

    protected handleMessage(message: RpcMessage): void {
        switch (message.type) {
            case RpcMessageType.Cancel: {
                this.handleCancel(message.id);
                break;
            }
            case RpcMessageType.Request: {
                this.handleRequest(message.id, message.method, message.args);
                break;
            }
            case RpcMessageType.Notification: {
                this.handleNotify(message.id, message.method, message.args);
                break;
            }
            case RpcMessageType.Reply: {
                this.handleReply(message.id, message.result);
                break;
            }
            case RpcMessageType.ReplyErr: {
                this.handleReplyErr(message.id, message.error);
                break;
            }
        }
    }

    protected handleReply(id: number, value: any): void {
        const replyHandler = this.pendingRequests.get(id);
        if (replyHandler) {
            this.pendingRequests.delete(id);
            replyHandler.resolve(value);
        } else {
            throw new Error(`No reply handler for reply with id: ${id}`);
        }
    }

    protected handleReplyErr(id: number, error: any): void {
        try {
            const replyHandler = this.pendingRequests.get(id);
            if (replyHandler) {
                this.pendingRequests.delete(id);
                replyHandler.reject(error);
            } else {
                throw new Error(`No reply handler for error reply with id: ${id}`);
            }
        } catch (err) {
            throw err;
        }
    }

    protected sendRpcMessage(message: RpcMessage): void {
        this.channel.send(message);
    }

    sendRequest<T>(method: string, args: any[]): Promise<T> {
        const id = this.nextMessageId++;
        const reply = new Deferred<T>();

        // The last element of the request args might be a cancellation token. As these tokens are not serializable we have to remove it from the
        // args array and the `CANCELLATION_TOKEN_KEY` string instead.
        const cancellationToken: CancellationToken | undefined = args.length && CancellationToken.is(args[args.length - 1]) ? args.pop() : undefined;
        if (cancellationToken && cancellationToken.isCancellationRequested) {
            return Promise.reject(new CancellationError());
        }

        if (cancellationToken) {
            args.push(RpcProtocol.CANCELLATION_TOKEN_KEY);
            cancellationToken.onCancellationRequested(() => {
                this.sendCancel(id);
            }
            );
        }
        this.pendingRequests.set(id, reply);

        this.sendRpcMessage({ type: RpcMessageType.Request, id, method, args });
        return reply.promise;
    }

    sendNotification(method: string, args: any[]): void {
        this.sendRpcMessage({ type: RpcMessageType.Notification, id: this.nextMessageId++, method, args });
    }

    sendCancel(requestId: number): void {
        this.sendRpcMessage({ type: RpcMessageType.Cancel, id: requestId });
    }

    protected handleCancel(id: number): void {
        const cancellationTokenSource = this.cancellationTokenSources.get(id);
        if (cancellationTokenSource) {
            this.cancellationTokenSources.delete(id);
            cancellationTokenSource.cancel();
        }
    }

    protected async handleRequest(id: number, method: string, args: any[]): Promise<void> {

        // Check if the last argument of the received args is the key for indicating that a cancellation token should be used
        // If so remove the key from the args and create a new cancellation token.
        const addToken = args.length && args[args.length - 1] === RpcProtocol.CANCELLATION_TOKEN_KEY ? args.pop() : false;
        if (addToken) {
            const tokenSource = new CancellationTokenSource();
            this.cancellationTokenSources.set(id, tokenSource);
            args.push(tokenSource.token);
        }

        try {
            const result = await this.requestHandler(method, args);
            this.cancellationTokenSources.delete(id);
            this.replyOK(id, result);
        } catch (err) {
            this.cancellationTokenSources.delete(id);
            this.replyError(id, err);
        }

    }

    protected replyOK(requestId: number, result: any): void {
        this.sendRpcMessage({ type: RpcMessageType.Reply, id: requestId, result });
    }

    protected replyError(requestId: number, error: any): void {
        this.sendRpcMessage({ type: RpcMessageType.ReplyErr, id: requestId, error });
    }

    protected async handleNotify(id: number, method: string, args: any[]): Promise<void> {
        if (this.toDispose.disposed) {
            return;
        }
        this.onNotificationEmitter.fire({ method, args });
    }
}
