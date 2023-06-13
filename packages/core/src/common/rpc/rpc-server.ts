// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import type { interfaces } from 'inversify';
import { isFunction, isObject } from '../types';
import type { CancellationToken } from '../cancellation';
import type { Event } from '../event';

/**
 * Ensure that the prefix `P` is part of the final string.
 *
 * Won't do anything if `T` is already prefixed with `P`.
 */
type EnsurePrefix<P extends string, T> =
    T extends `${P}${string}` ? T :
    T extends string ? `${P}${T}` :
    never;

type WithoutCancellationToken<T extends unknown[]> =
    T extends [...infer U, CancellationToken?] ? U :
    T;

export const RpcServerProvider = Symbol('RpcServerProvider') as symbol & interfaces.Abstract<RpcServerProvider>;
export interface RpcServerProvider {
    <T extends object = any>(proxyPath: unknown): T;
}

/**
 * Special opaque marker type to send events over RPC.
 */
export abstract class RpcContextEvent<T> {
    constructor(readonly value: T) { }
}

/**
 * Event API for RPC.
 */
export abstract class RpcEvent<T> {
    abstract readonly onSendAll: Event<RpcEvent.SendAllEvent<T>>;
    abstract readonly onSendTo: Event<RpcEvent.SendToEvent<T>>;
    abstract sendAll(event: T, exceptions?: unknown[]): void;
    abstract sendTo(event: T, targets: unknown[]): void;
}
export namespace RpcEvent {

    export interface SendAllEvent<T> {
        value: T;
        exceptions?: unknown[]
    }

    export interface SendToEvent<T> {
        value: T
        targets: unknown[]
    }

    export function is(value: unknown): value is RpcEvent<any> {
        return isObject<RpcEvent<any>>(value)
            && isFunction(value.onSendAll)
            && isFunction(value.onSendTo)
            && isFunction(value.sendAll)
            && isFunction(value.sendTo);
    }
}

/**
 * Define and use keys to share contextual values when handling RPC.
 */
export type RpcContextKey<T> = (string | symbol) & { $rpcContextType?: T };
export function RpcContextKey<T>(key: string | symbol): RpcContextKey<T> {
    return key as RpcContextKey<T>;
}

/**
 * API to get information about the current RPC invocation.
 */
export interface RpcContext {
    /**
     * TODO
     */
    readonly sender: unknown;
    /**
     * *Might* be defined when handling an async request.
     */
    readonly request?: CancellationToken;
    /**
     * Try and get the value associated with the context key.
     *
     * Will return `undefined` if a value for the context is not defined.
     */
    get<T = any>(key: RpcContextKey<T>): T | undefined;
    /**
     * Get the value associated with the context key.
     *
     * Will throw if a value for the context is not defined.
     */
    require<T = any>(key: RpcContextKey<T>): T;
}

/**
 * A `RpcServer` is an instance that will answer RPC calls.
 *
 * You'll need to implement all methods from `T` prefixed with `$` as well as
 * taking an extra first argument `RpcContext`.
 *
 * The `$` prefix is required to avoid remote RPC clients from invoking methods
 * that weren't intended to be called remotely, such as protected methods. TS
 * doesn't output any information about public/protected/private methods, so
 * we need to rely on a naming convention such as prefixing with `$`.
 *
 * The `RpcContext` API provided allows you to extract more information about
 * how the remote procedure call happened: You may get the cancellation token
 * associated to the request if there is one, you may get a reference to the
 * Electron `WebContents` that sent the request, etc. Note that the values
 * depend on the context in which your `RpcServer` is invoked: You must know
 * what to expect based on where and how your server was bound.
 *
 * @example
 *
 * interface MyService {
 *     myMethod(a: string, b: number): Promise<void>
 * }
 *
 * class MyServiceImpl implements RpcServer<MyService> {
 *
 *     async $myMethod(ctx: RpcContext, a: string, b: number): Promise<void> {
 *         // ...
 *     }
 *
 *     protected someProtectedMethodThatWontBeProxied(): void {
 *         // ...
 *     }
 * }
 */
export type RpcServer<T> = {
    [K in keyof T as EnsurePrefix<'$', K>]-?:
    T[K] extends Event<infer U> ? RpcEvent<U> :
    T[K] extends (...params: infer U) => infer V ? (ctx: RpcContext, ...params: WithoutCancellationToken<U>) => V :
    undefined;
};
