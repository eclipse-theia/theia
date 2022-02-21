/********************************************************************************
 * Copyright (C) 2021 Red Hat, Inc. and others.
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
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Emitter, Event } from '../event';
import { Deferred } from '../promise-util';
import { Channel } from './channel';
import { ReadBuffer } from './message-buffer';
import { MessageDecoder, MessageEncoder, MessageType } from './message-encoder';
/**
 * A RCPServer reads rcp request and notification messages and sends the reply values or
 * errors from the request to the channel.
 */
export class RPCServer {
    protected readonly encoder: MessageEncoder = new MessageEncoder();
    protected readonly decoder: MessageDecoder = new MessageDecoder();
    protected onNotificationEmitter: Emitter<{ method: string; args: any[]; }> = new Emitter();

    get onNotification(): Event<{ method: string; args: any[]; }> {
        return this.onNotificationEmitter.event;
    }

    constructor(protected channel: Channel, public readonly requestHandler: (method: string, args: any[]) => Promise<any>) {
        const registration = channel.onMessage((data: ReadBuffer) => this.handleMessage(data));
        channel.onClose(() => registration.dispose());
    }

    handleMessage(data: ReadBuffer): void {
        const message = this.decoder.parse(data);
        switch (message.type) {
            case MessageType.Cancel: {
                this.handleCancel(message.id);
                break;
            }
            case MessageType.Request: {
                this.handleRequest(message.id, message.method, message.args);
                break;
            }
            case MessageType.Notification: {
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
            // console.log(`handling request ${method} with id ${id}`);
            const result = await this.requestHandler(method, args);
            this.encoder.replyOK(output, id, result);
            // console.log(`handled request ${method} with id ${id}`);
        } catch (err) {
            this.encoder.replyErr(output, id, err);
            console.log(`error on request ${method} with id ${id}`);
        }
        output.commit();
    }

    protected async handleNotify(id: number, method: string, args: any[]): Promise<void> {
        // console.log(`handling notification ${method} with id ${id}`);
        this.onNotificationEmitter.fire({ method, args });
    }
}

/**
 * An RpcClient sends requests and notifications to a remote server.
 * Clients can get a promise for the request result that will be either resolved or
 * rejected depending on the success of the request.
 * The RpcClient keeps track of outstanding requests and matches replies to the appropriate request
 * Currently, there is no timeout handling implemented in the client.
 */
export class RpcClient {
    protected readonly pendingRequests: Map<number, Deferred<any>> = new Map();
    protected nextMessageId: number = 0;

    protected readonly encoder: MessageEncoder = new MessageEncoder();
    protected readonly decoder: MessageDecoder = new MessageDecoder();

    constructor(protected channel: Channel) {
        const registration = channel.onMessage((data: ReadBuffer) => this.handleMessage(data));
        channel.onClose(() => registration.dispose());
    }

    handleMessage(data: ReadBuffer): void {
        const message = this.decoder.parse(data);
        switch (message.type) {
            case MessageType.Reply: {
                this.handleReply(message.id, message.res);
                break;
            }
            case MessageType.ReplyErr: {
                this.handleReplyErr(message.id, message.err);
                break;
            }
        }
    }

    protected handleReply(id: number, value: any): void {
        const replyHandler = this.pendingRequests.get(id);
        // console.log(`received reply with id ${id}`);
        if (replyHandler) {
            this.pendingRequests.delete(id);
            replyHandler.resolve(value);
        } else {
            console.warn(`reply: no handler for message: ${id}`);
        }
    }

    protected handleReplyErr(id: number, error: any): void {
        const replyHandler = this.pendingRequests.get(id);
        if (replyHandler) {
            this.pendingRequests.delete(id);
            // console.log(`received error id ${id}`);
            replyHandler.reject(error);
        } else {
            console.warn(`error: no handler for message: ${id}`);
        }
    }

    sendRequest<T>(method: string, args: any[]): Promise<T> {
        const id = this.nextMessageId++;
        const reply = new Deferred<T>();
        // console.log(`sending request ${method} with id ${id}`);

        this.pendingRequests.set(id, reply);
        const output = this.channel.getWriteBuffer();
        this.encoder.request(output, id, method, args);
        output.commit();
        return reply.promise;
    }

    sendNotification(method: string, args: any[]): void {
        // console.log(`sending notification ${method} with id ${this.nextMessageId + 1}`);
        const output = this.channel.getWriteBuffer();
        this.encoder.notification(output, this.nextMessageId++, method, args);
        output.commit();
    }
}
