/* eslint-disable */
// copied from https://github.com/microsoft/vscode/blob/1.37.0/src/vs/base/common/objects.ts
/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { isUndefinedOrNull, isArray, isObject } from './types';

const _hasOwnProperty = Object.prototype.hasOwnProperty;

export function cloneAndChange(obj: any, changer: (orig: any) => any): any {
    return _cloneAndChange(obj, changer, new Set());
}

function _cloneAndChange(obj: any, changer: (orig: any) => any, seen: Set<any>): any {
    if (isUndefinedOrNull(obj)) {
        return obj;
    }

    const changed = changer(obj);
    if (typeof changed !== 'undefined') {
        return changed;
    }

    if (isArray(obj)) {
        const r1: any[] = [];
        for (const e of obj) {
            r1.push(_cloneAndChange(e, changer, seen));
        }
        return r1;
    }

    if (isObject(obj)) {
        if (seen.has(obj)) {
            throw new Error('Cannot clone recursive data-structure');
        }
        seen.add(obj);
        const r2 = {};
        for (let i2 in obj) {
            if (_hasOwnProperty.call(obj, i2)) {
                (r2 as any)[i2] = _cloneAndChange(obj[i2], changer, seen);
            }
        }
        seen.delete(obj);
        return r2;
    }

    return obj;
}
