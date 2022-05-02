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
import { Emitter, Event } from '../event';
import { ReadBuffer, WriteBuffer } from './message-buffer';

/**
 * A channel is a bidirectional communications channel with lifecycle and
 * error signalling. Note that creation of channels is specific to particular
 * implementations and thus not part of the protocol.
 */
export interface Channel {

    /**
     * The remote side has closed the channel
     */
    onClose: Event<ChannelCloseEvent>;

    /**
     * An error has occurred while writing to or reading from the channel
     */
    onError: Event<unknown>;

    /**
     * A message has arrived and can be read  by listeners using a {@link MessageProvider}.
     */
    onMessage: Event<MessageProvider>;

    /**
     * Obtain a {@link WriteBuffer} to write a message to the channel.
     */
    getWriteBuffer(): WriteBuffer;

    /**
     * Close this channel. No {@link onClose} event should be sent
     */
    close(): void;
}

/**
 * The event that is emitted when a channel is closed from the remote side.
 */
export interface ChannelCloseEvent {
    reason: string,
    code?: number
};

/**
 * The `MessageProvider` is emitted when a channel receives a new message.
 * Listeners can read the provider to obtain a new {@link ReadBuffer} for the received message
 */
export type MessageProvider = () => ReadBuffer;

export enum MessageTypes {
    Open = 1,
    Close = 2,
    AckOpen = 3,
    Data = 4
}

/**
 * Helper class to implement the single channels on a {@link ChannelMultiplexer}. Simply forwards write requests to
 * the given write buffer source i.e. the main channel of the {@link ChannelMultiplexer}.
 */
export class ForwardingChannel implements Channel {

    constructor(readonly id: string, protected readonly closeHandler: () => void, protected readonly writeBufferSource: () => WriteBuffer) {
    }

    onCloseEmitter: Emitter<ChannelCloseEvent> = new Emitter();
    get onClose(): Event<ChannelCloseEvent> {
        return this.onCloseEmitter.event;
    };

    onErrorEmitter: Emitter<unknown> = new Emitter();
    get onError(): Event<unknown> {
        return this.onErrorEmitter.event;
    };

    onMessageEmitter: Emitter<MessageProvider> = new Emitter();
    get onMessage(): Event<MessageProvider> {
        return this.onMessageEmitter.event;
    };

    getWriteBuffer(): WriteBuffer {
        return this.writeBufferSource();
    }

    send(message: ArrayBuffer): void {
        const writeBuffer = this.getWriteBuffer();
        writeBuffer.writeBytes(message);
        writeBuffer.commit();
    }

    close(): void {
        this.closeHandler();
    }
}

/**
 * The write buffers in this implementation immediately write to the underlying
 * channel, so we rely on writers to the multiplexed channels to always commit their
 * messages and always in one go.
 */
export class ChannelMultiplexer {
    protected pendingOpen: Map<string, (channel: ForwardingChannel) => void> = new Map();
    protected openChannels: Map<string, ForwardingChannel> = new Map();

    protected readonly onOpenChannelEmitter = new Emitter<{ id: string, channel: Channel }>();
    get onDidOpenChannel(): Event<{ id: string, channel: Channel }> {
        return this.onOpenChannelEmitter.event;
    }

    constructor(protected readonly underlyingChannel: Channel) {
        this.underlyingChannel.onMessage(buffer => this.handleMessage(buffer()));
        this.underlyingChannel.onClose(event => this.closeUnderlyingChannel(event));
        this.underlyingChannel.onError(error => this.handleError(error));
    }

    protected handleError(error: unknown): void {
        this.openChannels.forEach(channel => {
            channel.onErrorEmitter.fire(error);
        });
    }

    closeUnderlyingChannel(event?: ChannelCloseEvent): void {

        this.pendingOpen.clear();
        this.openChannels.forEach(channel => {
            channel.onCloseEmitter.fire(event ?? { reason: 'Multiplexer main channel has been closed from the remote side!' });
        });

        this.openChannels.clear();
    }

    protected getUnderlyingWriteBuffer(): WriteBuffer {
        return this.underlyingChannel.getWriteBuffer();
    }

    protected handleMessage(buffer: ReadBuffer): void {
        const type = buffer.readUint8();
        const id = buffer.readString();
        switch (type) {
            case MessageTypes.AckOpen: {
                return this.handleAckOpen(id);
            }
            case MessageTypes.Open: {
                return this.handleOpen(id);
            }
            case MessageTypes.Close: {
                return this.handleClose(id);
            }
            case MessageTypes.Data: {
                return this.handleData(id, buffer.sliceAtCurrentPosition());
            }
        }
    }

    protected handleAckOpen(id: string): void {
        // edge case: both side try to open a channel at the same time.
        const resolve = this.pendingOpen.get(id);
        if (resolve) {
            const channel = this.createChannel(id);
            this.pendingOpen.delete(id);
            this.openChannels.set(id, channel);
            resolve(channel);
            this.onOpenChannelEmitter.fire({ id, channel });
        }
    }

    protected handleOpen(id: string): void {
        if (!this.openChannels.has(id)) {
            const channel = this.createChannel(id);
            this.openChannels.set(id, channel);
            const resolve = this.pendingOpen.get(id);
            if (resolve) {
                // edge case: both side try to open a channel at the same time.
                resolve(channel);
            }
            this.getUnderlyingWriteBuffer().writeUint8(MessageTypes.AckOpen).writeString(id).commit();
            this.onOpenChannelEmitter.fire({ id, channel });
        }
    }

    protected handleClose(id: string): void {
        const channel = this.openChannels.get(id);
        if (channel) {
            channel.onCloseEmitter.fire({ reason: 'Channel has been closed from the remote side' });
            this.openChannels.delete(id);
        }
    }

    protected handleData(id: string, data: ReadBuffer): void {
        const channel = this.openChannels.get(id);
        if (channel) {
            channel.onMessageEmitter.fire(() => data);
        }
    }

    protected createChannel(id: string): ForwardingChannel {
        return new ForwardingChannel(id, () => this.closeChannel(id), () => this.prepareWriteBuffer(id));
    }

    // Prepare the write buffer for the channel with the give, id. The channel id has to be encoded
    // and written to the buffer before the actual message.
    protected prepareWriteBuffer(id: string): WriteBuffer {
        const underlying = this.getUnderlyingWriteBuffer();
        underlying.writeUint8(MessageTypes.Data);
        underlying.writeString(id);
        return underlying;
    }

    protected closeChannel(id: string): void {
        this.getUnderlyingWriteBuffer()
            .writeUint8(MessageTypes.Close)
            .writeString(id)
            .commit();

        this.openChannels.delete(id);
    }

    open(id: string): Promise<Channel> {
        const existingChannel = this.getOpenChannel(id);
        if (existingChannel) {
            return Promise.resolve(existingChannel);
        }
        const result = new Promise<Channel>((resolve, reject) => {
            this.pendingOpen.set(id, resolve);
        });
        this.getUnderlyingWriteBuffer().writeUint8(MessageTypes.Open).writeString(id).commit();
        return result;
    }

    getOpenChannel(id: string): Channel | undefined {
        return this.openChannels.get(id);
    }
}

