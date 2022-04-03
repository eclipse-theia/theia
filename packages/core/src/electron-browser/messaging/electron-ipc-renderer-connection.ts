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

import type { Event as ElectronEvent, IpcRenderer } from '@theia/core/electron-shared/electron';
import { injectable } from 'inversify';
import { AbstractConnection, Connection, ConnectionState } from '../../common';
import { pushDisposableListener } from '../../common/node-event-utils';

/**
 * @internal
 */
@injectable()
export class IpcRendererConnection extends AbstractConnection<any> {

    state = ConnectionState.OPENING;

    protected channel?: string;
    protected ipcRenderer?: IpcRenderer;

    /**
     * @param channel The Electron IPC channel to use for sending messages over this connection.
     * @param ipcRenderer The Electron `IpcRenderer` API.
     */
    initialize(channel: string, ipcRenderer: IpcRenderer): Connection<any> {
        this.channel = channel;
        this.ipcRenderer = ipcRenderer;
        pushDisposableListener(this.disposables, this.ipcRenderer, this.channel, (event: ElectronEvent, message: any) => {
            this.ensureState(ConnectionState.OPENED);
            this.onMessageEmitter.fire(message);
        });
        this.setOpenedAndEmit();
        return this;
    }

    sendMessage(message: any): void {
        this.ensureState(ConnectionState.OPENED);
        this.ipcRenderer!.send(this.channel!, message);
    }

    close(): void {
        this.setClosedAndEmit();
        this.dispose();
        this.ipcRenderer = undefined;
    }
}
