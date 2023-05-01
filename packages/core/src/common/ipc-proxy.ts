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

import { Emitter, Event } from './event';

// type EventField = `on${string}`;
// type NotificationMethod = `notify${string}`;
// type SyncRequestMethod = `${string}Sync`;

// export interface Proxyable {
//     [propertyName: EventField]: Event<unknown>;
//     [propertyName: NotificationMethod]: (...params: unknown[]) => void;
//     [propertyName: SyncRequestMethod]: (...params: unknown[]) => unknown;
//     [propertyName: Exclude<string, EventField | NotificationMethod | SyncRequestMethod>]: (...params: unknown[]) => Promise<unknown>;
// }

export interface ProxyClient {
    handleEvent?(handler: (eventName: string, event: unknown) => void): void;
    handleNotification?(handler: (methodName: string, params: unknown[]) => void): void;
    handleRequestSync?(handler: (methodName: string, params: unknown[]) => unknown): void;
    handleRequest?(handler: (methodName: string, params: unknown[]) => unknown): void;
    sendEvent?(eventName: string, event: unknown): void;
    sendNotification?(methodName: string, params: unknown[]): void;
    sendRequestSync?(methodName: string, params: unknown[]): unknown;
    sendRequest?(methodName: string, params: unknown[]): Promise<unknown>;
}

/**
 * - `onSomeEvent` becomes an `Event`.
 * - `notifySomething` sends a message without expecting a response.
 * - `methodNameSync` sends a message and waits for a sync response.
 * - `methodName` sends a message and waits for an async response.
 */
export class DefaultProxyHandler implements ProxyHandler<object> {

    protected emitters: Record<string, Emitter<unknown>> = Object.create(null);
    protected propertyCache: Record<string, unknown> = Object.create(null);

    constructor(
        protected client: ProxyClient
    ) {
        this.client.handleEvent?.((eventName, event) => {
            this.handleEvent(eventName, event)
        });
    }

    get(target: object, propertyName: keyof object, receiver: unknown) {
        if (typeof propertyName === 'symbol') {
            return target[propertyName];
        }
        return this.propertyCache[propertyName] ??= this.createField(propertyName);
    }

    protected handleEvent(eventName: string, event: unknown): void {
        this.emitters[eventName]?.fire(event);
    }

    protected createField(propertyName: string): (...params: unknown[]) => unknown {
        if (this.isEvent(propertyName)) {
            const { event } = this.emitters[propertyName] = new Emitter();
            return event;
        }
        if (this.isNotificationMethod(propertyName)) {
            if (!this.client.sendNotification) {
                throw new TypeError('this instance does not support sending notifications');
            }
            return (...args) => this.client.sendNotification!(propertyName, args);
        }
        if (this.isSyncMethod(propertyName)) {
            if (!this.client.sendRequestSync) {
                throw new TypeError('this instance does not support sending sync requests');
            }
            return (...args) => this.client.sendRequestSync!(propertyName, args);
        }
        if (this.isAsyncMethod(propertyName)) {
            if (!this.client.sendRequest) {
                throw new TypeError('this instance does not support sending async requests');
            }
            return (...args) => this.client.sendRequest!(propertyName, args);
        }
        throw new Error(`unhandled property: ${propertyName}`);
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
}
