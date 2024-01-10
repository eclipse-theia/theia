// *****************************************************************************
// Copyright (C) 2023 Mathieu Bussieres and others.
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
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/base/common/hash.ts

/**
 * Return a hash value for an object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hash(obj: any): number {
    return doHash(obj, 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function doHash(obj: any, hashVal: number): number {
    switch (typeof obj) {
        case 'object':
            // eslint-disable-next-line no-null/no-null
            if (obj === null) {
                return numberHash(349, hashVal);
            } else if (Array.isArray(obj)) {
                return arrayHash(obj, hashVal);
            }
            return objectHash(obj, hashVal);
        case 'string':
            return stringHash(obj, hashVal);
        case 'boolean':
            return booleanHash(obj, hashVal);
        case 'number':
            return numberHash(obj, hashVal);
        case 'undefined':
            return numberHash(937, hashVal);
        default:
            return numberHash(617, hashVal);
    }
}

export function numberHash(val: number, initialHashVal: number): number {
    return (((initialHashVal << 5) - initialHashVal) + val) | 0;  // hashVal * 31 + ch, keep as int32
}

function booleanHash(b: boolean, initialHashVal: number): number {
    return numberHash(b ? 433 : 863, initialHashVal);
}

export function stringHash(s: string, hashVal: number): number {
    hashVal = numberHash(149417, hashVal);
    for (let i = 0, length = s.length; i < length; i++) {
        hashVal = numberHash(s.charCodeAt(i), hashVal);
    }
    return hashVal;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function arrayHash(arr: any[], initialHashVal: number): number {
    initialHashVal = numberHash(104579, initialHashVal);
    return arr.reduce((hashVal, item) => doHash(item, hashVal), initialHashVal);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function objectHash(obj: any, initialHashVal: number): number {
    initialHashVal = numberHash(181387, initialHashVal);
    return Object.keys(obj).sort().reduce((hashVal, key) => {
        hashVal = stringHash(key, hashVal);
        return doHash(obj[key], hashVal);
    }, initialHashVal);
}
