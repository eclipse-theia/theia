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

import type { IpcMainEvent, WebContents } from '@theia/core/electron-shared/electron';
import { injectable } from 'inversify';
import { AbstractConnection, Connection, ConnectionState } from '../common';
import { pushDisposableListener } from '../common/node-event-utils';

/**
 * @internal
 */
export interface WebContentsConnectionOptions {
    /**
     * Close the connection when the frame referrenced by {@link targetFrameId}
     * navigates.
     *
     * @default false
     */
    closeOnNavigation?: boolean
    /**
     * Listen to async and/or sync IPC message types.
     *
     * @default 'both'
     */
    ipcMessageKind?: 'async' | 'sync' | 'both'
    /**
     * The frame to listen/talk to.
     *
     * If not specified messages will be sent to the main frame exclusively
     * and messages from any frame will be emitted back.
     */
    targetFrameId?: number
}

/**
 * @internal
 */
export type DidFrameNavigateParams = [
    event: unknown,
    url: string,
    httpResponseCode: number,
    httpStatusText: string,
    isMainFrame: boolean,
    frameProcessId: number,
    frameRoutingId: number
];

/**
 * @internal
 *
 * Represents a `Connection<any>` over one channel of Electron's IPC API.
 */
@injectable()
export class WebContentsConnection extends AbstractConnection<any> {

    state = ConnectionState.OPENING;

    protected channel?: string;
    protected webContents?: WebContents;
    protected targetFrameId?: number;
    protected closeOnNavigation?: boolean;

    initialize(channel: string, webContents: WebContents, options: WebContentsConnectionOptions = {}): Connection<any> {
        this.channel = channel;
        this.webContents = webContents;
        this.targetFrameId = options.targetFrameId;
        this.closeOnNavigation = options.closeOnNavigation ?? false;
        this.listenForIpcMessages(options.ipcMessageKind ?? 'both');
        pushDisposableListener(this.disposables, this.webContents, 'destroyed', () => this.close());
        if (this.closeOnNavigation) {
            pushDisposableListener<DidFrameNavigateParams>(
                this.disposables,
                this.webContents,
                'did-frame-navigate',
                (event, url, httpResponseCode, httpStatusText, isMainFrame, frameProcessId, frameRoutingId) => {
                    if (this.isTargetFrame(frameRoutingId)) {
                        this.close();
                    }
                }
            );
        }
        this.setOpenedAndEmit();
        return this;
    }

    sendMessage(message: any): void {
        this.ensureState(ConnectionState.OPENED);
        if (this.targetFrameId === undefined) {
            this.webContents!.send(this.channel!, message);
        } else {
            this.webContents!.sendToFrame(this.targetFrameId, this.channel!, message);
        }
    }

    close(): void {
        this.setClosedAndEmit();
        this.dispose();
        this.webContents = undefined;
    }

    protected listenForIpcMessages(ipcMessageKind: 'async' | 'sync' | 'both'): void {
        const ipcMessageListener = this.handleIpcMessage.bind(this);
        if (ipcMessageKind === 'both') {
            pushDisposableListener(this.disposables, this.webContents!, 'ipc-message', ipcMessageListener);
            pushDisposableListener(this.disposables, this.webContents!, 'ipc-message-sync', ipcMessageListener);
        } else if (ipcMessageKind === 'async') {
            pushDisposableListener(this.disposables, this.webContents!, 'ipc-message', ipcMessageListener);
        } else if (ipcMessageKind === 'sync') {
            pushDisposableListener(this.disposables, this.webContents!, 'ipc-message-sync', ipcMessageListener);
        }
    }

    /**
     * Note that contrary to what the documentation says, the event type for `ipc-message(-sync)` is `IpcMainEvent`.
     */
    protected handleIpcMessage(event: IpcMainEvent, incomingChannel: string, message: any): void {
        this.ensureState(ConnectionState.OPENED);
        if (this.isTargetFrame(event.senderFrame.routingId) && incomingChannel === this.channel!) {
            this.onMessageEmitter.fire(message);
        }
    }

    protected isTargetFrame(frameId: number): boolean {
        return this.targetFrameId === undefined || this.targetFrameId === frameId;
    }
}
