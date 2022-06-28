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

import type { Readable, Writable } from 'stream';
import { AbstractConnection, Connection } from '../../common/connection/connection';

/**
 * Wrap a tuple of ({@link Readable}, {@link Writable}) into a {@link Connection}.
 *
 * _Note that this object takes ownership of the reader and writer instances,
 * meaning that it will destroy them upon close._
 */
export class ObjectStreamConnection extends AbstractConnection<any> {

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
        this.reader.once('close', () => this.setClosedAndEmit());
        this.reader.on('data', message => this.onMessageEmitter.fire(message));
    }

    sendMessage(message: any): void {
        this.writer.write(message);
    }

    close(): void {
        this.reader.destroy();
        this.writer.destroy();
    }
}
