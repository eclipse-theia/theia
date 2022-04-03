// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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

import { inject, injectable, named } from 'inversify';
import { createWebSocketConnection } from 'vscode-ws-jsonrpc/lib/socket/connection';
import { ContributionProvider } from '../../common/contribution-provider';
import { WebSocketChannel } from '../../common/messaging/web-socket-channel';
import { ConsoleLogger } from '../../node/messaging/logger';
import { ElectronMainConnectionHandler, ElectronBackendMessage, ElectronBackendConnectionPipe } from '../../electron-common/messaging/electron-backend-connection-handler';
import { MessagingContribution } from '../../node/messaging/messaging-contribution';
import { ChildProcess } from 'child_process';

export interface ElectronMainConnectionOptions {
}

/**
 * This component replicates the role filled by `MessagingContribution` but for connecting the backend with the electron process.
 * It is based on process communication using the created backend process.
 * Alternatively it uses a simple message pipe object when running in `--no-cluster` mode.
 *
 * This component allows communication between server process (backend) and electron main process.
 */
@injectable()
export class ElectronMainMessagingService {

    @inject(ContributionProvider) @named(ElectronMainConnectionHandler)
    protected readonly connectionHandlers: ContributionProvider<ElectronMainConnectionHandler>;

    protected readonly channelHandlers = new MessagingContribution.ConnectionHandlers<WebSocketChannel>();
    protected readonly channels = new Map<number, WebSocketChannel>();
    protected backendProcess?: ChildProcess;

    start(backendProcess?: ChildProcess): void {
        if (backendProcess) {
            this.backendProcess = backendProcess;
            this.backendProcess.on('message', message => {
                if (ElectronBackendMessage.is(message)) {
                    this.handleMessage(ElectronBackendMessage.get(message));
                }
            });
            this.backendProcess.on('exit', () => {
                this.closeChannels();
            });
        } else {
            ElectronBackendConnectionPipe.onMessage('electron', message => {
                this.handleMessage(message);
            });
        }
        for (const connectionHandler of this.connectionHandlers.getContributions()) {
            this.channelHandlers.push(connectionHandler.path, (params, channel) => {
                const connection = createWebSocketConnection(channel, new ConsoleLogger());
                connectionHandler.onConnection(connection);
            });
        }
    }

    protected closeChannels(): void {
        for (const channel of Array.from(this.channels.values())) {
            channel.close(undefined, 'Backend exited');
        }
        this.channels.clear();
    }

    protected handleMessage(data: string): void {
        try {
            // Start parsing the message to extract the channel id and route
            const message: WebSocketChannel.Message = JSON.parse(data.toString());
            // Someone wants to open a logical channel
            if (message.kind === 'open') {
                const { id, path } = message;
                const channel = this.createChannel(id);
                if (this.channelHandlers.route(path, channel)) {
                    channel.ready();
                    this.channels.set(id, channel);
                    channel.onClose(() => this.channels.delete(id));
                } else {
                    console.error('Cannot find a service for the path: ' + path);
                }
            } else {
                const { id } = message;
                const channel = this.channels.get(id);
                if (channel) {
                    channel.handleMessage(message);
                } else {
                    console.error('The ipc channel does not exist', id);
                }
            }
        } catch (error) {
            console.error('IPC: Failed to handle message', { error, data });
        }
    }

    protected createChannel(id: number): WebSocketChannel {
        return new WebSocketChannel(id, content => {
            if (this.backendProcess) {
                if (this.backendProcess.send) {
                    this.backendProcess.send(ElectronBackendMessage.create(content));
                }
            } else {
                ElectronBackendConnectionPipe.pushMessage('backend', content);
            }
        });
    }

}
