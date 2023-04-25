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
    protected handleCache = new WeakMap<object, unknown>();
    /** prototype => properties */
    protected propertiesCache = new WeakMap<Prototype, ReadonlySet<string>>();

    @inject(FunctionUtils)
    protected futils: FunctionUtils;

    getIpcHandle(value: any): any {
        return this.recursiveIpcHandle(value);
    }

    replaceWith(value: object, replacement: unknown): void {
        this.handleCache.set(value, replacement);
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
        if (this.handleCache.has(value)) {
            return this.handleCache.get(value);
        }
        if (isPrototype(value)) {
            console.error('invalid value: not a proxyable instance');
            return null;
        }
        if (Array.isArray(value)) {
            return value.map(element => this.recursiveIpcHandle(element));
        }
        if (isPromiseLike(value)) {
            return this.cacheMapping(value, promise => promise.then(resolved => this.recursiveIpcHandle(resolved)));
        }
        return this.cacheMapping(value, object => this.createProxyHandle(object));
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
        // We need to store the unfinished object now to break circular loops:
        this.handleCache.set(value, handle);
        this.collectProperties(value).forEach(property => {
            handle[property] = this.recursiveIpcHandle((value as any)[property], value);
        });
        return handle;
    }

    protected collectProperties(value: object | null): ReadonlySet<string> {
        if (value === null) {
            return new Set();
        }
        const proxyable = this.getProxyableOptions(value);
        if (isPrototype(value)) {
            if (value === Object.prototype || value === Function.prototype as object) {
                return new Set();
            }
            const cached = this.propertiesCache.get(value);
            if (cached) {
                return cached;
            }
            const properties = new Set(this.collectProperties(getPrototypeOf(value)));
            proxyable?.fields?.forEach(property => properties.add(property));
            this.collectOwnProperties(value, properties);
            this.propertiesCache.set(value, properties);
            return properties;
        } else if (proxyable) {
            const properties = new Set(this.collectProperties(getPrototypeOf(value)));
            this.collectOwnProperties(value, properties);
            return properties;
        }
        return new Set(Object.keys(value));
    }

    protected collectOwnProperties(value: object, properties: Set<string>): void {
        Object.getOwnPropertyNames(value).forEach(property => {
            if (typeof property === 'symbol' || property === 'constructor') {
                return;
            }
            const options = this.getProxyOptions(value, property);
            if (options?.expose === true) {
                properties.add(property);
            } else if (options?.expose === false) {
                properties.delete(property);
            }
        });
    }

    protected getProxyableOptions(target: object): ProxyableOptions | undefined {
        // null prototype objects don't have a constructor field:
        if (typeof target.constructor === 'function') {
            return Reflect.getMetadata(IpcReflectKeys.Proxyable, target.constructor);
        }
    }

    protected getProxyOptions(target: object, property: string): ProxyOptions | undefined {
        return Reflect.getMetadata(IpcReflectKeys.Proxy, target, property);
    }
}
