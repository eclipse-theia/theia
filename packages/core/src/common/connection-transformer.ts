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
import { serviceIdentifier } from '.';
import { Connection, ConnectionState } from './connection';
import { Emitter, Event } from './event';

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
    encode(message: To, write: (message: To) => void): void
}

@injectable()
export class TransformedConnection implements Connection<unknown> {

    protected connection?: Connection<unknown>;
    protected transformer?: MessageTransformer<unknown, unknown>;
    protected onMessageEmitter = new Emitter<unknown>();

    get state(): ConnectionState {
        return this.connection!.state;
    }

    get onClose(): Event<void> {
        return this.connection!.onClose;
    }

    get onError(): Event<Error> {
        return this.connection!.onError;
    }

    get onMessage(): Event<unknown> {
        return this.onMessageEmitter.event;
    }

    initialize<From, To>(connection: Connection<From>, transformer: MessageTransformer<From, To>): Connection<To> {
        this.connection = connection;
        this.transformer = transformer;
        this.connection.onMessage(message => {
            this.transformer!.decode(message, decoded => this.onMessageEmitter.fire(decoded));
        });
        return this as Connection<To>;
    }

    sendMessage(message: unknown): void {
        this.transformer!.encode(message, encoded => this.connection!.sendMessage(encoded));
    }

    close(): void {
        this.connection!.close();
    }
}
