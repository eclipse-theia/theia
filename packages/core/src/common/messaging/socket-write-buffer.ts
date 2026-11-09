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

import { injectable } from 'inversify';
import { WebSocket } from './web-socket-channel.js';

@injectable()
export class SocketWriteBuffer {
    private static readonly DEFAULT_DISCONNECTED_BUFFER_SIZE = 100 * 1024;

    protected bufferedMessages: Uint8Array[] = [];
    protected bufferedBytes = 0;

    protected get maxBufferSize(): number {
        return SocketWriteBuffer.DEFAULT_DISCONNECTED_BUFFER_SIZE;
    }

    buffer(data: Uint8Array): void {
        this.ensureWriteBuffer(data.byteLength);
        this.bufferedMessages.push(data);
        this.bufferedBytes += data.byteLength;
    }

    protected ensureWriteBuffer(byteLength: number): void {
        if (this.bufferedBytes + byteLength > this.maxBufferSize) {
            throw new Error(`Max disconnected buffer size exceeded by adding ${byteLength} bytes`);
        }
    }

    /**
     * Sends each buffered message on its own: the receiving side reads one message per socket message.
     */
    flush(socket: WebSocket): void {
        const messages = this.bufferedMessages;
        this.drain();
        for (const message of messages) {
            socket.send(message);
        }
    }

    drain(): void {
        this.bufferedMessages = [];
        this.bufferedBytes = 0;
    }
}
