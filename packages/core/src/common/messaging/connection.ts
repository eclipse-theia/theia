/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Disposable } from '../disposable';
import { Emitter, Event } from '../event';

export interface Connection extends Disposable {
    readonly state: Connection.State
    readonly onOpen: Event<this>
    readonly onMessage: Event<string>
    readonly onError: Event<string>
    readonly onClose: Event<Readonly<Connection.CloseEvent>>
    sendMessage(message: string): void
    close(event: Connection.CloseEvent): void
}

export namespace Connection {
    export enum State {
        Opening,
        Open,
        Closing,
        Closed,
    }
    export interface CloseEvent {
        code: number
        reason?: string
    }
    export function normalizeCloseEvent(event: CloseEvent): CloseEvent {
        return {
            code: event.code,
            reason: event.reason,
        };
    }
    export function ensureOpening(connection: Connection): void {
        if (connection.state !== State.Opening) {
            throw new Error(`connection is not opening: ${State[connection.state]}`);
        }
    }
    export function ensureOpened(connection: Connection): void {
        if (connection.state !== State.Open) {
            throw new Error(`connection is not opened: ${State[connection.state]}`);
        }
    }
    export function ensureNotClosing(connection: Connection): void {
        if (connection.state === State.Closing) {
            throw new Error('connection is closing');
        }
    }
    export function ensureNotClosed(connection: Connection): void {
        if (connection.state === State.Closed) {
            throw new Error('connection is closed');
        }
    }
    /**
     * Abstract helper to create `Connection` implementations.
     */
    export abstract class AbstractBase implements Connection {

        abstract state: Connection.State;

        protected onOpenEmitter = new Emitter<this>();
        protected onMessageEmitter = new Emitter<string>();
        protected onCloseEmitter = new Emitter<Connection.CloseEvent>();
        protected onErrorEmitter = new Emitter<string>();

        get onOpen(): Event<this> {
            return this.onOpenEmitter.event;
        }

        get onMessage(): Event<string> {
            return this.onMessageEmitter.event;
        }

        get onClose(): Event<Connection.CloseEvent> {
            return this.onCloseEmitter.event;
        }

        get onError(): Event<string> {
            return this.onErrorEmitter.event;
        }

        abstract sendMessage(message: string): void;

        abstract close(event: Connection.CloseEvent): void;

        dispose(): void {
            this.close({ code: 0 });
        }
    }
}
