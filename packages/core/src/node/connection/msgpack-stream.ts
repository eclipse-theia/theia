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

import { Packr, Unpackr } from 'msgpackr';
import { Readable, Writable } from 'stream';
import { AbstractConnection, Connection } from '../../common/connection/connection';

export interface MsgpackStreamOptions {
    packr?: Packr,
    unpackr?: Unpackr
}

export class MsgpackStreamConnection<T> extends AbstractConnection<T> {

    state = Connection.State.OPENED;

    protected packr: Packr;
    protected unpackr: Unpackr;

    protected writeBufferFull = false;
    protected messagesToDrain: T[] = [];
    protected incompleteReadBuffer?: Buffer;

    constructor(
        protected reader: Readable,
        protected writer: Writable,
        options?: MsgpackStreamOptions
    ) {
        super();
        this.packr = options?.packr ?? new Packr();
        this.unpackr = options?.unpackr ?? new Unpackr();
        this.reader.on('data', chunk => this.handleChunk(chunk));
        this.writer.on('drain', () => this.drain());
    }

    sendMessage(message: T): void {
        if (this.writeBufferFull) {
            this.messagesToDrain.push(message);
        } else if (!this.write(message)) {
            this.writeBufferFull = true;
        }
    }

    close(): void {
        throw new Error('not implemented');
    }

    /**
     * When `false` is returned it means we should wait for the drain event.
     */
    protected write(message: T): boolean {
        return this.writer.write(this.packr.pack(message));
    }

    protected handleChunk(chunk: Buffer): void {
        if (this.incompleteReadBuffer) {
            chunk = Buffer.concat([this.incompleteReadBuffer, chunk]);
            this.incompleteReadBuffer = undefined;
        }
        let values: T[] | undefined;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            values = this.unpackr.unpackMultiple(chunk) as any[] | undefined;
        } catch (error) {
            if (error.incomplete) {
                this.incompleteReadBuffer = chunk.slice(error.lastPosition);
                values = error.values;
            }
        } finally {
            values?.forEach(value => this.onMessageEmitter.fire(value));
        }
    }

    protected drain(): void {
        this.writeBufferFull = false;
        let message; while (message = this.messagesToDrain.shift()) {
            if (!this.write(message)) {
                this.writeBufferFull = true;
                return;
            }
        }
    }
}
