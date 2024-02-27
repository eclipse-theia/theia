// *****************************************************************************
// Copyright (C) 2021 Red Hat and others.
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
import * as assert from 'assert/strict';
import { Deferred, firstTrue, waitForEvent } from './promise-util';
import { Emitter } from './event';
import { CancellationError } from './cancellation';

describe('promise-util', () => {

    describe('waitForEvent', () => {
        it('should time out', async () => {
            const emitter = new Emitter<string>();
            await assert.rejects(waitForEvent(emitter.event, 1000), reason => reason instanceof CancellationError);
        });

        it('should get event', async () => {
            const emitter = new Emitter<string>();
            setTimeout(() => {
                emitter.fire('abcd');
            }, 500);
            assert.strictEqual(await waitForEvent(emitter.event, 1000), 'abcd');
        });
    });

    type ExecutionHandler<T> = (resolve: (value: T) => void, reject: (error: unknown) => void) => void;

    describe('firstTrue', () => {
        function createSequentialPromises<T>(...executionHandlers: ExecutionHandler<T>[]): Promise<T>[] {
            const deferreds: Deferred<T>[] = [];
            let i = 0;
            for (let k = 0; k < executionHandlers.length; k++) {
                deferreds.push(new Deferred<T>());
            }

            const resolveNext = () => {
                if (i < executionHandlers.length) {
                    executionHandlers[i](value => deferreds[i].resolve(value), error => deferreds[i].reject(error));
                    i++;
                }
                if (i < executionHandlers.length) {
                    setTimeout(resolveNext, 1);
                }
            };

            setTimeout(resolveNext, 1);
            return deferreds.map(deferred => deferred.promise);
        }

        it('should resolve to false when the promises arg is empty', async () => {
            const actual = await firstTrue();
            assert.strictEqual(actual, false);
        });

        it('should resolve to true when the first promise resolves to true', async () => {
            const signals: string[] = [];

            function createHandler(signal: string, result?: boolean): ExecutionHandler<boolean> {
                return (resolve: (value: boolean) => void, reject: (error: unknown) => void) => {
                    signals.push(signal);
                    if (typeof result !== 'undefined') {
                        resolve(result);
                    } else {
                        reject(undefined);
                    }
                };
            }

            const actual = await firstTrue(...createSequentialPromises(
                createHandler('a', false),
                createHandler('b', false),
                createHandler('c', true),
                createHandler('d', false),
                createHandler('e', true)
            ));
            assert.strictEqual(actual, true);
            assert.deepStrictEqual(signals, ['a', 'b', 'c']);
        });

        it('should reject when one of the promises rejects', async () => {
            await assert.rejects(firstTrue(...createSequentialPromises<boolean>(
                (resolve, _) => resolve(false),
                resolve => resolve(false),
                (_, reject) => reject(new Error('my test error')),
                resolve => resolve(true),
            )), /Error: my test error/);
        });
    });

});
