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

import { AbstractConnection, Connection } from '../connection';
import { serviceIdentifier } from '../types';

/**
 * Create a `Connection` which will buffer messages to send until the promise resolves.
 */
export const DeferredConnectionFactory = serviceIdentifier<DeferredConnectionFactory>('DeferredConnectionFactory');
export type DeferredConnectionFactory = <T>(connectionPromise: PromiseLike<Connection<T>>) => Connection<T>;

export class DeferredConnection<T> extends AbstractConnection<T> {

    protected connection?: Connection<T>;
    protected messageQueue: T[] = [];
    protected _interimState = Connection.State.OPENING;

    constructor(connectionPromise: PromiseLike<Connection<T>>) {
        super();
        connectionPromise.then(connection => this.handleConnection(connection));
    }

    get state(): Connection.State {
        return this.connection?.state ?? this._interimState;
    }

    sendMessage(message: T): void {
        if (this.connection) {
            this.connection.sendMessage(message);
        } else {
            this.messageQueue.push(message);
        }
    }

    close(): void {
        this._interimState = Connection.State.CLOSING;
        if (this.connection) {
            this.connection.close();
        }
    }

    protected handleConnection(connection: Connection<T>): void {
        this.connection = connection;
        this.connection.onOpen(() => this.onOpenEmitter.fire(), undefined, this.disposables);
        this.connection.onMessage(message => this.onMessageEmitter.fire(message), undefined, this.disposables);
        this.connection.onError(error => this.onErrorEmitter.fire(error), undefined, this.disposables);
        this.connection.onClose(() => {
            this.onCloseEmitter.fire();
            this.dispose();
        }, undefined, this.disposables);
        if (this.connection.state === Connection.State.OPENED) {
            this.onOpenEmitter.fire();
        }
        if (this.connection.state === Connection.State.CLOSED) {
            this.onCloseEmitter.fire();
            this.dispose();
        } else {
            this.processMessageQueue();
            if (this._interimState === Connection.State.CLOSING) {
                this.connection.close();
            }
        }
    }

    protected processMessageQueue(): void {
        this.messageQueue.forEach(message => this.connection!.sendMessage(message));
        this.messageQueue.length = 0;
    }
}
