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

import { Emitter, Event } from './event';
import { Reflection } from './reflection';
import { MaybePromise, serviceIdentifier } from './types';
import { ServicePath } from './service-provider';
import { Disposable, Owned } from './disposable';

export type Proxyable = {
    [key in string]?: Event<any> | ((...args: any[]) => MaybePromise<any>)
};

export type EventNames<T> = { [K in keyof T]: T[K] extends Event<any> ? K : never }[keyof T];
export type MethodNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];

/**
 * Re-type `T` to only keep events and methods (convert the latter to async).
 */
export type Proxied<T> = {
    readonly [K in EventNames<T> | MethodNames<Owned<T>>]:
    T[K] extends Event<any>
    ? T[K]
    : T[K] extends (...params: infer ParametersType) => infer ReturnType
    ? ReturnType extends PromiseLike<infer PromiseType>
    ? (...params: ParametersType) => Promise<PromiseType>
    : (...params: ParametersType) => Promise<ReturnType>
    : never;
} & Disposable;

export const ProxyProvider = serviceIdentifier<ProxyProvider>('ProxyProvider');
export interface ProxyProvider {
    getProxy<T, P extends object = any>(serviceId: string | ServicePath<T, P>, params?: P): Proxied<T>;
}

/**
 * A `LazyProxy` allows you to get a reference to an instance that will delay method calls
 * until the promise to the actual instance resolves.
 */
export const LazyProxyFactory = serviceIdentifier<LazyProxyFactory>('LazyProxyFactory');
export type LazyProxyFactory = <T>(promise: PromiseLike<T>) => Proxied<T>;

export class LazyProxyHandler<T extends Proxyable> implements ProxyHandler<T> {

    protected emitters = new Map<string | symbol, Emitter<any>>();
    protected cache = new Map<string | symbol, Event<any> | Function>();

    constructor(
        protected promiseLike: PromiseLike<T>,
        protected reflection: Reflection,
    ) {
        this.promiseLike.then(instance => {
            this.reflection.getEventNames(instance).forEach(event => {
                instance[event]!(arg => this.emitters.get(event)?.fire(arg));
            });
        });
    }

    get(target: T, property: string | symbol, receiver: unknown): any {
        if (typeof property !== 'string') {
            throw new Error('you can only index this proxy with strings');
        }
        let returnValue = this.cache.get(property);
        if (!returnValue) {
            if (this.reflection.isEventName(property)) {
                const emitter = new Emitter();
                this.emitters.set(property, emitter);
                returnValue = emitter.event;
            } else {
                returnValue = async (...args: unknown[]): Promise<any> => this.promiseLike.then(instance => (instance[property] as Function)(...args));
            }
        }
        return returnValue;
    }
}
