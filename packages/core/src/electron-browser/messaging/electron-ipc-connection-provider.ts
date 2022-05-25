// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { Event as ElectronEvent, ipcRenderer } from '@theia/electron/shared/electron';
import { injectable, interfaces } from 'inversify';
import { JsonRpcProxy } from '../../common/messaging';
import { AbstractConnectionProvider } from '../../common/messaging/abstract-connection-provider';
import { THEIA_ELECTRON_IPC_CHANNEL_NAME } from '../../electron-common/messaging/electron-connection-handler';
import { Emitter, Event } from '../../common';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';
import { Channel, MessageProvider } from '../../common/message-rpc/channel';

export interface ElectronIpcOptions {
}

/**
 * Connection provider between the Theia frontend and the electron-main process via IPC.
 */
@injectable()
export class ElectronIpcConnectionProvider extends AbstractConnectionProvider<ElectronIpcOptions> {

    static override createProxy<T extends object>(container: interfaces.Container, path: string, arg?: object): JsonRpcProxy<T> {
        return container.get(ElectronIpcConnectionProvider).createProxy<T>(path, arg);
    }

    protected createMainChannel(): Channel {
        const onMessageEmitter = new Emitter<MessageProvider>();
        ipcRenderer.on(THEIA_ELECTRON_IPC_CHANNEL_NAME, (_event: ElectronEvent, data: Uint8Array) => {
            onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(data));
        });
        return {
            close: () => Event.None,
            getWriteBuffer: () => {
                const writer = new Uint8ArrayWriteBuffer();
                writer.onCommit(buffer =>
                    // The ipcRenderer cannot handle ArrayBuffers directly=> we have to convert to Uint8Array.
                    ipcRenderer.send(THEIA_ELECTRON_IPC_CHANNEL_NAME, buffer)
                );
                return writer;
            },
            onClose: Event.None,
            onError: Event.None,
            onMessage: onMessageEmitter.event
        };
    }

}
