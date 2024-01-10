// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { isObject } from '@theia/core/lib/common/types';

export function illegalArgument(message?: string): Error {
    if (message) {
        return new Error(`Illegal argument: ${message}`);
    } else {
        return new Error('Illegal argument');
    }
}

export function readonly(name?: string): Error {
    if (name) {
        return new Error(`readonly property '${name} cannot be changed'`);
    } else {
        return new Error('readonly property cannot be changed');
    }
}

export function disposed(what: string): Error {
    const result = new Error(`${what} has been disposed`);
    result.name = 'DISPOSED';
    return result;
}

interface Errno {
    readonly code: string;
    readonly errno: number
}
const ENOENT = 'ENOENT' as const;

type ErrnoException = Error & Errno;
function isErrnoException(arg: unknown): arg is ErrnoException {
    return arg instanceof Error
        && isObject<Partial<Errno>>(arg)
        && typeof arg.code === 'string'
        && typeof arg.errno === 'number';
}

/**
 * _(No such file or directory)_: Commonly raised by `fs` operations to indicate that a component of the specified pathname does not exist — no entity (file or directory) could be
 * found by the given path.
 */
export function isENOENT(
    arg: unknown
): arg is ErrnoException & Readonly<{ code: typeof ENOENT }> {
    return isErrnoException(arg) && arg.code === ENOENT;
}
