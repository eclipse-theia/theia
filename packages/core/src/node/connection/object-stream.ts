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

import type { Readable, Writable } from 'stream';
import { AbstractConnection, Connection } from '../../common/connection/connection';
import { pushDisposableListener } from '../../common/node-event-utils';

/**
 * Wrap a pair of ({@link Readable}, {@link Writable}) into a {@link Connection}.
 */
export class ObjectStreamConnection<T> extends AbstractConnection<T> {

    state = Connection.State.OPENED;

    constructor(
        protected reader: Readable,
        protected writer: Writable
    ) {
        super();
        if (!this.reader.readableObjectMode) {
            throw new Error('readable stream must support objects');
        }
        if (!this.writer.writableObjectMode) {
            throw new Error('writable stream must support objects');
        }
        pushDisposableListener(this.disposables, this.reader, 'close', () => this.setClosedAndEmit());
        pushDisposableListener<[T]>(this.disposables, this.reader, 'data', data => this.handleReaderData(data));
        this.onClose(() => this.dispose());
    }

    sendMessage(message: T): void {
        this.writer.write(message);
    }

    close(): void {
        this.setClosedAndEmit();
    }

    protected handleReaderData(data: T): void {
        this.onMessageEmitter.fire(data);
    }
}
