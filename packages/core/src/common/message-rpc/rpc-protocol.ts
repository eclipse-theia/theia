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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
/* eslint-disable @typescript-eslint/no-explicit-any */

import { CancellationToken, CancellationTokenSource } from '../cancellation';
import { DisposableWrapper, Disposable, DisposableCollection } from '../disposable';
import { Emitter, Event } from '../event';
import { Deferred } from '../promise-util';
import { Channel } from './channel';
import { MsgPackMessageDecoder, MsgPackMessageEncoder, RpcMessage, RpcMessageDecoder, RpcMessageEncoder, RpcMessageType } from './rpc-message-encoder';

/**
 * Handles request messages received by the {@link RPCProtocol}.
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
    decoder?: RpcMessageDecoder,
    /**
     * The runtime mode determines whether the RPC protocol is bi-directional (default) or acts as a client or server only.
     */
    mode?: 'default' | 'clientOnly' | 'serverOnly'
}

/**
 * Establish a RPC protocol on top of a given channel. By default the rpc protocol is bi-directional, meaning it is possible to send
 * requests and notifications to the remote side (i.e. acts as client) as well as receiving requests and notifications from the remote side (i.e. acts as a server).
 * Clients can get a promise for a remote request result that will be either resolved or
 * rejected depending on the success of the request. Keeps track of outstanding requests and matches replies to the appropriate request
 * Currently, there is no timeout handling for long running requests implemented.
 * The bi-directional mode can be reconfigured using the {@link RpcProtocolOptions} to construct an RPC protocol instance that acts only as client or server instead.
 */
export class RpcProtocol {
    static readonly CANCELLATION_TOKEN_KEY = 'add.cancellation.token';

    protected readonly pendingRequests: Map<number, Deferred<any>> = new Map();
    protected readonly pendingRequestCancellationEventListeners: Map<number, DisposableWrapper> = new Map();

    protected nextMessageId: number = 0;

    protected readonly encoder: RpcMessageEncoder;
    protected readonly decoder: RpcMessageDecoder;
    protected readonly mode: 'default' | 'clientOnly' | 'serverOnly';

    protected readonly onNotificationEmitter: Emitter<{ method: string; args: any[]; }> = new Emitter();
    protected readonly cancellationTokenSources = new Map<number, CancellationTokenSource>();

    get onNotification(): Event<{ method: string; args: any[]; }> {
        return this.onNotificationEmitter.event;
    }

    protected toDispose = new DisposableCollection();

    constructor(public readonly channel: Channel, public readonly requestHandler: RequestHandler | undefined, options: RpcProtocolOptions = {}) {
        this.encoder = options.encoder ?? new MsgPackMessageEncoder();
        this.decoder = options.decoder ?? new MsgPackMessageDecoder();
        this.toDispose.push(this.onNotificationEmitter);
        channel.onClose(event => {
            this.pendingRequests.forEach(pending => pending.reject(new Error(event.reason)));
            this.pendingRequests.clear();
            this.pendingRequestCancellationEventListeners.forEach(disposable => disposable.dispose());
            this.pendingRequestCancellationEventListeners.clear();
            this.toDispose.dispose();
        });
        this.toDispose.push(channel.onMessage(readBuffer => this.handleMessage(this.decoder.parse(readBuffer()))));
        this.mode = options.mode ?? 'default';

        if (this.mode !== 'clientOnly' && requestHandler === undefined) {
            console.error('RPCProtocol was initialized without a request handler but was not set to clientOnly mode.');
        }
    }

    handleMessage(message: RpcMessage): void {
        if (this.mode !== 'clientOnly') {
            switch (message.type) {
                case RpcMessageType.Cancel: {
                    this.handleCancel(message.id);
                    return;
                }
                case RpcMessageType.Request: {
                    this.handleRequest(message.id, message.method, message.args);
                    return;
                }
                case RpcMessageType.Notification: {
                    this.handleNotify(message.method, message.args, message.id);
                    return;
                }
            }
        }
        if (this.mode !== 'serverOnly') {
            switch (message.type) {
                case RpcMessageType.Reply: {
                    this.handleReply(message.id, message.res);
                    return;
                }
                case RpcMessageType.ReplyErr: {
                    this.handleReplyErr(message.id, message.err);
                    return;
                }
            }
        }
        // If the message was not handled until here, it is incompatible with the mode.
        console.warn(`Received message incompatible with this RPCProtocol's mode '${this.mode}'. Type: ${message.type}. ID: ${message.id}.`);
    }

    protected handleReply(id: number, value: any): void {
        const replyHandler = this.pendingRequests.get(id);
        if (replyHandler) {
            this.pendingRequests.delete(id);
            replyHandler.resolve(value);
        } else {
            // Late replies for cancelled/timed-out requests are non-critical - just warn
            console.warn(`No reply handler for reply with id: ${id}`);
            return;
        }
        this.disposeCancellationEventListener(id);
    }

    protected handleReplyErr(id: number, error: any): void {
        const replyHandler = this.pendingRequests.get(id);
        if (replyHandler) {
            this.pendingRequests.delete(id);
            replyHandler.reject(error);
        } else {
            // Late error replies for cancelled/timed-out requests are non-critical - just warn
            console.warn(`No reply handler for error reply with id: ${id}`);
            return;
        }
        this.disposeCancellationEventListener(id);
    }

    protected disposeCancellationEventListener(id: number): void {
        const toDispose = this.pendingRequestCancellationEventListeners.get(id);
        if (toDispose) {
            this.pendingRequestCancellationEventListeners.delete(id);
            toDispose.dispose();
        }
    }

    sendRequest<T>(method: string, args: any[]): Promise<T> {
        // The last element of the request args might be a cancellation token. As these tokens are not serializable we have to remove it from the
        // args array and the `CANCELLATION_TOKEN_KEY` string instead.
        const cancellationToken: CancellationToken | undefined = args.length && CancellationToken.is(args[args.length - 1]) ? args.pop() : undefined;

        const id = this.nextMessageId++;
        const reply = new Deferred<T>();

        if (cancellationToken) {
            args.push(RpcProtocol.CANCELLATION_TOKEN_KEY);
        }

        this.pendingRequests.set(id, reply);

        // register disposable before output.commit() even when not available yet
        const disposableWrapper = new DisposableWrapper();
        this.pendingRequestCancellationEventListeners.set(id, disposableWrapper);

        const output = this.channel.getWriteBuffer();
        this.encoder.request(output, id, method, args);
        output.commit();

        if (cancellationToken?.isCancellationRequested) {
            this.sendCancel(id);
        } else {
            const disposable = cancellationToken?.onCancellationRequested(() => this.sendCancel(id));
            if (disposable) {
                disposableWrapper.set(disposable);
            }
        }

        return reply.promise;
    }

    sendNotification(method: string, args: any[]): void {
        // If the notification supports a CancellationToken, it needs to be treated like a request
        // because cancellation does not work with the simplified "fire and forget" approach of simple notifications.
        if (args.length && CancellationToken.is(args[args.length - 1])) {
            this.sendRequest(method, args);
            return;
        }

        const output = this.channel.getWriteBuffer();
        this.encoder.notification(output, method, args, this.nextMessageId++);
        output.commit();
    }

    sendCancel(requestId: number): void {
        const output = this.channel.getWriteBuffer();
        this.encoder.cancel(output, requestId);
        output.commit();
    }

    protected handleCancel(id: number): void {
        const cancellationTokenSource = this.cancellationTokenSources.get(id);
        if (cancellationTokenSource) {
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
            const result = await this.requestHandler!(method, args);
            this.cancellationTokenSources.delete(id);
            this.encoder.replyOK(output, id, result);
            output.commit();
        } catch (err) {
            // In case of an error the output buffer might already contains parts of an message.
            // => Dispose the current buffer and retrieve a new, clean one for writing the response error.
            if (Disposable.is(output)) {
                output.dispose();
            }
            const errorOutput = this.channel.getWriteBuffer();
            this.cancellationTokenSources.delete(id);
            this.encoder.replyErr(errorOutput, id, err);
            errorOutput.commit();
        }
    }

    protected async handleNotify(method: string, args: any[], id?: number): Promise<void> {
        if (this.toDispose.disposed) {
            return;
        }
        this.onNotificationEmitter.fire({ method, args });
    }
}
