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

import { inject, injectable } from 'inversify';
import { getPrototypeOf, isPromiseLike, isPrototype, Prototype } from '../common';
import { IpcReflectKeys, FunctionUtils, IpcHandleConverter, ProxyableOptions, ProxyOptions } from '../electron-common';

@injectable()
export class ElectronIpcHandleConverterImpl implements IpcHandleConverter {

    /** original => handle */
    protected handleCache = new WeakMap<object, object>();
    /** prototype => properties */
    protected propertiesCache = new WeakMap<Prototype, ReadonlySet<string>>();

    @inject(FunctionUtils)
    protected futils: FunctionUtils;

    getIpcHandle(value: any): any {
        return this.recursiveIpcHandle(value);
    }

    /**
     * Recursively wrap {@link value} or its contents as IPC proxies:
     *
     * - Functions are wrapped so that return values are proxied.
     * - Primitive values are returned as-is.
     * - Simple objects are returned as-is.
     * - Array elements are recursively converted into proxies.
     * - Promises' return value is recursively converted into proxies.
     * - Objects are converted into a proxy.
     */
    protected recursiveIpcHandle(value: any, thisArg?: object): any {
        if (typeof value === 'function') {
            return this.cacheMapping(this.futils.bindfn(value, thisArg), boundfn => (...args: any[]) => this.recursiveIpcHandle(boundfn(...args)));
        }
        if (typeof value !== 'object' || value === null) {
            return value;
        }
        if (isPrototype(value)) {
            console.error('invalid value: not a proxyable instance');
            return null;
        }
        // We don't need to walk the prototype chain if the prototype is already Object or null
        const prototype = getPrototypeOf(value);
        if (prototype === null || prototype === Object.prototype) {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map(element => this.recursiveIpcHandle(element));
        }
        if (isPromiseLike(value)) {
            return this.cacheMapping(value, val => val.then(resolved => this.recursiveIpcHandle(resolved)));
        }
        if (this.isProxyable(value)) {
            return this.cacheMapping(value, val => this.createProxyHandle(val));
        }
        return value;
    }

    protected cacheMapping<T extends object, U extends object>(value: T, map: (value: T) => U): U {
        let mapped = this.handleCache.get(value) as U | undefined;
        if (!mapped) {
            this.handleCache.set(value, mapped = map(value));
        }
        return mapped;
    }

    protected createProxyHandle(value: object): object {
        const handle = Object.create(null);
        this.collectProperties(value).forEach(property => {
            handle[property] = this.recursiveIpcHandle((value as any)[property], value);
        });
        return handle;
    }

    protected collectProperties(value: object | null): ReadonlySet<string> {
        // Recursion stop condition
        if (value === null || value === Object.prototype || value === Function.prototype) {
            return new Set();
        }
        if (isPrototype(value)) {
            const cached = this.propertiesCache.get(value);
            if (cached) {
                return cached;
            }
            const properties = new Set(this.collectProperties(getPrototypeOf(value)));
            this.getProxyableOptions(value)?.fields?.forEach(property => properties.add(property));
            this.collectOwnProperties(value, properties);
            this.propertiesCache.set(value, properties);
            return properties;
        } else {
            const properties = new Set(this.collectProperties(getPrototypeOf(value)));
            this.collectOwnProperties(value, properties);
            return properties;
        }
    }

    protected collectOwnProperties(value: object, properties: Set<string>): void {
        Object.getOwnPropertyNames(value).forEach(property => {
            if (typeof property === 'symbol' || property === 'constructor') {
                return;
            }
            const options = this.getProxyOptions(value, property);
            if (options?.expose === true) {
                properties!.add(property);
            } else if (options?.expose === false) {
                properties!.delete(property);
            }
        });
    }

    protected isProxyable(value: object): boolean {
        const prototype = getPrototypeOf(value)!;
        return this.propertiesCache.has(prototype) || this.getProxyableOptions(value) !== undefined;
    }

    protected getProxyableOptions(target: object): ProxyableOptions | undefined {
        return Reflect.getMetadata(IpcReflectKeys.Proxyable, target.constructor);
    }

    protected getProxyOptions(target: object, property: string): ProxyOptions | undefined {
        return Reflect.getMetadata(IpcReflectKeys.Proxy, target, property);
    }
}
