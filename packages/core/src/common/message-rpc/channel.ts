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
import { ArrayBufferReadBuffer, ArrrayBufferWriteBuffer } from './array-buffer-message-buffer';
import { Emitter, Event } from '../event';
import { ReadBuffer, WriteBuffer } from './message-buffer';

/**
 * A channel is a bidirectinal communications channel with lifecycle and
 * error signalling. Note that creation of channels is specific to particular
 * implementations and thus not part of the protocol.
 */
export interface Channel {
    /**
     * The remote side has closed the channel
     */
    onClose: Event<void>;
    /**
     * An error has occurred while writing to or reading from the channel
     */
    onError: Event<unknown>;
    /**
     * A message has arrived and can be read using the given {@link ReadBuffer}
     */
    onMessage: Event<ReadBuffer>;
    /**
     * Obtain a {@link WriteBuffer} to write a message to the channel.
     */
    getWriteBuffer(): WriteBuffer;
    /**
     * Close this channel. No {@link onClose} event should be sent
     */
    close(): void;
}

enum MessageTypes {
    Open = 1,
    Close = 2,
    AckOpen = 3,
    Data = 4
}

/**
 * Helper class to implement the single channels on a {@link ChannelMultiplexer}
 */
class ForwardingChannel implements Channel {
    constructor(private readonly closeHander: () => void, private readonly writeBufferSource: () => WriteBuffer) {
    }

    onCloseEmitter: Emitter<void> = new Emitter();
    get onClose(): Event<void> {
        return this.onCloseEmitter.event;
    };
    onErrorEmitter: Emitter<unknown> = new Emitter();
    get onError(): Event<unknown> {
        return this.onErrorEmitter.event;
    };
    onMessageEmitter: Emitter<ReadBuffer> = new Emitter();
    get onMessage(): Event<ReadBuffer> {
        return this.onMessageEmitter.event;
    };

    getWriteBuffer(): WriteBuffer {
        return this.writeBufferSource();
    }

    close(): void {
        this.closeHander();
    }
}

/**
 * A class to encode/decode multiple channels over a single underlying {@link Channel}
 * The write buffers in this implementation immediately write to the underlying
 * channel, so we rely on writers to the multiplexed channels to always commit their
 * messages and always in one go.
 */
export class ChannelMultiplexer {
    protected pendingOpen: Map<string, (channel: ForwardingChannel) => void> = new Map();
    protected openChannels: Map<string, ForwardingChannel> = new Map();

    protected readonly onOpenChannelEmitter: Emitter<Channel> = new Emitter<Channel>();
    get onDidOpenChannel(): Event<Channel> {
        return this.onOpenChannelEmitter.event;
    }

    constructor(protected readonly underlyingChannel: Channel) {
        this.underlyingChannel.onMessage(buffer => this.handleMessage(buffer));
        this.underlyingChannel.onClose(() => this.handleClose());
        this.underlyingChannel.onError(error => this.handleError(error));
    }

    protected handleError(error: unknown): void {
        this.openChannels.forEach(channel => {
            channel.onErrorEmitter.fire(error);
        });
    }

    protected handleClose(): void {
        this.pendingOpen.clear();
        this.openChannels.forEach(channel => {
            channel.close();
        });
        this.openChannels.clear();
    }

    protected handleMessage(buffer: ReadBuffer): void {
        const type = buffer.readByte();
        const id = buffer.readString();
        switch (type) {
            case MessageTypes.AckOpen: {
                // edge case: both side try to open a channel at the same time.
                const resolve = this.pendingOpen.get(id);
                if (resolve) {
                    const channel = this.createChannel(id);
                    this.pendingOpen.delete(id);
                    this.openChannels.set(id, channel);
                    resolve!(channel);
                    this.onOpenChannelEmitter.fire(channel);
                }
                break;
            }
            case MessageTypes.Open: {
                if (!this.openChannels.has(id)) {
                    const channel = this.createChannel(id);
                    this.openChannels.set(id, channel);
                    const resolve = this.pendingOpen.get(id);
                    if (resolve) {
                        // edge case: both side try to open a channel at the same time.
                        resolve(channel);
                    }
                    this.underlyingChannel.getWriteBuffer().writeByte(MessageTypes.AckOpen).writeString(id).commit();
                    this.onOpenChannelEmitter.fire(channel);
                }

                break;
            }
            case MessageTypes.Close: {
                const channel = this.openChannels.get(id);
                if (channel) {
                    channel.onCloseEmitter.fire();
                    this.openChannels.delete(id);
                }
                break;
            }
            case MessageTypes.Data: {
                const channel = this.openChannels.get(id);
                if (channel) {
                    channel.onMessageEmitter.fire(buffer);
                }
                break;
            }

        }
    }

    protected createChannel(id: string): ForwardingChannel {
        return new ForwardingChannel(() => this.closeChannel(id), () => {
            const underlying = this.underlyingChannel.getWriteBuffer();
            underlying.writeByte(MessageTypes.Data);
            underlying.writeString(id);
            return underlying;
        });
    }

    protected closeChannel(id: string): void {
        this.underlyingChannel.getWriteBuffer().writeByte(MessageTypes.Close).writeString(id).commit();
        this.openChannels.get(id)!.onCloseEmitter.fire();
        this.openChannels.delete(id);
    }

    open(id: string): Promise<Channel> {
        const result = new Promise<Channel>((resolve, reject) => {
            this.pendingOpen.set(id, resolve);
        });
        this.underlyingChannel.getWriteBuffer().writeByte(MessageTypes.Open).writeString(id).commit();
        return result;
    }

    getOpenChannel(id: string): Channel | undefined {
        return this.openChannels.get(id);
    }
}

/**
 * A pipe with two channels at each end for testing.
 */
export class ChannelPipe {
    readonly left: ForwardingChannel = new ForwardingChannel(() => this.right.onCloseEmitter.fire(), () => {
        const leftWrite = new ArrrayBufferWriteBuffer();
        leftWrite.onCommit(buffer => {
            this.right.onMessageEmitter.fire(new ArrayBufferReadBuffer(buffer));
        });
        return leftWrite;
    });
    readonly right: ForwardingChannel = new ForwardingChannel(() => this.left.onCloseEmitter.fire(), () => {
        const rightWrite = new ArrrayBufferWriteBuffer();
        rightWrite.onCommit(buffer => {
            this.left.onMessageEmitter.fire(new ArrayBufferReadBuffer(buffer));
        });
        return rightWrite;
    });
}
