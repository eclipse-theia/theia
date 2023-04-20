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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { MessagePortMain, WebContents } from '@theia/electron/shared/electron';
import { inject, injectable, named, postConstruct } from 'inversify';
import { ContributionProvider } from '../../common/contribution-provider';
import { MessagingContribution } from '../../node/messaging/messaging-contribution';
import { ElectronConnectionHandler, ElectronConnectionHandlerId } from '../../electron-common/messaging/electron-connection-handler';
import { ElectronMainApplicationContribution } from '../electron-main-application';
import { ElectronMessagingService } from './electron-messaging-service';
import { AbstractChannel, Channel, ChannelMultiplexer } from '../../common/message-rpc/channel';
import { ConnectionHandler, WriteBuffer } from '../../common';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';
import { MessagePortServer, TheiaIpcMainEvent } from '../../electron-common';

/**
 * This component replicates the role filled by `MessagingContribution` but for Electron.
 * Unlike the WebSocket based implementation, we do not expect to receive
 * connection events. Instead, we'll create channels based on incoming `open`
 * events on the `ipcMain` channel.
 * This component allows communication between renderer process (frontend) and electron main process.
 */

@injectable()
export class ElectronMessagingContribution implements ElectronMainApplicationContribution, ElectronMessagingService {

    @inject(MessagePortServer)
    protected messagePortServer: MessagePortServer;

    @inject(ContributionProvider) @named(ElectronMessagingService.Contribution)
    protected readonly messagingContributions: ContributionProvider<ElectronMessagingService.Contribution>;

    @inject(ContributionProvider) @named(ElectronConnectionHandler)
    protected readonly connectionHandlers: ContributionProvider<ConnectionHandler>;

    protected readonly channelHandlers = new MessagingContribution.ConnectionHandlers<Channel>();
    /**
     * Each electron window has a main channel and its own multiplexer to route multiple client messages the same IPC connection.
     */
    protected readonly windowChannelMultiplexer = new Map<number, { channel: ElectronWebContentChannel, multiplexer: ChannelMultiplexer }>();

    @postConstruct()
    protected init(): void {
        this.messagePortServer.handle(ElectronConnectionHandlerId, this.handleConnection, this);
    }

    protected handleConnection(event: TheiaIpcMainEvent): void {
        const { sender, ports: [port] } = event;
        if (this.windowChannelMultiplexer.has(sender.id)) {
            throw new Error('already connected');
        }
        this.createWindowChannelData(sender, port);
    }

    /**
     * Creates a new multiplexer for a given sender/window.
     */
    protected createWindowChannelData(sender: WebContents, port: MessagePortMain): { channel: ElectronWebContentChannel, multiplexer: ChannelMultiplexer } {
        const mainChannel = this.createWindowMainChannel(port);
        const multiplexer = new ChannelMultiplexer(mainChannel);
        multiplexer.onDidOpenChannel(openEvent => {
            const { channel, id } = openEvent;
            if (this.channelHandlers.route(id, channel)) {
                console.debug(`Opening channel for service path '${id}'.`);
                channel.onClose(() => console.debug(`Closing channel on service path '${id}'.`));
            }
        });
        sender.once('did-navigate', () => this.disposeMultiplexer(sender.id, multiplexer, 'Window was refreshed')); // When refreshing the browser window.
        sender.once('destroyed', () => this.disposeMultiplexer(sender.id, multiplexer, 'Window was closed')); // When closing the browser window.
        const data = { channel: mainChannel, multiplexer };
        this.windowChannelMultiplexer.set(sender.id, data);
        return data;
    }

    /**
     * Creates the main channel to a window.
     */
    protected createWindowMainChannel(port: MessagePortMain): ElectronWebContentChannel {
        return new ElectronWebContentChannel(port);
    }

    protected disposeMultiplexer(windowId: number, multiplexer: ChannelMultiplexer, reason: string): void {
        multiplexer.onUnderlyingChannelClose({ reason });
        this.windowChannelMultiplexer.delete(windowId);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcChannel(spec: string, callback: (params: any, channel: Channel) => void): void {
        this.channelHandlers.push(spec, callback);
    }
}

/**
 * Used to establish a connection between the ipcMain and the Electron frontend (window).
 * Messages a transferred via electron IPC.
 */
export class ElectronWebContentChannel extends AbstractChannel {

    protected messagePort?: MessagePortMain;

    constructor(messagePort: MessagePortMain) {
        super();
        this.messagePort = messagePort;
        this.messagePort.addListener('message', event => this.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(event.data)));
        this.messagePort.addListener('close', () => {
            this.onCloseEmitter.fire({ reason: 'message port closed' });
            this.messagePort = undefined;
        });
        this.messagePort.start();
    }

    getWriteBuffer(): WriteBuffer {
        const writer = new Uint8ArrayWriteBuffer();
        writer.onCommit(buffer => this.messagePort?.postMessage(buffer));
        return writer;
    }
}
