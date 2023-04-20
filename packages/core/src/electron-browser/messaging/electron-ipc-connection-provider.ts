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

import { inject, injectable, interfaces } from 'inversify';
import { AbstractChannel, Channel, WriteBuffer } from '../../common';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';
import { JsonRpcProxy } from '../../common/messaging';
import { AbstractConnectionProvider } from '../../common/messaging/abstract-connection-provider';
import { MessagePortClient } from '../../electron-common';
import { ElectronConnectionHandlerId } from '../../electron-common/messaging/electron-connection-handler';

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

    constructor(
        @inject(MessagePortClient) protected messagePortClient: MessagePortClient
    ) {
        super();
        this.initializeMultiplexer();
    }

    protected createMainChannel(): Channel {
        return new ElectronIpcRendererChannel(this.messagePortClient.connectSync(ElectronConnectionHandlerId));
    }

}

export class ElectronIpcRendererChannel extends AbstractChannel {

    protected messagePort?: MessagePort;

    constructor(messagePort: MessagePort) {
        super();
        this.messagePort = messagePort;
        const listener = (event: MessageEvent) => this.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(event.data));
        this.messagePort.addEventListener('message', listener);
        this.toDispose.push({
            dispose: () => {
                this.messagePort!.removeEventListener('message', listener);
                this.messagePort!.close();
                this.messagePort = undefined;
            }
        });
        this.messagePort.start();
    }

    getWriteBuffer(): WriteBuffer {
        const writer = new Uint8ArrayWriteBuffer();
        writer.onCommit(buffer => this.messagePort?.postMessage(buffer));
        return writer;
    }
}
