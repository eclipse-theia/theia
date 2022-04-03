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

import { injectable } from 'inversify';
import { Disposable, DisposableCollection } from './disposable';
import { Emitter, Event } from './event';
import { MaybePromise, serviceIdentifier } from './types';

export enum ConnectionState {
    OPENING,
    OPENED,
    CLOSING,
    CLOSED,
}
export namespace ConnectionState {
    /**
     * @param connection
     * @returns Whether `connection` is or is going to be closed.
     */
    export function isClosed<T>(connection: Connection<T>): connection is Connection<T> & { state: ConnectionState.CLOSING | ConnectionState.CLOSED } {
        return connection.state === ConnectionState.CLOSING || connection.state === ConnectionState.CLOSED;
    }
}

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
export const Connection = serviceIdentifier<Connection<any>>('Connection');
export interface Connection<T> {
    readonly state: ConnectionState
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

@injectable()
export abstract class AbstractConnection<T> implements Connection<T>, Disposable {

    abstract state: ConnectionState;
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
     * @throws if {@link state} is not {@link ConnectionState.OPENING}.
     */
    protected setOpenedAndEmit(): void {
        this.ensureState(ConnectionState.OPENING);
        this.state = ConnectionState.OPENED;
        this.onOpenEmitter.fire();
    }

    /**
     * @throws if {@link state} is already {@link ConnectionState.CLOSED}.
     */
    protected setClosedAndEmit(): void {
        this.ensureStateNot(ConnectionState.CLOSED);
        this.state = ConnectionState.CLOSED;
        this.onCloseEmitter.fire();
    }

    /**
     * @throws if {@link state} does not match anything in {@link states}.
     */
    protected ensureState(...states: ConnectionState[]): void {
        if (states.every(state => this.state !== state)) {
            throw new Error(`unexpected connection state: ${ConnectionState[this.state]}`);
        }
    }

    /**
     * @throws if {@link state} matches anything in {@link states}.
     */
    protected ensureStateNot(...states: ConnectionState[]): void {
        if (states.some(state => this.state === state)) {
            throw new Error(`unexpected connection state: ${ConnectionState[this.state]}`);
        }
    }
}

/**
 * Get or create outgoing connections.
 */
export const ConnectionProvider = serviceIdentifier<ConnectionProvider<any, any>>('ConnectionProvider');
export interface ConnectionProvider<T, P extends object = any> {
    open(params: P): Connection<T>
}

/**
 * @param params
 * @param handle Call this method to accept the connection and get access to it.
 * @param next Let other handlers run. Pass `error` to stop.
 */
export type ConnectionEmitterHandler<T, P extends object = any> = (params: P, accept: () => Connection<T>, next: (error?: Error) => void) => MaybePromise<void>;

/**
 * Listen for incoming connections.
 */
export const ConnectionEmitter = serviceIdentifier<ConnectionEmitter<any, any>>('ConnectionEmitter');
export interface ConnectionEmitter<T, P extends object = any> {
    listen(handler: ConnectionEmitterHandler<T, P>): void;
}

/**
 * Create a `Connection` which will buffer messages to send until the promise resolves.
 */
export const DeferredConnectionFactory = serviceIdentifier<DeferredConnectionFactory>('DeferredConnectionFactory');
export type DeferredConnectionFactory = <T>(connectionPromise: PromiseLike<Connection<T>>) => Connection<T>;

export class DeferredConnection<T> extends AbstractConnection<T> {

    protected connection?: Connection<T>;
    protected messageQueue: T[] = [];
    protected _interimState = ConnectionState.OPENING;

    constructor(connectionPromise: PromiseLike<Connection<T>>) {
        super();
        connectionPromise.then(connection => {
            this.connection = connection;
            this.connection.onOpen(() => this.onOpenEmitter.fire(), undefined, this.disposables);
            this.connection.onMessage(message => this.onMessageEmitter.fire(message), undefined, this.disposables);
            this.connection.onError(error => this.onErrorEmitter.fire(error), undefined, this.disposables);
            this.connection.onClose(() => {
                this.onCloseEmitter.fire();
                this.dispose();
            }, undefined, this.disposables);
            if (this.connection.state === ConnectionState.OPENED) {
                this.onOpenEmitter.fire();
            }
            if (this.connection.state === ConnectionState.CLOSED) {
                this.onCloseEmitter.fire();
                this.dispose();
            } else {
                this.processMessageQueue();
                if (this._interimState === ConnectionState.CLOSING) {
                    this.connection.close();
                }
            }
        });
    }

    get state(): ConnectionState {
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
        this._interimState = ConnectionState.CLOSING;
        if (this.connection) {
            this.connection.close();
        }
    }

    protected processMessageQueue(): void {
        this.messageQueue.forEach(message => this.connection!.sendMessage(message));
        this.messageQueue.length = 0;
    }
}

/**
 * Sometimes we may use connections that didn't require an initial request to
 * connect the two peers. In such a scenario, one peer might start using the
 * connection before the remote peer started listening (timing issue).
 *
 * This method runs a small handshake protocol on {@link connection} to make
 * sure that both peers are listening before running other protocols.
 *
 * _e.g. Using Node's fork IPC channel: the channel is established as the
 * process is forked, but listeners are only eventually attached once the
 * running code initializes itself asynchronously._
 */
export function waitForRemote(connection: Connection<any>): Promise<Connection<any>> {
    return new Promise((resolve, reject) => {
        const disposables = new DisposableCollection();
        connection.onClose(() => {
            disposables.dispose();
            reject(new Error('connection closed'));
        }, undefined, disposables);
        let received_ping_once = false;
        connection.onMessage((message: PingMessage) => {
            if (message === PingMessage.PING) {
                if (!received_ping_once) {
                    received_ping_once = true;
                    // Resend ping in case our initial ping wasn't received.
                    // (e.g. the remote peer wasn't listening yet.)
                    // If it was received, this second ping will be ignored.
                    connection.sendMessage(PingMessage.PING);
                    connection.sendMessage(PingMessage.PONG);
                }
            } else if (message === PingMessage.PONG) {
                resolve(connection);
                disposables.dispose();
            } else {
                console.warn('ping/pong: unexpected message:', message);
            }
        }, undefined, disposables);
        connection.sendMessage(PingMessage.PING);
    });
}

export enum PingMessage {
    PING = 'ping',
    PONG = 'pong'
}
