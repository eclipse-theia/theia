/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
