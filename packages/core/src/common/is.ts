// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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

export namespace Is {

    export function boolean(value: unknown): value is boolean {
        return value === true || value === false;
    }

    export function string(value: unknown): value is string {
        return typeof value === 'string' || value instanceof String;
    }

    export function number(value: unknown): value is number {
        return typeof value === 'number' || value instanceof Number;
    }

    export function error(value: unknown): value is Error {
        return value instanceof Error;
    }

    export function func(value: unknown): value is Function {
        return typeof value === 'function';
    }

    export function stringArray(value: unknown): value is string[] {
        return Array.isArray(value) && value.every(elem => string(elem));
    }

    export function typedArray<T>(value: unknown, check: (value: unknown) => boolean): value is T[] {
        return Array.isArray(value) && value.every(check);
    }

    export function object<T = Record<string | number | symbol, unknown>>(value: unknown): value is T {
        return typeof value === 'object' && !!value;
    }

    export function undefined(value: unknown): value is undefined {
        return typeof value === 'undefined';
    }

}
