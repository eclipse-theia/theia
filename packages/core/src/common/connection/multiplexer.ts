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

import { Disposable, DisposableCollection } from '../disposable';
import { Broker, Handler, Middleware, Router } from '../routing';
import { serviceIdentifier } from '../types';
import { AbstractConnection, Connection } from './connection';
import { ConnectionProvider } from './routing';

export const ConnectionMultiplexer = serviceIdentifier<ConnectionMultiplexer<any>>('ConnectionMultiplexer');
export type ConnectionMultiplexer<T extends Connection<any>, P extends object = any> = ConnectionProvider<T, P> & Broker<T, P>;

export namespace Multiplexing {

    export enum MessageType {
        OPEN,
        READY,
        MESSAGE,
        CLOSE
    }

    export class OpenMessage {
        type = MessageType.OPEN as const;
        constructor(
            public id: number,
            public params: object
        ) { }
    }

    export class ReadyMessage {
        type = MessageType.READY as const;
        constructor(
            public id: number
        ) { }
    }

    export class ChannelMessage {
        type = MessageType.MESSAGE as const;
        constructor(
            public id: number,
            public message: any
        ) { }
    }

    export class CloseMessage {
        type = MessageType.CLOSE as const;
        constructor(
            public id: number
        ) { }
    }

    export type Message =
        OpenMessage |
        ReadyMessage |
        ChannelMessage |
        CloseMessage;
}

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
    protected disposables = new DisposableCollection();
    protected transport?: Connection<Multiplexing.Message>;

    constructor(
        protected routerBroker: Router<unknown> & Broker<unknown>
    ) { }

    initialize<T, P extends object = any>(transport: Connection<Multiplexing.Message>): ConnectionMultiplexer<Connection<T>, P> {
        this.transport = transport;
        this.transport.onMessage(message => this.handleTransportMessage(message), undefined, this.disposables);
        this.transport.onClose(() => this.handleTransportClosed(), undefined, this.disposables);
        return this as ConnectionMultiplexer<Connection<T>, P>;
    }

    open(params: object): Connection<unknown> {
        const localId = this.idSequence++;
        const channel = this.createChannel(localId);
        this.registerChannel(channel);
        channel.open(params);
        return channel;
    }

    use(middleware: Middleware<any>): Disposable {
        return this.routerBroker.use(middleware);
    }

    listen(handler: Handler<any>): Disposable {
        return this.routerBroker.listen(handler);
    }

    protected createChannel(localId: number): Channel<unknown> {
        return new Channel(-localId, message => this.sendChannelMessage(message));
    }

    protected registerChannel(channel: Channel<unknown>): void {
        const localId = -channel.remoteId;
        this.channels.set(localId, channel);
        channel.onClose(() => {
            this.channels.delete(localId);
        });
    }

    protected getChannel(id: number): Channel<unknown> {
        const channel = this.channels.get(id);
        if (!channel) {
            throw new Error(`channel not found: id=${id}`);
        }
        return channel;
    }

    protected handleTransportMessage(message: Multiplexing.Message): void {
        switch (message.type) {
            case Multiplexing.MessageType.OPEN: return this.handleOpenMessage(message);
            case Multiplexing.MessageType.READY: return this.handleReadyMessage(message);
            case Multiplexing.MessageType.MESSAGE: return this.handleChannelMessage(message);
            case Multiplexing.MessageType.CLOSE: return this.handleCloseMessage(message);
            default: throw new Error(`unhandled message: ${JSON.stringify(message)}`);
        }
    }

    protected handleOpenMessage(message: Multiplexing.OpenMessage): void {
        const localId = message.id;
        if (localId > 0) {
            throw new Error(`unexpected positive id=${localId}`);
        }
        if (this.channels.has(localId)) {
            throw new Error(`a channel with id=${localId} already exists`);
        }
        const channel = this.createChannel(localId);
        this.registerChannel(channel);
        const accepted = () => channel.setReady();
        const unhandled = () => channel.close();
        this.routerBroker.route(message.params, accepted, unhandled);
    }

    protected handleReadyMessage(message: Multiplexing.ReadyMessage): void {
        // Prevent the remote from sending OPEN + READY to force open a channel:
        if (message.id < 0) {
            throw new Error(`invalid ready message: id=${message.id}`);
        }
        this.getChannel(message.id).remoteSetReady();
    }

    protected handleChannelMessage(message: Multiplexing.ChannelMessage): void {
        this.getChannel(message.id).remoteSendMessage(message.message);
    }

    protected handleCloseMessage(message: Multiplexing.CloseMessage): void {
        this.getChannel(message.id).remoteClose();
    }

    protected sendChannelMessage(message: Multiplexing.Message): void {
        this.transport!.sendMessage(message);
    }

    protected handleTransportClosed(): void {
        this.disposables.dispose();
        this.channels.forEach(channel => channel.close());
        if (this.channels.size > 0) {
            console.warn('some channels might be leaked!', this.channels.size);
        }
    }
}

/**
 * @internal
 *
 * Instances of this class act as "puppet-handles" being controlled by their
 * owning multiplexer.
 */
export class Channel<T> extends AbstractConnection<T> {

    state = Connection.State.OPENING;

    constructor(
        public remoteId: number,
        protected sendChannelMessage: (message: Multiplexing.Message) => void
    ) {
        super();
    }

    open(params: object): void {
        this.ensureState(Connection.State.OPENING);
        this.sendChannelMessage(new Multiplexing.OpenMessage(this.remoteId, params));
    }

    setReady(): this {
        this.sendChannelMessage(new Multiplexing.ReadyMessage(this.remoteId));
        this.setOpenedAndEmit();
        return this;
    }

    remoteSetReady(): void {
        this.setOpenedAndEmit();
    }

    remoteSendMessage(message: any): void {
        this.ensureState(Connection.State.OPENED);
        this.onMessageEmitter.fire(message);
    }

    sendMessage(message: any): void {
        this.ensureState(Connection.State.OPENED);
        this.sendChannelMessage(new Multiplexing.ChannelMessage(this.remoteId, message));
    }

    close(): void {
        this.setClosedAndEmit();
        this.sendChannelMessage(new Multiplexing.CloseMessage(this.remoteId));
        this.dispose();
    }

    remoteClose(): void {
        if (this.state !== Connection.State.CLOSED) {
            console.debug(`remote closing an already closed connection: remoteId=${this.remoteId}`);
        } else {
            this.state = Connection.State.CLOSED;
            this.onCloseEmitter.fire();
            this.dispose();
        }
    }
}
