// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { injectable } from 'inversify';
import { AbstractConnection, Connection, ConnectionEmitter, ConnectionEmitterHandler, ConnectionProvider, ConnectionProviderOpenParams, ConnectionState } from './connection';

/**
 * This default implementation follows a simple protocol to open channels:
 *
 * 1) Send a `[OPEN, id, params]` message to request opening a new channel.
 * 2) Remote must accept or refuse the channel creation request:
 *     - Accept: Send `[READY, id]`.
 *     - Refuse: Send `[CLOSE, id]`.
 * 3) Send `[MESSAGE, id, message]` to send messages to the remote channel.
 * 4) Send `[CLOSE, id]` to terminate the remote channel.
 *
 * Both endpoints can open channels (bidirectional). Now since multiplexers on
 * either side of the connection are unaware of the other's channel ID sequence,
 * there is a small trick used in this implementation to avoid ID collisions:
 *
 * When a given endpoint opens a new channel it uses a positive integer internally
 * but it should send out the negated ID to the remote.
 *
 * Then for each message sent we keep negating the ID from what's internally used
 * so that it matches the remote's mapping.
 *
 * One way to see it is that each endpoint's internal map is a mirror of the other:
 * `Channel(1)` on one side is `Channel(-1)` on the other side.
 */
@injectable()
export class DefaultConnectionMultiplexer implements ConnectionProvider<unknown>, ConnectionEmitter<unknown> {

    protected idSequence = 0;
    protected channels = new Map<number, Channel<unknown>>();
    protected handlers: ConnectionEmitterHandler<unknown, any>[] = [];
    protected transport?: Connection<ChannelMessage>;

    initialize<T, P extends object = any>(connection: Connection<ChannelMessage>): ConnectionProvider<T, P> & ConnectionEmitter<T, P> {
        this.transport = connection;
        connection.onMessage(message => this.handleMessage(message));
        return this as ConnectionProvider<T> & ConnectionEmitter<T>;
    }

    open({ mode, ...params }: ConnectionProviderOpenParams): Connection<unknown> {
        const id = this.idSequence++;
        const channel = this.createChannel(id);
        this.registerChannel(channel);
        channel.open(params);
        return channel;
    }

    listen(accept: ConnectionEmitterHandler<unknown, any>): void {
        this.handlers.push(accept);
    }

    protected createChannel(id: number): Channel<unknown> {
        return new Channel(id, message => this.sendChannelMessage(message));
    }

    protected registerChannel(channel: Channel<unknown>): void {
        this.channels.set(channel.id, channel);
        channel.onClose(() => {
            this.channels.delete(channel.id);
        });
    }

    protected getChannel(id: number): Channel<unknown> {
        const channel = this.channels.get(id);
        if (!channel) {
            throw new Error(`channel not found: id=${id}`);
        }
        return channel;
    }

    protected handleMessage(message: ChannelMessage): void {
        if (message[0] === ChannelMessageType.OPEN) {
            const [, id, params] = message;
            if (id >= 0) {
                this.sendChannelMessage([ChannelMessageType.CLOSE, -id]);
                throw new Error('incoming channel id should be negative');
            }
            const channel = this.createChannel(id);
            this.acceptChannel(channel, params).then(accept => {
                if (accept) {
                    this.registerChannel(channel);
                    this.sendChannelMessage([ChannelMessageType.READY, -id]);
                } else {
                    this.sendChannelMessage([ChannelMessageType.CLOSE, -id]);
                }
            });
        } else if (message[0] === ChannelMessageType.READY) {
            const [, id] = message;
            this.getChannel(id).setOpen();
        } else if (message[0] === ChannelMessageType.MESSAGE) {
            const [, id, channelMessage] = message;
            this.getChannel(id).emitMessage(channelMessage);
        } else if (message[0] === ChannelMessageType.CLOSE) {
            const [, id] = message;
            this.getChannel(id).close();
        } else {
            throw new Error('unhandled message');
        }
    }

    protected async acceptChannel(channel: Channel<unknown>, params: any): Promise<boolean> {
        for (const handler of this.handlers) {
            try {
                if (await handler(channel, params)) {
                    return true;
                }
            } catch (error) {
                console.error(error);
            }
        }
        return false;
    }

    protected sendChannelMessage(message: ChannelMessage): void {
        this.transport!.sendMessage(message);
    }
}

export class Channel<T> extends AbstractConnection<T> {

    state = ConnectionState.CLOSED;

    constructor(
        public id: number,
        protected sendChannelMessage: (message: ChannelMessage) => void
    ) {
        super();
    }

    open(params: object): void {
        if (this.state !== ConnectionState.CLOSED) { throw new Error('Connection should be closed!'); }
        this.sendChannelMessage([ChannelMessageType.OPEN, -this.id, params]);
        this.state = ConnectionState.OPENING;
    }

    setOpen(): void {
        if (this.state !== ConnectionState.OPENING) { throw new Error('Connection should be opening!'); }
        this.state = ConnectionState.OPENED;
    }

    emitMessage(message: any): void {
        this._onMessageEmitter.fire(message);
    }

    sendMessage(message: any): void {
        this.sendChannelMessage([ChannelMessageType.MESSAGE, -this.id, message]);
    }

    close(): void {
        this.sendChannelMessage([ChannelMessageType.CLOSE, -this.id]);
        this.state = ConnectionState.CLOSED;
        this._onCloseEmitter.fire();
    }
}

export type ChannelMessage =
    [type: ChannelMessageType.OPEN, id: number, params: object] |
    [type: ChannelMessageType.READY, id: number] |
    [type: ChannelMessageType.MESSAGE, id: number, message: any] |
    [type: ChannelMessageType.CLOSE, id: number];

export enum ChannelMessageType {
    OPEN,
    READY,
    MESSAGE,
    CLOSE
}
