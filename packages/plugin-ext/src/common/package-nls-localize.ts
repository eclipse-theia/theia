// *****************************************************************************
// Copyright (C) 2021 TypeFox and others.
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

/**
 * Recursively walks `value` and replaces strings matching `%key%` with the result of `resolve(key)`.
 * If `resolve(key)` returns `undefined`, the original string is kept.
 */
export function localizeWithResolver<T>(value: T, resolve: (key: string) => string | undefined): T {
    if (typeof value === 'string') {
        if (value.length > 2 && value.startsWith('%') && value.endsWith('%')) {
            const key = value.slice(1, -1);
            const replaced = resolve(key);

            return (replaced !== undefined ? replaced : value) as T;
        }
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(item => localizeWithResolver(item, resolve)) as T;
    }
    if (typeof value === 'object' && value !== null) {
        const result: Record<string, unknown> = {};
        for (const [name, item] of Object.entries(value)) {
            result[name] = localizeWithResolver(item, resolve);
        }
        return result as T;
    }
    return value;
}
