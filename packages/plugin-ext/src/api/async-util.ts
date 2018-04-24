/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { CancellationToken } from '@theia/core/lib/common/cancellation';

export function hookCancellationToken<T>(token: CancellationToken, promise: Promise<T>): PromiseLike<T> {
    return new Promise<T>((resolve, reject) => {
        const sub = token.onCancellationRequested(() => reject("This promise is cancelled"));
        promise.then(value => {
            sub.dispose();
            resolve(value);
        }).catch(err => {
            sub.dispose();
            reject(err);
        });
    });
}
