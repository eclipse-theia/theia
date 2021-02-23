/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { IpcMainEvent, ipcMain, WebContents } from '../../../shared/electron';
import { inject, injectable, named, postConstruct } from 'inversify';
import { MessageConnection } from 'vscode-ws-jsonrpc';
import { createWebSocketConnection } from 'vscode-ws-jsonrpc/lib/socket/connection';
import { ContributionProvider } from '../../common/contribution-provider';
import { WebSocketChannel } from '../../common/messaging/web-socket-channel';
import { MessagingContribution } from '../../node/messaging/messaging-contribution';
import { ConsoleLogger } from '../../node/messaging/logger';
import { THEIA_ELECTRON_IPC_CHANNEL_NAME } from '../../electron-common/messaging/electron-connection-handler';
import { ElectronMainApplicationContribution } from '../electron-main-application';
import { ElectronMessagingService } from './electron-messaging-service';
import { ElectronConnectionHandler } from '../../electron-common/messaging/electron-connection-handler';

/**
 * This component replicates the role filled by `MessagingContribution` but for Electron.
 * Unlike the WebSocket based implementation, we do not expect to receive
 * connection events. Instead, we'll create channels based on incoming `open`
 * events on the `ipcMain` channel.
 *
 * This component allows communication between renderer process (frontend) and electron main process.
 */
@injectable()
export class ElectronMessagingContribution implements ElectronMainApplicationContribution, ElectronMessagingService {

    @inject(ContributionProvider) @named(ElectronMessagingService.Contribution)
    protected readonly messagingContributions: ContributionProvider<ElectronMessagingService.Contribution>;

    @inject(ContributionProvider) @named(ElectronConnectionHandler)
    protected readonly connectionHandlers: ContributionProvider<ElectronConnectionHandler>;

    protected readonly channelHandlers = new MessagingContribution.ConnectionHandlers<WebSocketChannel>();
    protected readonly windowChannels = new Map<number, Map<number, WebSocketChannel>>();

    @postConstruct()
    protected init(): void {
        ipcMain.on(THEIA_ELECTRON_IPC_CHANNEL_NAME, (event: IpcMainEvent, data: string) => {
            this.handleIpcMessage(event, data);
        });
    }

    onStart(): void {
        for (const contribution of this.messagingContributions.getContributions()) {
            contribution.configure(this);
        }
        for (const connectionHandler of this.connectionHandlers.getContributions()) {
            this.channelHandlers.push(connectionHandler.path, (params, channel) => {
                const connection = createWebSocketConnection(channel, new ConsoleLogger());
                connectionHandler.onConnection(connection);
            });
        }
    }

    listen(spec: string, callback: (params: ElectronMessagingService.PathParams, connection: MessageConnection) => void): void {
        this.ipcChannel(spec, (params, channel) => {
            const connection = createWebSocketConnection(channel, new ConsoleLogger());
            callback(params, connection);
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcChannel(spec: string, callback: (params: any, channel: WebSocketChannel) => void): void {
        this.channelHandlers.push(spec, callback);
    }

    protected handleIpcMessage(event: IpcMainEvent, data: string): void {
        const sender = event.sender;
        try {
            // Get the channel map for a given window id
            let channels = this.windowChannels.get(sender.id)!;
            if (!channels) {
                this.windowChannels.set(sender.id, channels = new Map<number, WebSocketChannel>());
            }
            // Start parsing the message to extract the channel id and route
            const message: WebSocketChannel.Message = JSON.parse(data.toString());
            // Someone wants to open a logical channel
            if (message.kind === 'open') {
                const { id, path } = message;
                const channel = this.createChannel(id, sender);
                if (this.channelHandlers.route(path, channel)) {
                    channel.ready();
                    channels.set(id, channel);
                    channel.onClose(() => channels.delete(id));
                } else {
                    console.error('Cannot find a service for the path: ' + path);
                }
            } else {
                const { id } = message;
                const channel = channels.get(id);
                if (channel) {
                    channel.handleMessage(message);
                } else {
                    console.error('The ipc channel does not exist', id);
                }
            }
            const close = () => {
                for (const channel of Array.from(channels.values())) {
                    channel.close(undefined, 'webContent destroyed');
                }
                channels.clear();
            };
            sender.once('did-navigate', close); // When refreshing the browser window.
            sender.once('destroyed', close); // When closing the browser window.
        } catch (error) {
            console.error('IPC: Failed to handle message', { error, data });
        }
    }

    protected createChannel(id: number, sender: WebContents): WebSocketChannel {
        return new WebSocketChannel(id, content => {
            if (!sender.isDestroyed()) {
                sender.send(THEIA_ELECTRON_IPC_CHANNEL_NAME, content);
            }
        });
    }

}
