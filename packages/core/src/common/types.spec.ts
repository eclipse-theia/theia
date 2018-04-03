/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Prioritizeable } from './types';

describe('types', () => {

    describe('Prioritizeable', () => {
        test('prioritizeAll #01', () => {
            const input = [-4, 4, -3, 3, -2, 2, -1, 1, 0, -0];
            return Prioritizeable.prioritizeAll(input, value => -value)
                .then(values =>
                    expect(values).toEqual([
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
                    ])
                );
        });

        test('prioritizeAll #02', () => {
            const input = [-4, 4, -3, 3, -2, 2, -1, 1, 0, -0].map(v => Promise.resolve(v));
            return Prioritizeable.prioritizeAll(input, value => -value)
                .then(values =>
                    expect(values).toEqual([
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
                    ])
                );
        });
    });
});
