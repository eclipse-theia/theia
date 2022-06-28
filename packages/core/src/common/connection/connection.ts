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

import { Disposable, DisposableCollection } from '../disposable';
import { Emitter, Event } from '../event';

/**
 * Helper type to get a `Connection<any>` without triggering the linter.
 */
export type AnyConnection = Connection<any>;

/**
 * A `Connection` allows you to listen for messages and send messages back.
 *
 * Messages must arrive integrally and in the order they are sent!
 *
 * Most implementations are going to be API adapters.
 */
export interface Connection<T> {

    readonly state: Connection.State

    onOpen: Event<void>
    onClose: Event<void>
    /**
     * Emitted when something goes wrong with the underlying transport.
     * Typically when a message fails to be sent or received.
     */
    onError: Event<Error>
    onMessage: Event<T>
    sendMessage(message: T): void
    close(): void
}
export namespace Connection {

    export enum State {
        OPENING,
        OPENED,
        CLOSING,
        CLOSED
    }

    /**
     * @param connection
     * @returns Whether {@link connection} is or is going to be closed.
     */
    export function isClosed<C extends Connection<any>>(connection: C): connection is C & { state: State.CLOSING | State.CLOSED } {
        return connection.state === State.CLOSING || connection.state === State.CLOSED;
    }

    export async function waitForOpen<C extends Connection<any>>(connection: C): Promise<C> {
        if (isClosed(connection)) {
            throw new Error('connection is closed or closing!');
        } else if (connection.state === State.OPENED) {
            return connection;
        }
        await Event.wait(connection.onOpen);
        return connection;
    }
}

export abstract class AbstractConnection<T> implements Connection<T>, Disposable {

    abstract state: Connection.State;
    abstract close(): void;
    abstract sendMessage(message: T): void;

    protected disposables = new DisposableCollection();
    protected onOpenEmitter = this.disposables.pushThru(new Emitter<void>());
    protected onCloseEmitter = this.disposables.pushThru(new Emitter<void>());
    protected onErrorEmitter = this.disposables.pushThru(new Emitter<Error>());
    protected onMessageEmitter = this.disposables.pushThru(new Emitter<T>());

    get onOpen(): Event<void> {
        return this.onOpenEmitter.event;
    }

    get onClose(): Event<void> {
        return this.onCloseEmitter.event;
    }

    get onError(): Event<Error> {
        return this.onErrorEmitter.event;
    }

    get onMessage(): Event<T> {
        return this.onMessageEmitter.event;
    }

    dispose(): void {
        if (this.disposables.disposed) {
            throw new Error('connection is already disposed');
        }
        this.disposables.dispose();
    }

    /**
     * @throws if {@link state} is not {@link Connection.State.OPENING}.
     */
    protected setOpenedAndEmit(): void {
        this.ensureState(Connection.State.OPENING);
        this.state = Connection.State.OPENED;
        this.onOpenEmitter.fire();
    }

    /**
     * @throws if {@link state} is already {@link Connection.State.CLOSED}.
     */
    protected setClosedAndEmit(): void {
        this.ensureStateNot(Connection.State.CLOSED);
        this.state = Connection.State.CLOSED;
        this.onCloseEmitter.fire();
    }

    /**
     * @throws if {@link state} does not match anything in {@link states}.
     */
    protected ensureState(...states: Connection.State[]): void {
        if (states.every(state => this.state !== state)) {
            throw new Error(`unexpected connection state: ${Connection.State[this.state]}`);
        }
    }

    /**
     * @throws if {@link state} matches anything in {@link states}.
     */
    protected ensureStateNot(...states: Connection.State[]): void {
        if (states.some(state => this.state === state)) {
            throw new Error(`unexpected connection state: ${Connection.State[this.state]}`);
        }
    }
}
