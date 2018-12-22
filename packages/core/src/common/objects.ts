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

export function deepClone<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    if (obj instanceof RegExp) {
        return obj;
    }
    // tslint:disable-next-line:no-any
    const result: any = Array.isArray(obj) ? [] : {};
    Object.keys(obj).forEach((key: string) => {
        // tslint:disable-next-line:no-any
        const prop = (<any>obj)[key];
        if (prop && typeof prop === 'object') {
            result[key] = deepClone(prop);
        } else {
            result[key] = prop;
        }
    });
    return result;
}

export function deepFreeze<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    // tslint:disable-next-line:no-any
    const stack: any[] = [obj];
    while (stack.length > 0) {
        const objectToFreeze = stack.shift();
        Object.freeze(objectToFreeze);
        for (const key in objectToFreeze) {
            if (_hasOwnProperty.call(objectToFreeze, key)) {
                const prop = objectToFreeze[key];
                if (typeof prop === 'object' && !Object.isFrozen(prop)) {
                    stack.push(prop);
                }
            }
        }
    }
    return obj;
}

const _hasOwnProperty = Object.prototype.hasOwnProperty;

export function notEmpty<T>(arg: T | undefined | null): arg is T {
    return arg !== undefined && arg !== null;
}

/**
 * `true` if the argument is an empty object. Otherwise, `false`.
 */
export function isEmpty(arg: Object): boolean {
    return Object.keys(arg).length === 0 && arg.constructor === Object;
}
