// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

export function isObject(value: unknown): value is Record<string, unknown> {
    // eslint-disable-next-line no-null/no-null
    return typeof value === 'object' && value !== null;
}

export function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function flatten<T>(arrays: readonly (readonly T[])[]): T[] {
    const result: T[] = [];
    for (const arr of arrays) {
        result.push(...arr);
    }
    return result;
}

export function isColorDefaults(value: unknown): value is { light: string; dark: string; highContrast: string } {
    return isObject(value)
        && typeof value.light === 'string'
        && typeof value.dark === 'string'
        && typeof value.highContrast === 'string';
}

export function isENOENT(error: unknown): boolean {
    return typeof error === 'object' && error !== undefined && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export function deepClone<T>(obj: T): T {
    if (!isObject(obj)) {
        return obj;
    }
    if (obj instanceof RegExp) {
        return obj;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = Array.isArray(obj) ? [] : {};
    Object.keys(obj).forEach((key: string) => {
        const prop = obj[key];
        if (isObject(prop)) {
            result[key] = deepClone(prop);
        } else {
            result[key] = prop;
        }
    });
    return result as T;
}
