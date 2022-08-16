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

import { CancellationToken, CancellationTokenSource } from '../cancellation';
import { DisposableCollection } from '../disposable';
import { Emitter, Event } from '../event';
import { Deferred } from '../promise-util';
import { Channel } from './channel';
import { MsgPackMessageDecoder, MsgPackMessageEncoder, RpcMessage, RpcMessageDecoder, RpcMessageEncoder, RpcMessageType } from './rpc-message-encoder';
import { Uint8ArrayWriteBuffer } from './uint8-array-message-buffer';

/**
 * Handles request messages received by the {@link RpcServer}.
 */
export type RequestHandler = (method: string, args: any[]) => Promise<any>;

/**
 * Initialization options for a {@link RpcProtocol}.
 */
export interface RpcProtocolOptions {
    /**
     * The message encoder that should be used. If `undefined` the default {@link RpcMessageEncoder} will be used.
     */
    encoder?: RpcMessageEncoder,
    /**
     * The message decoder that should be used. If `undefined` the default {@link RpcMessageDecoder} will be used.
     */
    decoder?: RpcMessageDecoder
}

/**
 * Establish a bi-directional RPC protocol on top of a given channel. Bi-directional means to send
 * sends requests and notifications to the remote side as well as receiving requests and notifications from the remote side.
 * Clients can get a promise for a remote request result that will be either resolved or
 * rejected depending on the success of the request. Keeps track of outstanding requests and matches replies to the appropriate request
 * Currently, there is no timeout handling for long running requests implemented.
 */
export class RpcProtocol {
    static readonly CANCELLATION_TOKEN_KEY = 'add.cancellation.token';

    protected readonly pendingRequests: Map<number, Deferred<any>> = new Map();

    protected nextMessageId: number = 0;

    protected readonly encoder: RpcMessageEncoder;
    protected readonly decoder: RpcMessageDecoder;

    protected readonly onNotificationEmitter: Emitter<{ method: string; args: any[]; }> = new Emitter();
    protected readonly cancellationTokenSources = new Map<number, CancellationTokenSource>();

    get onNotification(): Event<{ method: string; args: any[]; }> {
        return this.onNotificationEmitter.event;
    }

    protected toDispose = new DisposableCollection();

    constructor(public readonly channel: Channel, public readonly requestHandler: RequestHandler, options: RpcProtocolOptions = {}) {
        this.encoder = options.encoder ?? new MsgPackMessageEncoder();
        this.decoder = options.decoder ?? new MsgPackMessageDecoder();
        this.toDispose.push(this.onNotificationEmitter);
        this.toDispose.push(channel.onMessage(readBuffer => this.handleMessage(this.decoder.parse(readBuffer()))));
        channel.onClose(() => this.toDispose.dispose());
    }

    handleMessage(message: RpcMessage): void {
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
                this.handleReply(message.id, message.res);
                break;
            }
            case RpcMessageType.ReplyErr: {
                this.handleReplyErr(message.id, message.err);
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

    sendRequest<T>(method: string, args: any[]): Promise<T> {
        const id = this.nextMessageId++;
        const reply = new Deferred<T>();

        // The last element of the request args might be a cancellation token. As these tokens are not serializable we have to remove it from the
        // args array and the `CANCELLATION_TOKEN_KEY` string instead.
        const cancellationToken: CancellationToken | undefined = args.length && CancellationToken.is(args[args.length - 1]) ? args.pop() : undefined;
        if (cancellationToken && cancellationToken.isCancellationRequested) {
            return Promise.reject(this.cancelError());
        }

        if (cancellationToken) {
            args.push(RpcProtocol.CANCELLATION_TOKEN_KEY);
            cancellationToken.onCancellationRequested(() => {
                this.sendCancel(id);
                this.pendingRequests.get(id)?.reject(this.cancelError());
            }
            );
        }
        this.pendingRequests.set(id, reply);

        const output = this.channel.getWriteBuffer();
        this.encoder.request(output, id, method, args);
        output.commit();
        return reply.promise;
    }

    sendNotification(method: string, args: any[]): void {
        const output = this.channel.getWriteBuffer();
        this.encoder.notification(output, this.nextMessageId++, method, args);
        output.commit();
    }

    sendCancel(requestId: number): void {
        const output = this.channel.getWriteBuffer();
        this.encoder.cancel(output, requestId);
        output.commit();
    }

    cancelError(): Error {
        const error = new Error('"Request has already been canceled by the sender"');
        error.name = 'Cancel';
        return error;
    }

    protected handleCancel(id: number): void {
        const cancellationTokenSource = this.cancellationTokenSources.get(id);
        if (cancellationTokenSource) {
            this.cancellationTokenSources.delete(id);
            cancellationTokenSource.cancel();
        }
    }

    protected async handleRequest(id: number, method: string, args: any[]): Promise<void> {
        const output = this.channel.getWriteBuffer();

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
            this.encoder.replyOK(output, id, result);
            output.commit();
        } catch (err) {
            // In case of an error the output buffer might already contains parts of an message.
            // => Dispose the current buffer and retrieve a new, clean one for writing the response error.
            if (output instanceof Uint8ArrayWriteBuffer) {
                output.dispose();
            }
            const errorOutput = this.channel.getWriteBuffer();
            this.cancellationTokenSources.delete(id);
            this.encoder.replyErr(errorOutput, id, err);
            errorOutput.commit();
        }
    }

    protected async handleNotify(id: number, method: string, args: any[]): Promise<void> {
        if (this.toDispose.disposed) {
            return;
        }
        this.onNotificationEmitter.fire({ method, args });
    }
}
