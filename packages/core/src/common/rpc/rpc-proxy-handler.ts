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

/* eslint-disable @typescript-eslint/no-explicit-any, no-null/no-null */

import { CancellationToken } from '../cancellation';
import { Emitter } from '../event';
import { RpcClient, RpcHandler } from './rpc-api';

/**
 * Use this to create {@link Proxy} wrappers using Theia's RPC API:
 *
 * - `onSomeEvent` becomes an `Event`.
 * - `notifySomething` sends a message without expecting a response.
 * - `methodNameSync` sends a message and waits for a sync response.
 * - `methodName` sends a message and waits for an async response.
 */
export class RpcProxyHandler implements ProxyHandler<object> {

    protected emitters: Record<string, Emitter<unknown>> = Object.create(null);
    protected propertyCache: Record<string, unknown> = Object.create(null);

    constructor(
        protected client: RpcClient,
        protected handler?: RpcHandler
    ) {
        this.handler?.handleNotification?.((eventName, event) => this.handleNotification(eventName, event));
    }

    get(target: object, propertyName: keyof object, receiver: unknown): unknown {
        if (typeof propertyName === 'symbol') {
            return target[propertyName];
        }
        return this.propertyCache[propertyName] ??= this.createField(propertyName);
    }

    protected handleNotification(eventName: string, params?: unknown[]): void {
        this.emitters[eventName]?.fire(params?.[0]);
    }

    protected createField(propertyName: string): (...params: any[]) => any {
        if (this.isEvent(propertyName)) {
            const { event } = this.emitters[propertyName] = new Emitter();
            return event;
        }
        if (this.isNotificationMethod(propertyName)) {
            return (...args) => this.ensurePropertyIsDefined(this.client, 'sendNotification', 'this instance does not support sending notifications')
                .sendNotification(propertyName, args);
        }
        if (this.isSyncMethod(propertyName)) {
            return (...args) => this.ensurePropertyIsDefined(this.client, 'sendRequestSync', 'this instance does not support sending sync requests')
                .sendRequestSync(propertyName, args);
        }
        if (this.isAsyncMethod(propertyName)) {
            return (...args) => this.ensurePropertyIsDefined(this.client, 'sendRequest', 'this instance does not support sending async requests')
                .sendRequest(propertyName, ...this.extractCancellationToken(args));
        }
        throw new Error(`unhandled property: ${propertyName}`);
    }

    protected ensurePropertyIsDefined<T, K extends keyof T>(target: T | undefined, propertyName: K, error: string): T & { [key in K]-?: T[K] } {
        if (!target?.[propertyName]) {
            throw new TypeError(`"${propertyName.toString()}" is undefined: ${error}`);
        }
        return target as T & { [key in K]-?: T[K] };
    }

    protected isEvent(propertyName: string): boolean {
        return /^on[A-Z]/.test(propertyName);
    }

    protected isNotificationMethod(propertyName: string): boolean {
        return /^notify[A-Z]/.test(propertyName);
    }

    protected isSyncMethod(propertyName: string): boolean {
        return /Sync$/.test(propertyName);
    }

    protected isAsyncMethod(propertyName: string): boolean {
        return true;
    }

    protected extractCancellationToken(params: readonly unknown[]): [params: unknown[], cancel?: CancellationToken] {
        if (params.length === 0) {
            return [[]];
        }
        const last = params[params.length - 1];
        if (CancellationToken.is(last)) {
            return [params.slice(0, params.length - 1), last];
        }
        return [params.slice()];
    }
}
