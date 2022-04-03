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

import { injectable } from 'inversify';
import { serviceIdentifier } from './types';
import { Connection, ConnectionState } from './connection';
import { Emitter, Event } from './event';
import { DisposableCollection } from './disposable';

export const ConnectionTransformer = serviceIdentifier<ConnectionTransformer>('ConnectionTransformerFactory');
export type ConnectionTransformer = <From, To>(connection: Connection<From>, transformer: MessageTransformer<From, To>) => Connection<To>;

export interface MessageTransformer<From, To> {
    /**
     * Called with the received message to transform before emitting it back to readers.
     *
     * Note that you can filter incoming messages by not calling `emit`.
     */
    decode(message: From, emit: (message: To) => void): void
    /**
     * Called with the message to transform before sending to the underlying connection.
     */
    encode(message: To, write: (message: From) => void): void
}

@injectable()
export class TransformedConnection<From, To> implements Connection<To> {

    protected disposables = new DisposableCollection();
    protected onMessageEmitter = this.disposables.pushThru(new Emitter<To>());

    constructor(
        protected connection: Connection<From>,
        protected transformer: MessageTransformer<From, To>
    ) {
        this.connection.onMessage(message => {
            this.transformer.decode(message, decoded => this.onMessageEmitter.fire(decoded));
        }, undefined, this.disposables);
    }

    get state(): ConnectionState {
        return this.connection.state;
    }

    get onOpen(): Event<void> {
        return this.connection.onOpen;
    }

    get onClose(): Event<void> {
        return this.connection.onClose;
    }

    get onError(): Event<Error> {
        return this.connection.onError;
    }

    get onMessage(): Event<To> {
        return this.onMessageEmitter.event;
    }

    sendMessage(message: To): void {
        this.transformer.encode(message, encoded => this.connection.sendMessage(encoded));
    }

    close(): void {
        this.connection.close();
        this.disposables.dispose();
    }
}
