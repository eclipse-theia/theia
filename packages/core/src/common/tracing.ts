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

export interface TraceLogger {
    log(...parts: any[]): void
}

export interface TraceDater {
    now(): number
}

export interface TraceFilter {
    filter(propertyKey: string | symbol): boolean
}

export interface TraceOptions {
    logId?: string
    logParams?: boolean
    logReturnValue?: boolean
    logger?: TraceLogger
    dater?: TraceDater
    filter?: TraceFilter
}

export function trace<T>(target: T, options?: TraceOptions): T {
    return new Proxy(target, new TracerProxyHandler(options));
}

export class TracerProxyHandler<T extends object> implements ProxyHandler<T> {

    protected static InstanceId = 0;

    protected logId: string;
    protected logParams: boolean;
    protected logReturnValue: boolean;
    protected logger: TraceLogger;
    protected dater: TraceDater;
    protected filter?: TraceFilter;

    constructor(options?: TraceOptions) {
        const id = TracerProxyHandler.InstanceId++;
        this.logId = options?.logId ?? `#${id}`;
        this.logParams = options?.logParams ?? true;
        this.logReturnValue = options?.logReturnValue ?? true;
        this.logger = options?.logger ?? console;
        this.dater = options?.dater ?? Date;
        this.filter = options?.filter;
    }

    get(target: T, propertyKey: string | symbol, receiver: T): any {
        const property = target[propertyKey as keyof T];
        if (typeof property !== 'function' || this.filter?.filter(propertyKey) === false) {
            return property;
        }
        return (...args: any[]): any => {
            const before = this.dater.now();
            if (this.logParams) {
                this.logger.log(this.logId, 'BEFORE:', propertyKey, args);
            } else {
                this.logger.log(this.logId, 'BEFORE:', propertyKey);
            }
            let result; try {
                result = property.apply(target, args);
            } catch (error) {
                if (this.logReturnValue) {
                    this.logger.log(this.logId, 'THROWN:', propertyKey, `${this.dater.now() - before}ms`);
                } else {
                    this.logger.log(this.logId, 'THROWN:', propertyKey, error, `${this.dater.now() - before}ms`);
                }
                throw error;
            }
            // eslint-disable-next-line no-null/no-null
            if (typeof result === 'object' && result !== null && typeof result.then === 'function') {
                if (this.logReturnValue) {
                    result.then(
                        (value: any) => this.logger.log(this.logId, 'RESOLVED:', propertyKey, `${this.dater.now() - before}ms`),
                        (error: any) => this.logger.log(this.logId, 'REJECTED:', propertyKey, `${this.dater.now() - before}ms`)
                    )
                } else {
                    result.then(
                        (value: any) => this.logger.log(this.logId, 'RESOLVED:', propertyKey, value, `${this.dater.now() - before}ms`),
                        (error: any) => this.logger.log(this.logId, 'REJECTED:', propertyKey, error, `${this.dater.now() - before}ms`)
                    )
                }
            } else {
                if (this.logReturnValue) {
                    this.logger.log(this.logId, 'RETURNED:', propertyKey, result, `${this.dater.now() - before}ms`);
                } else {
                    this.logger.log(this.logId, 'RETURNED:', propertyKey, `${this.dater.now() - before}ms`);
                }
            }
            return result;
        };
    }
}
