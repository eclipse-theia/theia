/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { Emitter, Event } from '../event';
import { Connection } from './connection';

/**
 * A `ChannelHandler` handles logical connections (`Channel`) over another `Connection`.
 */
export interface ChannelHandler {
    readonly onInboundChannel: Event<Connection>
    openOutgoingChannel(options?: object): Connection
}

/**
 * A `Channel` is a pseudo-connection that is handled logically over another `Connection`.
 */
export interface Channel extends Connection {
    setOpen(): void
    emitMessage(message: string): void
    emitError(error: string): void
    /**
     * Close the channel without notifying the other end, only emit local events.
     */
    closeLocally(event: Connection.CloseEvent): void
}

export const ChannelProtocol = Symbol('ChannelProtocol');
/**
 * A `ChannelProtocol` provides the implementations to parse and serialize `Channel.Message` instances.
 */
export interface ChannelProtocol {
    serialize<T extends Channel.Message>(message: T): string
    parse(message: string): Channel.Message
}

export const ChannelHandlerFactory = Symbol('ChannelHandlerFactory');
/**
 * Get a `ChannelHandler` to wrap `connection`.
 */
export type ChannelHandlerFactory = (connection: Connection) => ChannelHandler;

export const ChannelFactory = Symbol('ChannelFactory');
/**
 * Get a `Channel` with `id` to wrap `connection`.
 */
export type ChannelFactory = (connection: Connection, id: number) => Channel;

export class ChannelHandlerImpl implements ChannelHandler {

    protected idSequence = 0;
    protected inboundChannels = new Map<number, Channel>();
    protected outboundChannels = new Map<number, Channel>();
    protected onInboundChannelEmitter = new Emitter<Connection>();

    get onInboundChannel(): Event<Connection> {
        return this.onInboundChannelEmitter.event;
    }

    constructor(
        protected connection: Connection,
        protected channelProtocol: ChannelProtocol,
        protected channelFactory: ChannelFactory
    ) {
        this.connection.onMessage(raw => {
            const message = this.channelProtocol.parse(raw);
            switch (message.kind) {
                case 'open': return this.handleOpen(message);
                case 'ready': return this.handleReady(message);
                case 'data': return this.handleData(message);
                case 'close': return this.handleClose(message);
                case 'error': return this.handleError(message);
            }
        });
        this.connection.onError(error => {
            for (const channel of this.inboundChannels.values()) {
                channel.emitError(error);
            }
        });
        this.connection.onClose(event => {
            for (const channel of this.inboundChannels.values()) {
                channel.closeLocally(event);
            }
        });
    }

    openOutgoingChannel(options?: object): Connection {
        const id = this.getNextId();
        const channel = this.channelFactory(this.connection, id);
        this.outboundChannels.set(id, channel);
        channel.onClose(() => this.outboundChannels.delete(id));
        return channel;
    }

    protected getNextId(): number {
        return ++this.idSequence;
    }

    protected handleOpen(message: Channel.OpenMessage): void {
        const { id } = message;
        const channel = this.channelFactory(this.connection, id);
        this.inboundChannels.set(message.id, channel);
        channel.onClose(() => this.inboundChannels.delete(id));
        this.onInboundChannelEmitter.fire(channel);
    }

    protected handleReady(message: Channel.ReadyMessage): void {
        this.getInboundChannel(message.id).setOpen();
    }

    protected handleData(message: Channel.DataMessage): void {
        this.getInboundChannel(message.id).emitMessage(message.content);
    }

    protected handleError(message: Channel.ErrorMessage): void {
        this.getInboundChannel(message.id, false).emitError(message.error);
    }

    protected handleClose(message: Channel.CloseMessage): void {
        this.getInboundChannel(message.id, false).close(message);
    }

    /**
     * Throws if `id` is unknown.
     *
     * @param sendError whether or not to notify the other end that an error occured locally.
     */
    protected getInboundChannel(id: number, sendError: boolean = true): Channel {
        const channel = this.inboundChannels.get(id);
        if (!channel) {
            if (sendError) {
                this.connection.sendMessage(this.channelProtocol.serialize<Channel.ErrorMessage>({
                    id,
                    kind: 'error',
                    error: 'unknown channel'
                }));
            }
            throw new Error(`unknown channel id: ${id}`);
        }
        return channel;
    }
}

export class ChannelImpl extends Connection.AbstractBase implements Channel {

    state = Connection.State.Opening;

    constructor(
        protected connection: Connection,
        protected channelProtocol: ChannelProtocol,
        protected id: number
    ) {
        super();
    }

    setOpen(): void {
        Connection.ensureOpening(this);
        this.state = Connection.State.Open;
        this.onOpenEmitter.fire(this);
    }

    emitMessage(message: string): void {
        this.onMessageEmitter.fire(message);
    }

    emitError(error: string): void {
        this.state = Connection.State.Closing;
        this.onErrorEmitter.fire(error);
        this.closeLocally({ code: -1, reason: error });
    }

    closeLocally(event: Connection.CloseEvent): void {
        if (this.state !== Connection.State.Closed) {
            this.state = Connection.State.Closed;
            this.onCloseEmitter.fire(event);
        }
    }

    sendMessage(message: string): void {
        if (this.state !== Connection.State.Open) {
            throw new Error(`invalid connection state: ${Connection.State[this.state]}`);
        }
        this.connection.sendMessage(this.channelProtocol.serialize<Channel.DataMessage>({
            kind: 'data',
            id: this.id,
            content: message
        }));
    }

    close(event: Connection.CloseEvent): void {
        if (this.state !== Connection.State.Closing && this.state !== Connection.State.Closed) {
            this.connection.sendMessage(this.channelProtocol.serialize<Channel.CloseMessage>({
                ...event,
                kind: 'close',
                id: this.id,
            }));
            this.state = Connection.State.Closed;
            this.onCloseEmitter.fire(event);
        }
    }
}

export namespace Channel {
    export interface OpenMessageOptions {
        [key: string]: number | string | null
    }
    export interface BaseMessage {
        /**
         * The channel id this message belongs to.
         */
        id: number
        /**
         * The kind of message that is being encoded (open, ready, data, error, close).
         */
        kind: string
    }
    export interface OpenMessage extends BaseMessage {
        kind: 'open'
        options?: OpenMessageOptions
    };
    export interface ReadyMessage extends BaseMessage {
        kind: 'ready'
    };
    export interface DataMessage extends BaseMessage {
        kind: 'data'
        content: string
    };
    export interface ErrorMessage extends BaseMessage {
        kind: 'error'
        error: string
    }
    export interface CloseMessage extends BaseMessage {
        kind: 'close'
        code: number
        reason?: string
    };
    export type Message = OpenMessage | ReadyMessage | DataMessage | CloseMessage | ErrorMessage;
}
