/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as assert from 'assert';
import { Prioritizeable, RecursivePartial } from './types';

describe('types', () => {

    describe('recursive-partial', () => {
        it('should handle nested arrays', () => {
            interface Bar {
                readonly arr: Array<string>;
            }
            interface Foo {
                readonly bar: Bar;
            }
            const myArr: Array<string> = [];
            const myFoo: RecursivePartial<Foo> = {};
            if (myFoo.bar && myFoo.bar.arr) {
                const x = Array.from(new Set(myFoo.bar.arr));
                myArr.push(...x);
            }
        });
    });

    describe('Prioritizeable', () => {
        it('prioritizeAll #01', () => {
            const input = [-4, 4, -3, 3, -2, 2, -1, 1, 0, -0];
            return Prioritizeable.prioritizeAll(input, value => -value)
                .then(values =>
                    assert.deepStrictEqual([
                        {
                            priority: 4,
                            value: -4
                        },
                        {
                            priority: 3,
                            value: -3
                        }, {
                            priority: 2,
                            value: -2
                        }, {
                            priority: 1,
                            value: -1
                        }
                    ], values)
                );
        });

        it('prioritizeAll #02', () => {
            const input = [-4, 4, -3, 3, -2, 2, -1, 1, 0, -0].map(v => Promise.resolve(v));
            return Prioritizeable.prioritizeAll(input, value => -value)
                .then(values =>
                    assert.deepStrictEqual([
                        {
                            priority: 4,
                            value: -4
                        },
                        {
                            priority: 3,
                            value: -3
                        }, {
                            priority: 2,
                            value: -2
                        }, {
                            priority: 1,
                            value: -1
                        }
                    ], values)
                );
        });
    });
});
