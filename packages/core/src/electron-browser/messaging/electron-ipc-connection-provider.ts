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
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Event as ElectronEvent, ipcRenderer } from '@theia/electron/shared/electron';
import { injectable, interfaces } from 'inversify';
import { AbstractChannel, Channel, JsonRpcProxy, MessageCodec } from '../../common/messaging';
import { AbstractConnectionProvider } from '../../common/messaging/abstract-connection-provider';
import { THEIA_ELECTRON_IPC_CHANNEL_NAME } from '../../electron-common/messaging/electron-connection-handler';
import { BinaryMessageCodec } from '../../common/messaging/message-codec';
import { Disposable } from 'vscode-languageserver-protocol';

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

    constructor() {
        super();
        this.initializeMultiplexer();
    }

    protected createMainChannel(): Channel {
        return new ElectronIpcRendererChannel();
    }

}

export class ElectronIpcRendererChannel extends AbstractChannel {

    protected messageCodec: MessageCodec<any, Uint8Array> = new BinaryMessageCodec();

    constructor() {
        super();
        const ipcMessageListener = (_event: ElectronEvent, data: Uint8Array) => this.onMessageEmitter.fire(data);
        ipcRenderer.on(THEIA_ELECTRON_IPC_CHANNEL_NAME, ipcMessageListener);
        this.toDispose.push(Disposable.create(() => ipcRenderer.removeListener(THEIA_ELECTRON_IPC_CHANNEL_NAME, ipcMessageListener)));
    }

    protected handleMessage(message: Uint8Array): void {
        const decoded = this.messageCodec.decode(message);
        this.onMessageEmitter.fire(decoded);
    }

    send(message: any): void {
        const encoded = this.messageCodec.encode(message);
        ipcRenderer.send(THEIA_ELECTRON_IPC_CHANNEL_NAME, encoded);
    }

}
