
/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// tslint:disable-next-line:no-any
export function ok(val?: any, message?: string) {
    if (!val || val === null) {
        throw new Error(message ? `Assertion failed (${message})` : 'Assertion failed');
    }
}
