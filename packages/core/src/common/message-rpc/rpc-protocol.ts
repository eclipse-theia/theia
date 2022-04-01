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
import { Channel, ReadBufferFactory } from './channel';
import { ReadBuffer } from './message-buffer';
import { RpcMessageDecoder, RpcMessageEncoder, RpcMessageType } from './rpc-message-encoder';

/**
 * Handles request messages received by the {@link RpcServer}.
 */
export type RequestHandler = (method: string, args: any[]) => Promise<any>;

/**
 * A RpcServer reads rcp request and notification messages and sends the reply values or
 * errors from the request to the channel.
 */
export class RpcServer {
    protected readonly encoder = new RpcMessageEncoder();
    protected readonly decoder = new RpcMessageDecoder();
    protected onNotificationEmitter: Emitter<{ method: string; args: any[]; }> = new Emitter();

    get onNotification(): Event<{ method: string; args: any[]; }> {
        return this.onNotificationEmitter.event;
    }

    constructor(protected channel: Channel, public readonly requestHandler: RequestHandler) {
        const registration = channel.onMessage((msg: ReadBufferFactory) => this.handleMessage(msg()));
        channel.onClose(() => registration.dispose());
    }

    handleMessage(data: ReadBuffer): void {
        const message = this.decoder.parse(data);
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
        // implement cancellation
        /*        const token = this.cancellationTokens.get(id);
                if (token) {
                    this.cancellationTokens.delete(id);
                    token.cancel();
                } else {
                    console.warn(`cancel: no token for message: ${id}`);
                }*/
    }

    protected async handleRequest(id: number, method: string, args: any[]): Promise<void> {

        const output = this.channel.getWriteBuffer();
        try {

            const result = await this.requestHandler(method, args);
            this.encoder.replyOK(output, id, result);
        } catch (err) {
            this.encoder.replyErr(output, id, err);
        }
        output.commit();
    }

    protected async handleNotify(id: number, method: string, args: any[]): Promise<void> {
        this.onNotificationEmitter.fire({ method, args });
    }
}

/**
 * An RpClient sends requests and notifications to a remote server.
 * Clients can get a promise for the request result that will be either resolved or
 * rejected depending on the success of the request.
 * The RpcClient keeps track of outstanding requests and matches replies to the appropriate request
 * Currently, there is no timeout handling implemented in the client.
 */
export class RpcClient {
    protected readonly pendingRequests: Map<number, Deferred<any>> = new Map();

    protected nextMessageId: number = 0;

    protected readonly encoder = new RpcMessageEncoder();
    protected readonly decoder = new RpcMessageDecoder();

    constructor(public readonly channel: Channel) {
        const registration = channel.onMessage(data => this.handleMessage(data()));
        channel.onClose(() => registration.dispose());
    }

    handleMessage(data: ReadBuffer): void {
        const message = this.decoder.parse(data);
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
}
/**
 * A RpcConnection can be used to to establish a bi-directional RPC connection. It is capable of
 * both sending & receiving requests and notifications to/from the channel. It acts a
 * both a {@link RpcServer} and a {@link RpcClient}
 */
export class RpcConnection {
    protected rpcClient: RpcClient;
    protected rpcServer: RpcServer;

    get onNotification(): Event<{ method: string; args: any[]; }> {
        return this.rpcServer.onNotification;
    }

    constructor(readonly channel: Channel, public readonly requestHandler: (method: string, args: any[]) => Promise<any>) {
        this.rpcClient = new RpcClient(channel);
        this.rpcServer = new RpcServer(channel, requestHandler);
    }
    sendRequest<T>(method: string, args: any[]): Promise<T> {
        return this.rpcClient.sendRequest(method, args);
    }

    sendNotification(method: string, args: any[]): void {
        this.rpcClient.sendNotification(method, args);
    }
}

