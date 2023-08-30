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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, interfaces } from 'inversify';
import { RpcProxy } from '../../common/messaging';
import { AbstractConnectionProvider } from '../../common/messaging/abstract-connection-provider';
import { AbstractChannel, Channel, WriteBuffer } from '../../common';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';

export interface ElectronIpcOptions {
}

/**
 * Connection provider between the Theia frontend and the electron-main process via IPC.
 */
@injectable()
export class ElectronIpcConnectionProvider extends AbstractConnectionProvider<ElectronIpcOptions> {

    static override createProxy<T extends object>(container: interfaces.Container, path: string, arg?: object): RpcProxy<T> {
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

    constructor() {
        super();
        this.toDispose.push(window.electronTheiaCore.onData(data => this.onMessageEmitter.fire(() => new Uint8ArrayReadBuffer(data))));

    }

    getWriteBuffer(): WriteBuffer {
        const writer = new Uint8ArrayWriteBuffer();
        writer.onCommit(buffer => window.electronTheiaCore.sendData(buffer));
        return writer;
    }

}
