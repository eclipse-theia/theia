// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { WebContents } from '@theia/electron/shared/electron';
import { inject, injectable, named, postConstruct } from 'inversify';
import { ConnectionHandlers } from '../../node/messaging/default-messaging-service';
import { AbstractChannel, Channel, ChannelMultiplexer, MessageProvider } from '../../common/message-rpc/channel';
import { ConnectionHandler, ContributionProvider, Emitter, WriteBuffer } from '../../common';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';
import { TheiaRendererAPI } from '../electron-api-main';
import { MessagingService } from '../../node';
import { ElectronMessagingService } from './electron-messaging-service';
import { ElectronConnectionHandler } from './electron-connection-handler';
import { ElectronMainApplicationContribution } from '../electron-main-application';

/**
 * This component replicates the role filled by `MessagingContribution` but for Electron.
 * Unlike the WebSocket based implementation, we do not expect to receive
 * connection events. Instead, we'll create channels based on incoming `open`
 * events on the `ipcMain` channel.
 * This component allows communication between renderer process (frontend) and electron main process.
 */

@injectable()
export class ElectronMessagingContribution implements ElectronMainApplicationContribution, ElectronMessagingService {
    @inject(ContributionProvider) @named(ElectronMessagingService.Contribution)
    protected readonly messagingContributions: ContributionProvider<ElectronMessagingService.Contribution>;

    @inject(ContributionProvider) @named(ElectronConnectionHandler)
    protected readonly connectionHandlers: ContributionProvider<ConnectionHandler>;

    protected readonly channelHandlers = new ConnectionHandlers<Channel>();

    /**
     * Each electron window has a main channel and its own multiplexer to route multiple client messages the same IPC connection.
     */
    protected readonly openChannels = new Map<number, ElectronWebContentChannel>();

    @postConstruct()
    protected init(): void {
        TheiaRendererAPI.onIpcData((sender, data) => this.handleIpcEvent(sender, data));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcChannel(spec: string, callback: (params: any, channel: Channel) => void): void {
        this.channelHandlers.push(spec, callback);
    }

    onStart(): void {
        for (const contribution of this.messagingContributions.getContributions()) {
            contribution.configure(this);
        }
        for (const connectionHandler of this.connectionHandlers.getContributions()) {
            this.channelHandlers.push(connectionHandler.path, (params, channel) => {
                connectionHandler.onConnection(channel);
            });
        }
    }

    protected handleIpcEvent(sender: WebContents, data: Uint8Array): void {
        // Get the multiplexer for a given window id
        try {
            const windowChannel = this.openChannels.get(sender.id) ?? this.createWindowChannel(sender);
            windowChannel.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(data));
        } catch (error) {
            console.error('IPC: Failed to handle message', { error, data });
        }
    }

    // Creates a new channel for a given sender/window
    protected createWindowChannel(sender: Electron.WebContents): ElectronWebContentChannel {
        const mainChannel = new ElectronWebContentChannel(sender);

        const multiplexer = new ChannelMultiplexer(mainChannel);
        multiplexer.onDidOpenChannel(openEvent => {
            const { channel, id } = openEvent;
            if (this.channelHandlers.route(id, channel)) {
                console.debug(`Opening channel for service path '${id}'.`);
                channel.onClose(() => console.debug(`Closing channel on service path '${id}'.`));
            }
        });
        sender.once('did-navigate', () => this.deleteChannel(sender.id, 'Window was refreshed'));
        sender.once('destroyed', () => this.deleteChannel(sender.id, 'Window was closed'));
        this.openChannels.set(sender.id, mainChannel);
        return mainChannel;
    }

    protected deleteChannel(senderId: number, reason: string): void {
        const channel = this.openChannels.get(senderId);
        if (channel) {
            this.openChannels.delete(senderId);
            channel.onCloseEmitter.fire({
                reason: reason
            });
        }
    }

    protected readonly wsHandlers = new ConnectionHandlers();

    registerConnectionHandler(spec: string, callback: (params: MessagingService.PathParams, channel: Channel) => void): void {
        this.wsHandlers.push(spec, callback);
    }
}

/**
 * Used to establish a connection between the ipcMain and the Electron frontend (window).
 * Messages a transferred via electron IPC.
 */
export class ElectronWebContentChannel extends AbstractChannel {

    // Make the message emitter public so that we can easily forward messages received from the ipcMain.
    override readonly onMessageEmitter: Emitter<MessageProvider> = new Emitter();

    constructor(protected readonly sender: Electron.WebContents) {
        super();
    }

    getWriteBuffer(): WriteBuffer {
        const writer = new Uint8ArrayWriteBuffer();

        writer.onCommit(buffer => {
            if (!this.sender.isDestroyed()) {
                TheiaRendererAPI.sendData(this.sender, buffer);
            }
        });

        return writer;
    }

}
