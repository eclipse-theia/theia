/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { JsonRpcProxy } from '@theia/core/lib/common/messaging';
import { WebSocketChannel } from '@theia/core/lib/common/messaging/web-socket-channel';
import { AbstractConnectionProvider } from '@theia/core/lib/common/messaging/abstract-connection-provider';
import { Event as ElectronEvent, ipcRenderer } from 'electron';
import { injectable, interfaces } from 'inversify';
import { THEIA_ELECTRON_IPC_CHANNEL_NAME } from '../../electron-common/messaging/electron-ipc-protocol';

export interface ElectronIpcOptions {
}

@injectable()
export class ElectronIpcConnectionProvider extends AbstractConnectionProvider<ElectronIpcOptions> {

    static createProxy<T extends object>(container: interfaces.Container, path: string, arg?: object): JsonRpcProxy<T> {
        return container.get(ElectronIpcConnectionProvider).createProxy<T>(path, arg);
    }

    constructor() {
        super();
        ipcRenderer.on(THEIA_ELECTRON_IPC_CHANNEL_NAME, (event: ElectronEvent, data: string) => {
            this.handleIncomingRawMessage(data);
        });
    }

    protected createChannel(id: number): WebSocketChannel {
        return new WebSocketChannel(id, content => {
            ipcRenderer.send(THEIA_ELECTRON_IPC_CHANNEL_NAME, content);
        });
    }

}
