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

import { Emitter, Event } from '../event';
import { Deferred } from '../promise-util';
import { Channel, MessageProvider } from './channel';
import { ReadBuffer } from './message-buffer';
import { RpcMessage, RpcMessageDecoder, RpcMessageEncoder, RpcMessageType } from './rpc-message-encoder';
import { CancellationToken, CancellationTokenSource } from '../../../shared/vscode-languageserver-protocol';

/**
 * Handles request messages received by the {@link RpcServer}.
 */
export type RequestHandler = (method: string, args: any[]) => Promise<any>;

const CANCELLATION_TOKEN_KEY = 'add.cancellation.token';
/**
 * Initialization options for {@link RpcClient}s and {@link RpcServer}s.
 */
export interface RpcInitializationOptions extends RPCConnectionOptions {
    /**
     * Boolean flag to indicate whether the client/server should be used as as standalone component or is part of
     * a {@link RpcConnection}. Default is `true`
     */
    standalone?: boolean,
}

/**
 * A `RpcServer` reads rcp request and notification messages and sends the reply values or
 * errors from the request to the channel.
 *  It can either be instantiated as a standalone component or as part of a {@link RpcConnection}.
 */
export class RpcServer {
    protected readonly encoder: RpcMessageEncoder;
    protected readonly decoder: RpcMessageDecoder;

    protected readonly onNotificationEmitter: Emitter<{ method: string; args: any[]; }> = new Emitter();
    protected readonly cancellationTokenSources = new Map<number, CancellationTokenSource>();

    get onNotification(): Event<{ method: string; args: any[]; }> {
        return this.onNotificationEmitter.event;
    }

    constructor(protected channel: Channel, public readonly requestHandler: RequestHandler, options: RpcInitializationOptions = {}) {
        this.encoder = options.encoder ?? new RpcMessageEncoder();
        this.decoder = options.decoder ?? new RpcMessageDecoder();
        if (options.standalone ?? true) {
            const registration = channel.onMessage((msg: MessageProvider) => this.handleMessage(this.decoder.parse(msg())));
            channel.onClose(() => registration.dispose());
        }
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
        }
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

        const addToken = args.length && args[args.length - 1] === CANCELLATION_TOKEN_KEY ? args.pop() : false;
        if (addToken) {
            const tokenSource = new CancellationTokenSource();
            this.cancellationTokenSources.set(id, tokenSource);
            args.push(tokenSource.token);
        }

        try {
            const result = await this.requestHandler(method, args);
            this.cancellationTokenSources.delete(id);
            this.encoder.replyOK(output, id, result);
        } catch (err) {
            this.cancellationTokenSources.delete(id);
            this.encoder.replyErr(output, id, err);
        }
        output.commit();
    }

    protected async handleNotify(id: number, method: string, args: any[]): Promise<void> {
        this.onNotificationEmitter.fire({ method, args });
    }
}

/**
 * A `RpcClient` sends requests and notifications to a remote server.
 * Clients can get a promise for the request result that will be either resolved or
 * rejected depending on the success of the request.
 * The `RpcClient` keeps track of outstanding requests and matches replies to the appropriate request
 * Currently, there is no timeout handling implemented in the client.
 * It can either be instantiated as a standalone component or as part of a {@link RpcConnection}.
 */
export class RpcClient {
    protected readonly pendingRequests: Map<number, Deferred<any>> = new Map();

    protected nextMessageId: number = 0;

    protected readonly encoder: RpcMessageEncoder;
    protected readonly decoder: RpcMessageDecoder;

    constructor(public readonly channel: Channel, options: RpcInitializationOptions = {}) {
        this.encoder = options.encoder ?? new RpcMessageEncoder();
        this.decoder = options.decoder ?? new RpcMessageDecoder();
        if (options.standalone ?? true) {
            const registration = channel.onMessage(readBuffer => this.handleMessage(this.decoder.parse(readBuffer())));
            channel.onClose(() => registration.dispose());
        }
    }

    handleMessage(message: RpcMessage): void {

        switch (message.type) {
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
            console.warn(`reply: no handler for message: ${id}`);
        }
    }

    protected handleReplyErr(id: number, error: any): void {
        try {
            const replyHandler = this.pendingRequests.get(id);
            if (replyHandler) {
                this.pendingRequests.delete(id);
                replyHandler.reject(error);
            } else {
                console.warn(`error: no handler for message: ${id}`);
            }
        } catch (err) {
            throw err;
        }
    }

    sendRequest<T>(method: string, args: any[]): Promise<T> {

        const id = this.nextMessageId++;
        const reply = new Deferred<T>();

        const cancellationToken: CancellationToken | undefined = args.length && CancellationToken.is(args[args.length - 1]) ? args.pop() : undefined;
        if (cancellationToken && cancellationToken.isCancellationRequested) {
            return Promise.reject(this.cancelError());
        }

        if (cancellationToken) {
            args.push(CANCELLATION_TOKEN_KEY);
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
}

/**
 * Initialization options for a {@link RpcConnection}.
 */
export interface RPCConnectionOptions {
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
 * A RpcConnection can be used to to establish a bi-directional RPC connection. It is capable of
 * both sending & receiving requests and notifications to/from the channel. It acts as
 * a {@link RpcServer} and a {@link RpcClient} at the same time.
 */
export class RpcConnection {
    protected rpcClient: RpcClient;
    protected rpcServer: RpcServer;
    protected decoder = new RpcMessageDecoder();

    get onNotification(): Event<{ method: string; args: any[]; }> {
        return this.rpcServer.onNotification;
    }

    constructor(readonly channel: Channel, public readonly requestHandler: (method: string, args: any[]) => Promise<any>, options: RPCConnectionOptions = {}) {
        this.decoder = options.decoder ?? new RpcMessageDecoder();
        this.rpcClient = new RpcClient(channel, { standalone: false, ...options });
        this.rpcServer = new RpcServer(channel, requestHandler, { standalone: false, ...options });
        const registration = channel.onMessage(data => this.handleMessage(data()));
        channel.onClose(() => registration.dispose());
    }

    handleMessage(data: ReadBuffer): void {
        const message = this.decoder.parse(data);
        switch (message.type) {
            case RpcMessageType.Reply:
            case RpcMessageType.ReplyErr: {
                this.rpcClient.handleMessage(message);
            }
            default:
                this.rpcServer.handleMessage(message);
        }
    }
    sendRequest<T>(method: string, args: any[]): Promise<T> {
        return this.rpcClient.sendRequest(method, args);
    }

    sendNotification(method: string, args: any[]): void {
        this.rpcClient.sendNotification(method, args);
    }
}
