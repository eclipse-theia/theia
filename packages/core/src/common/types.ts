// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export { ArrayUtils } from './array-utils';
export { Prioritizeable } from './prioritizeable';

type UnknownObject<T extends object> = Record<string | number | symbol, unknown> & { [K in keyof T]: unknown };

export type Deferred<T> = { [P in keyof T]: Promise<T[P]> };
export type MaybeArray<T> = T | T[];
export type MaybeNull<T> = { [P in keyof T]: T[P] | null };
export type MaybePromise<T> = T | PromiseLike<T>;
export type MaybeUndefined<T> = { [P in keyof T]?: T[P] | undefined };
export type Mutable<T> = { -readonly [P in keyof T]: T[P] };
export type RecursivePartial<T> = {
    [P in keyof T]?: T[P] extends (infer I)[]
    ? RecursivePartial<I>[]
    : RecursivePartial<T[P]>;
};

export function isBoolean(value: unknown): value is boolean {
    return value === true || value === false;
}

export function isString(value: unknown): value is string {
    return typeof value === 'string' || value instanceof String;
}

export function isNumber(value: unknown): value is number {
    return typeof value === 'number' || value instanceof Number;
}

export function isError(value: unknown): value is Error {
    return value instanceof Error;
}

export function isErrorLike(value: unknown): value is Error {
    return isObject(value) && isString(value.name) && isString(value.message) && (isUndefined(value.stack) || isString(value.stack));
}

// eslint-disable-next-line space-before-function-paren
export function isFunction<T extends (...args: unknown[]) => unknown>(value: unknown): value is T {
    return typeof value === 'function';
}

/**
 * @returns whether the provided parameter is an empty JavaScript Object or not.
 */
export function isEmptyObject(obj: unknown): obj is object {
    if (!isObject(obj)) {
        return false;
    }

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            return false;
        }
    }

    return true;
}

export function isObject<T extends object>(value: unknown): value is UnknownObject<T> {
    // eslint-disable-next-line no-null/no-null
    return typeof value === 'object' && value !== null;
}

export function isUndefined(value: unknown): value is undefined {
    return typeof value === 'undefined';
}

/**
 * @param value value to check.
 * @param every optional predicate ran on every element of the array.
 * @param thisArg value to substitute `this` with when invoking in the predicate.
 * @returns whether or not `value` is an array.
 */
export function isArray<T>(value: unknown, every?: (value: unknown) => unknown, thisArg?: unknown): value is T[] {
    return Array.isArray(value) && (!isFunction(every) || value.every(every, thisArg));
}

export function isStringArray(value: unknown): value is string[] {
    return isArray(value, isString);
}

/**
 * Creates a shallow copy with all ownkeys of the original object that are `null` made `undefined`
 */
export function nullToUndefined<T>(nullable: MaybeNull<T>): MaybeUndefined<T> {
    const undefinable = { ...nullable } as MaybeUndefined<T>;
    for (const key in nullable) {
        // eslint-disable-next-line no-null/no-null
        if (nullable[key] === null && Object.prototype.hasOwnProperty.call(nullable, key)) {
            undefinable[key] = undefined;
        }
    }
    return undefinable;
}

/**
 * Throws when called and statically makes sure that all variants of a type were consumed.
 */
export function unreachable(_never: never, message: string = 'unhandled case'): never {
    throw new Error(message);
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// Copied from https://github.com/microsoft/vscode/blob/1.72.2/src/vs/base/common/types.ts

/**
 * @returns whether the provided parameter is defined.
 */
export function isDefined<T>(arg: T | null | undefined): arg is T {
    return !isUndefinedOrNull(arg);
}

/**
 * @returns whether the provided parameter is undefined or null.
 */
export function isUndefinedOrNull(obj: unknown): obj is undefined | null {
    // eslint-disable-next-line no-null/no-null
    return (isUndefined(obj) || obj === null);
}
