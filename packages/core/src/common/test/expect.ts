/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// eslint-disable-next-line import/no-extraneous-dependencies
import { expect } from 'chai';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function expectThrowsAsync(actual: Promise<any>, expected?: string | RegExp, message?: string): Promise<void>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function expectThrowsAsync(actual: Promise<any>, constructor: Error | Function, expected?: string | RegExp, message?: string): Promise<void>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
