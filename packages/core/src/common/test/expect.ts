/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { expect } from 'chai';

// tslint:disable-next-line:no-any
export async function expectThrowsAsync(actual: Promise<any>, expected?: string | RegExp, message?: string): Promise<void>;
// tslint:disable-next-line:no-any
export async function expectThrowsAsync(actual: Promise<any>, constructor: Error | Function, expected?: string | RegExp, message?: string): Promise<void>;
// tslint:disable-next-line:no-any
export async function expectThrowsAsync(promise: Promise<any>, ...args: any[]): Promise<void> {
    let synchronous = () => { };
    try {
        await promise;
    } catch (e) {
        synchronous = () => { throw e; };
    } finally {
        expect(synchronous).throw(...args);
    }
}
