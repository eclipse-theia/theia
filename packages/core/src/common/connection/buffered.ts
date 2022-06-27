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

import { Connection } from '../connection';
import { DisposableCollection } from '../disposable';
import { Emitter, Event } from '../event';

/**
 * A `BufferedConnection` will queue messages until the next tick and send
 * everything as an array. Note that this has nothing to do with byte buffers.
 */
export class BufferedConnection<T> implements Connection<T> {

    protected buffered?: T[];
    protected disposables = new DisposableCollection();
    protected onMessageEmitter = this.disposables.pushThru(new Emitter<T>());

    constructor(
        protected transport: Connection<T[]>
    ) {
        transport.onClose(() => {
            this.buffered = undefined;
            this.disposables.dispose();
        });
        transport.onMessage(messages => {
            messages.forEach(message => {
                this.onMessageEmitter.fire(message);
            });
        });
    }

    get state(): Connection.State {
        return this.transport.state;
    }

    get onClose(): Event<void> {
        return this.transport.onClose;
    }

    get onError(): Event<Error> {
        return this.transport.onError;
    }

    get onMessage(): Event<T> {
        return this.onMessageEmitter.event;
    }

    get onOpen(): Event<void> {
        return this.transport.onOpen;
    }

    sendMessage(message: T): void {
        if (!this.buffered) {
            this.buffered = [];
            queueMicrotask(() => {
                if (this.buffered) {
                    this.transport.sendMessage(this.buffered);
                    this.buffered = undefined;
                }
            });
        }
        this.buffered.push(message);
    }

    close(): void {
        this.transport.close();
    }
}
