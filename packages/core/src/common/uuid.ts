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

// based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/base/common/uuid.ts

import { v5 } from 'uuid';

const _UUIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: string): boolean {
    return _UUIDPattern.test(value);
}

declare const crypto: undefined | {
    // https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues#browser_compatibility
    getRandomValues?(data: Uint8Array): Uint8Array;
    // https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID#browser_compatibility
    randomUUID?(): string;
};

export const generateUuid = (function (): () => string {

    // use `randomUUID` if possible
    if (typeof crypto === 'object' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID.bind(crypto);
    }

    // use `randomValues` if possible
    let getRandomValues: (bucket: Uint8Array) => Uint8Array;
    if (typeof crypto === 'object' && typeof crypto.getRandomValues === 'function') {
        getRandomValues = crypto.getRandomValues.bind(crypto);

    } else {
        getRandomValues = function (bucket: Uint8Array): Uint8Array {
            for (let i = 0; i < bucket.length; i++) {
                bucket[i] = Math.floor(Math.random() * 256);
            }
            return bucket;
        };
    }

    // prep-work
    const _data = new Uint8Array(16);
    const _hex: string[] = [];
    for (let i = 0; i < 256; i++) {
        _hex.push(i.toString(16).padStart(2, '0'));
    }

    // eslint-disable-next-line @typescript-eslint/no-shadow
    return function generateUuid(): string {
        // get data
        getRandomValues(_data);

        // set version bits
        _data[6] = (_data[6] & 0x0f) | 0x40;
        _data[8] = (_data[8] & 0x3f) | 0x80;

        // print as string
        let i = 0;
        let result = '';
        result += _hex[_data[i++]];
        result += _hex[_data[i++]];
        result += _hex[_data[i++]];
        result += _hex[_data[i++]];
        result += '-';
        result += _hex[_data[i++]];
        result += _hex[_data[i++]];
        result += '-';
        result += _hex[_data[i++]];
        result += _hex[_data[i++]];
        result += '-';
        result += _hex[_data[i++]];
        result += _hex[_data[i++]];
        result += '-';
        result += _hex[_data[i++]];
        result += _hex[_data[i++]];
        result += _hex[_data[i++]];
        result += _hex[_data[i++]];
        result += _hex[_data[i++]];
        result += _hex[_data[i++]];
        return result;
    };
})();

const NAMESPACE = '4c90ee4f-d952-44b1-83ca-f04121ab8e05';
/**
 * This function will hash the given value using SHA1. The result will be a uuid.
 * @param value the string to hash
 * @returns a uuid
 */
export function hashValue(value: string): string {
    // as opposed to v4, v5 is deterministic and uses SHA1 hashing
    return v5(value, NAMESPACE);
}
