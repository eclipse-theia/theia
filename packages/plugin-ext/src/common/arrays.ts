// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// based on https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/base/common/arrays.ts

/**
 * @returns New array with all falsy values removed. The original array IS NOT modified.
 */
export function coalesce<T>(array: ReadonlyArray<T | undefined | null>): T[] {
    return <T[]>array.filter(e => !!e);
}

/**
 * @returns True if the provided object is an array and has at least one element.
 */
export function isNonEmptyArray<T>(obj: T[] | undefined | null): obj is T[];
export function isNonEmptyArray<T>(obj: readonly T[] | undefined | null): obj is readonly T[];
export function isNonEmptyArray<T>(obj: T[] | readonly T[] | undefined | null): obj is T[] | readonly T[] {
    return Array.isArray(obj) && obj.length > 0;
}

export function flatten<T>(arr: T[][]): T[] {
    return (<T[]>[]).concat(...arr);
}

export interface Splice<T> {
    readonly start: number;
    readonly deleteCount: number;
    readonly toInsert: T[];
}

/**
 * @returns 'true' if the 'arg' is a 'ReadonlyArray'.
 */
export function isReadonlyArray(arg: unknown): arg is readonly unknown[] {
    // Since Typescript does not properly narrow down typings for 'ReadonlyArray' we need to help it.
    return Array.isArray(arg);
}

// Copied from https://github.com/microsoft/vscode/blob/1.72.2/src/vs/base/common/arrays.ts

/**
 * Returns the first mapped value of the array which is not undefined.
 */
export function mapFind<T, R>(array: Iterable<T>, mapFn: (value: T) => R | undefined): R | undefined {
    for (const value of array) {
        const mapped = mapFn(value);
        if (mapped !== undefined) {
            return mapped;
        }
    }

    return undefined;
}
