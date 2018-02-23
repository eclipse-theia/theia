/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export function deepFreeze<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
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
