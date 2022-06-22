// *****************************************************************************
// Copyright (C) 2022 Red Hat, Inc. and others.
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
import { Emitter, Event } from '../event';
import { AbstractChannel, Channel, ChannelCloseEvent } from './channel';

/**
 * The different message types used in the messaging protocol of the {@link ChannelMultiplexer}
 */
export enum MultiplexerMessageType {
    Open = 1,
    Close = 2,
    AckOpen = 3,
    Data = 4
}

export interface MultiplexerMessage {
    type: MultiplexerMessageType,
    channelId: string,
}

export namespace MultiplexerMessage {
    export function is(object: any): object is MultiplexerMessage {
        return typeof object?.type === 'number' && MultiplexerMessageType[object.type] !== undefined;
    }
}

export interface DataMessage extends MultiplexerMessage {
    type: MultiplexerMessageType.Data
    data: any
}

/**
 * Internal Helper class to implement the sub channels on a {@link ChannelMultiplexer}. All subchannels of an {@link ChannelMultiplexer} are reusing the same main channel for
 * sending and receiving messages.
 * The visibility of event emitters is set to public. This enables access from the container class (i.e. the {@link ChannelMultiplexer}).
 */
export class SubChannel extends AbstractChannel {
    override readonly onCloseEmitter: Emitter<ChannelCloseEvent>;
    override readonly onMessageEmitter: Emitter<any>;
    override readonly onErrorEmitter: Emitter<unknown>;

    constructor(readonly id: string, public send: (message: any) => void, public override close: () => void) {
        super();
    }
}

export class ChannelMultiplexer implements Disposable {

    protected toDispose = new DisposableCollection();
    protected pendingOpen: Map<string, (channel: SubChannel) => void> = new Map();
    protected openChannels: Map<string, SubChannel> = new Map();

    protected readonly onOpenChannelEmitter = new Emitter<{ id: string, channel: Channel }>();
    get onDidOpenChannel(): Event<{ id: string, channel: Channel }> {
        return this.onOpenChannelEmitter.event;
    }

    constructor(protected readonly mainChannel: Channel<MultiplexerMessage>) {
        this.toDispose.pushAll([
            this.mainChannel.onMessage(msg => this.handleMainChannelMessage(msg)),
            this.mainChannel.onClose(event => this.handleMainChannelClose(event)),
            this.mainChannel.onError(error => this.handleError(error)),
            this.onOpenChannelEmitter
        ]);
    }

    handleMainChannelClose(event: ChannelCloseEvent): void {
        if (!this.toDispose.disposed) {
            this.toDispose.push(Disposable.create(() => {
                this.pendingOpen.clear();
                this.openChannels.forEach(channel => {
                    channel.onCloseEmitter.fire(event ?? { reason: 'Multiplexer main channel has been closed from the remote side!' });
                });

                this.openChannels.clear();
            }));
            this.dispose();
        }
    }

    protected handleError(error: unknown): void {
        this.openChannels.forEach(channel => {
            channel.onErrorEmitter.fire(error);
        });
    }

    protected handleMainChannelMessage(message: MultiplexerMessage): void {
        switch (message.type) {
            case MultiplexerMessageType.AckOpen:
                return this.handleAckOpen(message.channelId);
            case MultiplexerMessageType.Open:
                return this.handleOpen(message.channelId);
            case MultiplexerMessageType.Close:
                return this.handleClose(message.channelId);
            case MultiplexerMessageType.Data: {
                const { channelId, data } = message as DataMessage;
                return this.handleData(channelId, data);
            }
        }
    }

    protected handleAckOpen(channelId: string): void {
        // edge case: both side try to open a channel at the same time.
        const resolve = this.pendingOpen.get(channelId);
        if (resolve) {
            const channel = this.createChannel(channelId);
            this.pendingOpen.delete(channelId);
            this.openChannels.set(channelId, channel);
            resolve(channel);
            this.onOpenChannelEmitter.fire({ id: channelId, channel });
        }
    }

    protected handleOpen(channelId: string): void {
        if (!this.openChannels.has(channelId)) {
            const channel = this.createChannel(channelId);
            this.openChannels.set(channelId, channel);
            const resolve = this.pendingOpen.get(channelId);
            if (resolve) {
                // edge case: both side try to open a channel at the same time.
                resolve(channel);
            } else {
                this.sendMessage({ channelId, type: MultiplexerMessageType.AckOpen });
            }

            this.onOpenChannelEmitter.fire({ id: channelId, channel });
        }
    }

    protected handleClose(id: string): void {
        const channel = this.openChannels.get(id);
        if (channel) {
            channel.onCloseEmitter.fire({ reason: 'Channel has been closed from the remote side' });
            this.openChannels.delete(id);
        }
    }

    protected handleData(channelId: string, data: any): void {
        const channel = this.openChannels.get(channelId);
        if (channel) {
            channel.onMessageEmitter.fire(data);
        }
    }

    protected createChannel(channelId: string): SubChannel {
        return new SubChannel(channelId,
            data => this.sendMessage(<DataMessage>{ channelId: channelId, data, type: MultiplexerMessageType.Data }),
            () => this.closeChannel(channelId));
    }

    protected sendMessage(message: MultiplexerMessage): void {
        this.mainChannel.send(message);
    }

    protected closeChannel(channelId: string): void {
        if (this.openChannels.has(channelId)) {
            this.sendMessage({ channelId: channelId, type: MultiplexerMessageType.Open });
            this.openChannels.delete(channelId);
        }
    }

    openChannel(channelId: string): Promise<Channel> {
        const existingChannel = this.openChannels.get(channelId);
        if (existingChannel) {
            return Promise.resolve(existingChannel);
        }
        const result = new Promise<Channel>((resolve, reject) => {
            this.pendingOpen.set(channelId, resolve);
        });
        this.sendMessage({ channelId, type: MultiplexerMessageType.Open });
        return result;
    }

    getOpenChannel(id: string): Channel | undefined {
        return this.openChannels.get(id);
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}

