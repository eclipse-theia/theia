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

import { serviceIdentifier } from './types';
import { AbstractConnection, Connection, ConnectionProvider, ConnectionState } from './connection';
import { Disposable, DisposableCollection } from './disposable';
import { Broker, Handler, Middleware, Router } from './routing';

export const ConnectionMultiplexer = serviceIdentifier<ConnectionMultiplexer<any>>('ConnectionMultiplexer');
export type ConnectionMultiplexer<T extends Connection<any>, P extends object = any> = ConnectionProvider<T, P> & Broker<T, P>;

/**
 * @internal
 *
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
export class DefaultConnectionMultiplexer implements ConnectionMultiplexer<Connection<unknown>> {

    protected idSequence = 1;
    protected channels = new Map<number, Channel<unknown>>();
    protected opening = new Set<number>();
    protected disposables = new DisposableCollection();
    protected transport?: Connection<ChannelMessage>;

    constructor(
        protected routerBroker: Router<unknown> & Broker<unknown>
    ) { }

    initialize<T, P extends object = any>(connection: Connection<ChannelMessage>): ConnectionMultiplexer<Connection<T>, P> {
        this.transport = connection;
        this.transport.onMessage(message => this.handleTransportMessage(message), undefined, this.disposables);
        this.transport.onClose(() => this.handleTransportClosed(), undefined, this.disposables);
        return this as ConnectionMultiplexer<Connection<T>, P>;
    }

    open(params: object): Connection<unknown> {
        const id = this.idSequence++;
        const channel = this.createChannel(id);
        this.registerChannel(channel);
        channel.sendOpen(params);
        return channel;
    }

    use(middleware: Middleware<any>): Disposable {
        return this.routerBroker.use(middleware);
    }

    listen(handler: Handler<any>): Disposable {
        return this.routerBroker.listen(handler);
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

    protected handleTransportMessage(message: ChannelMessage): void {
        if (message[0] === ChannelMessageType.OPEN) {
            const [, id, params] = message;
            if (id >= 0) {
                throw new Error(`expected id=${id} to be negative`);
            }
            if (this.channels.has(id)) {
                throw new Error(`a channel with id=${id} already exists`);
            }
            if (this.opening.has(id)) {
                throw new Error(`a channel with id=${id} is already being handled`);
            }
            this.opening.add(id);
            this.routerBroker.route(params, () => {
                this.opening.delete(id);
                const channel = this.createChannel(id);
                this.registerChannel(channel);
                this.sendChannelMessage([ChannelMessageType.READY, -id]);
                // Give time for handlers to attach events to `channel.onOpen(...)`
                queueMicrotask(() => channel.setOpen());
                return channel;
            }, () => {
                this.opening.delete(id);
                this.sendChannelMessage([ChannelMessageType.CLOSE, -id]);
            });
        } else if (message[0] === ChannelMessageType.READY) {
            const [, id] = message;
            this.getChannel(id).setOpen();
        } else if (message[0] === ChannelMessageType.MESSAGE) {
            const [, id, channelMessage] = message;
            this.getChannel(id).emitMessage(channelMessage);
        } else if (message[0] === ChannelMessageType.CLOSE) {
            const [, id] = message;
            this.getChannel(id).dispose();
        } else {
            throw new Error(`unhandled message: ${JSON.stringify(message)}`);
        }
    }

    protected sendChannelMessage(message: ChannelMessage): void {
        this.transport!.sendMessage(message);
    }

    protected handleTransportClosed(): void {
        this.disposables.dispose();
        this.channels.forEach(channel => channel.dispose());
        if (this.channels.size > 0) {
            console.warn('some channels might be leaked!');
        }
    }
}

/**
 * @internal
 */
export class Channel<T> extends AbstractConnection<T> {

    state = ConnectionState.OPENING;

    constructor(
        public id: number,
        protected sendChannelMessage: (message: ChannelMessage) => void
    ) {
        super();
    }

    sendOpen(params: object): void {
        this.ensureState(ConnectionState.OPENING);
        this.sendChannelMessage([ChannelMessageType.OPEN, -this.id, params]);
    }

    setOpen(): void {
        this.setOpenedAndEmit();
    }

    emitMessage(message: any): void {
        this.onMessageEmitter.fire(message);
    }

    sendMessage(message: any): void {
        this.sendChannelMessage([ChannelMessageType.MESSAGE, -this.id, message]);
    }

    close(): void {
        this.sendChannelMessage([ChannelMessageType.CLOSE, -this.id]);
        this.dispose();
    }

    override dispose(): void {
        this.setClosedAndEmit();
        super.dispose();
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
