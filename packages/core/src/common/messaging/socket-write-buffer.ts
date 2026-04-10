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
import { WebSocket } from './web-socket-channel';

@injectable()
export class SocketWriteBuffer {
    private static readonly DEFAULT_DISCONNECTED_BUFFER_SIZE = 100 * 1024;

    protected disconnectedBuffer: Uint8Array | undefined;
    protected bufferWritePosition = 0;

    protected get maxBufferSize(): number {
        return SocketWriteBuffer.DEFAULT_DISCONNECTED_BUFFER_SIZE;
    }

    buffer(data: Uint8Array): void {
        this.ensureWriteBuffer(data.byteLength);
        this.disconnectedBuffer?.set(data, this.bufferWritePosition);
        this.bufferWritePosition += data.byteLength;
    }

    protected ensureWriteBuffer(byteLength: number): void {
        if (!this.disconnectedBuffer) {
            this.disconnectedBuffer = new Uint8Array(this.maxBufferSize);
            this.bufferWritePosition = 0;
        }

        if (this.bufferWritePosition + byteLength > this.disconnectedBuffer.byteLength) {
            throw new Error(`Max disconnected buffer size exceeded by adding ${byteLength} bytes`);
        }
    }

    flush(socket: WebSocket): void {
        if (this.disconnectedBuffer) {
            socket.send(this.disconnectedBuffer.slice(0, this.bufferWritePosition));
            this.disconnectedBuffer = undefined;
        }
    }

    drain(): void {
        this.disconnectedBuffer = undefined;
    }
}
