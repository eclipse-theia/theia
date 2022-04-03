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

import { MaybePromise, serviceIdentifier } from './types';
import { Emitter, Event } from './event';

export enum ConnectionState {
    OPENING,
    OPENED,
    CLOSING,
    CLOSED,
}
export namespace ConnectionState {
    export function isClosed<T>(connection: Connection<T>): connection is Connection<T> & { state: ConnectionState.CLOSING | ConnectionState.CLOSED } {
        return connection.state === ConnectionState.CLOSING || connection.state === ConnectionState.CLOSED;
    }
}

/**
 * A `Connection` allows you to listen for messages and send messages back.
 *
 * Most implementations are going to be API adapters.
 */
export const Connection = serviceIdentifier<Connection<any>>('Connection');
export interface Connection<T> {
    readonly state: ConnectionState
    onClose: Event<void>
    onError: Event<Error>
    onMessage: Event<T>
    sendMessage(message: T): void
    close(): void
}

/**
 * This function only performs a static cast!
 *
 * Let's assume that on one hand you have a connection handling generic objects
 * such as `Connection<object>`, and you want to pass that connection to a
 * function that declares it will send its own type `{ data: string }`:
 *
 * ```ts
 * const myConnection: Connection<object> = '...';
 * type MyMessage = { data: string };
 * function willSendObjects(transport: Connection<MyMessage>): void {
 *     // ...
 * }
 * willSendObjects(myConnection); // FAILS!
 * ```
 *
 * Here what we want is to make sure that `MyMessage` is assignable to the type
 * of the underlying connection: `object` in this case. But TypeScript does the
 * check the other way and fails because we can't assign `object` to `MyMessage`.
 *
 * This is where `castConnection<From, To>` helps us:
 *
 * ```ts
 * // Here TypeScript will infer everything based on both the type of
 * // `myConnection` and the expected type from `willSendObjects`:
 * willSendObjects(castConnection(myConnection));
 * ```
 *
 * This evaluates to `castConnection<object, MyMessage>` and will return
 * `Connection<MyMessage>` if `MyMessage` is assignable to `object`. Otherwise
 * it will return `unknown` which should trip the compilation.
 */
export function castConnection<From, To>(connection: Connection<From>): To extends From ? Connection<To> : unknown {
    return connection as any;
}

export abstract class AbstractConnection<T> implements Connection<T> {

    abstract state: ConnectionState;
    abstract close(): void;
    abstract sendMessage(message: T): void;

    protected _onCloseEmitter = new Emitter<void>();
    protected _onErrorEmitter = new Emitter<Error>();
    protected _onMessageEmitter = new Emitter<T>();

    get onClose(): Event<void> {
        return this._onCloseEmitter.event;
    }

    get onError(): Event<Error> {
        return this._onErrorEmitter.event;
    }

    get onMessage(): Event<T> {
        return this._onMessageEmitter.event;
    }
}

export enum ConnectionProviderOpenMode {
    CREATE,
    GET,
    GET_OR_CREATE
}

export interface ConnectionProviderOpenParams {
    /**
     * @default ConnectionProviderOpenMode.CREATE
     */
    mode?: ConnectionProviderOpenMode
}

/**
 * Get or create outgoing connections.
 */
export const ConnectionProvider = serviceIdentifier<ConnectionProvider<any, any>>('ConnectionProvider');
export interface ConnectionProvider<T, P extends object = any> {
    open(params: P & ConnectionProviderOpenParams): Connection<T>
}

export type ConnectionEmitterHandler<T, P extends object = any> = (connection: Connection<T>, params: P) => MaybePromise<boolean | null | undefined>;

/**
 * Listen for incoming connections.
 */
export const ConnectionEmitter = serviceIdentifier<ConnectionEmitter<any, any>>('ConnectionEmitter');
export interface ConnectionEmitter<T, P extends object = any> {
    listen(accept: ConnectionEmitterHandler<T, P>): void;
}

/**
 * Create a `Connection` which will buffer messages to send until the promise resolves.
 */
export const DeferredConnectionFactory = serviceIdentifier<DeferredConnectionFactory>('DeferredConnectionFactory');
export type DeferredConnectionFactory = <T>(connectionPromise: PromiseLike<Connection<T>>) => Connection<T>;

export class DeferredConnection<T> extends AbstractConnection<T> {

    protected connection?: Connection<T>;
    protected connectionPromise: Promise<Connection<T>>;

    constructor(connectionPromise: PromiseLike<Connection<T>>) {
        super();
        this.connectionPromise = Promise.resolve(connectionPromise).then(connection => {
            this.connection = connection;
            this.connection.onMessage(message => this._onMessageEmitter.fire(message));
            this.connection.onError(error => this._onErrorEmitter.fire(error));
            this.connection.onClose(() => this._onCloseEmitter.fire());
            return this.connection;
        });
    }

    get state(): ConnectionState {
        return this.connection?.state ?? ConnectionState.OPENING;
    }

    sendMessage(message: T): void {
        this.connectionPromise.then(connection => connection.sendMessage(message));
    }

    close(): void {
        this.connectionPromise.then(connection => connection.close());
    }
}
