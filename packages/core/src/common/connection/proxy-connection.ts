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

import { DisposableCollection } from '../disposable';
import { Emitter, Event } from '../event';
import { AbstractConnection, Connection } from './connection';

/**
 * A connection proxy wraps another connection and forwards most events.
 */
export interface ProxyConnection<T> extends Connection<T> {
    readonly connected: boolean
    onReconnect: Event<void>;
    onDisconnect: Event<void>;
    connect(connection: Connection<T>): this
}
export namespace ProxyConnection {
    export function ensureFree<C extends ProxyConnection<unknown>>(proxy: C): C {
        if (proxy.connected) {
            throw new Error('proxy connection is already connected');
        }
        return proxy;
    }
}

export interface ProxyConnectionRegistry {

}

export class DefaultProxyConnection<T> extends AbstractConnection<T> implements ProxyConnection<T> {

    state = Connection.State.OPENING;

    protected connection?: Connection<T>;
    protected connectionDisposables = new DisposableCollection();
    protected onReconnectEmitter = new Emitter<void>();
    protected onDisconnectEmitter = new Emitter<void>();
    protected bufferedMessages: T[] = [];

    get connected(): boolean {
        return this.connection !== undefined;
    }

    get onReconnect(): Event<void> {
        return this.onReconnectEmitter.event;
    }

    get onDisconnect(): Event<void> {
        return this.onDisconnectEmitter.event;
    }

    sendMessage(message: T): void {
        if (this.connection) {
            this.connection.sendMessage(message);
        } else {
            this.bufferedMessages.push(message);
        }
    }

    connect(connection: Connection<T>): this {
        this.ensureStateNot(Connection.State.CLOSING, Connection.State.CLOSED);
        if (this.connection) {
            throw new Error('already connected!');
        }
        if (Connection.isClosed(connection)) {
            throw new Error('connection is closed or closing!');
        }
        this.connection = connection;
        this.connection.onMessage(message => this.onMessageEmitter.fire(message), undefined, this.connectionDisposables);
        this.connection.onError(error => this.onErrorEmitter.fire(error), undefined, this.connectionDisposables);
        this.connection.onClose(() => this.handleConnectionClose(), undefined, this.connectionDisposables);
        if (this.state === Connection.State.OPENING) {
            this.setOpenedAndEmit();
        } else if (this.state === Connection.State.OPENED) {
            this.onReconnectEmitter.fire();
        }
        this.bufferedMessages.forEach(message => this.connection!.sendMessage(message));
        this.bufferedMessages.length = 0;
        return this;
    }

    close(): void {
        if (this.connection) {
            const { connection } = this;
            this.connection = undefined;
            this.connectionDisposables.dispose();
            connection.close();
        }
        this.setClosedAndEmit();
        this.dispose();
    }

    protected disconnect(): void {
        if (!this.connection) {
            throw new Error('not connected!');
        }
        this.connection = undefined;
        this.connectionDisposables.dispose();
        this.onDisconnectEmitter.fire();
    }

    protected handleConnectionClose(): void {
        this.disconnect();
    }
}
