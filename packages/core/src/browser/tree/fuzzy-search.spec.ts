/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { expect } from 'chai';
import { FuzzySearch } from './fuzzy-search';

describe('fuzzy-search', () => {

    ([
        {
            pattern: 'a',
            items: ['alma'],
            expected: [
                {
                    item: 'alma',
                    ranges: [
                        { offset: 0, length: 1 }
                    ]
                }
            ]
        },
        {
            pattern: 'a',
            items: ['körte'],
            expected: []
        },
        {
            pattern: 'bcn',
            items: ['baconing', 'narwhal', 'a mighty bear canoe'],
            expected: [
                {
                    item: 'baconing',
                    ranges: [
                        { offset: 0, length: 1 },
                        { offset: 2, length: 1 },
                        { offset: 4, length: 1 }
                    ]
                },
                {
                    item: 'a mighty bear canoe',
                    ranges: [
                        { offset: 9, length: 1 },
                        { offset: 14, length: 1 },
                        { offset: 16, length: 1 }
                    ]
                }
            ]
        }
    ] as {
        readonly pattern: string,
        readonly items: string[],
        readonly expected: FuzzySearch.Match<string>[]
    }[]).forEach(test => {
        const { pattern, items, expected } = test;
        it(`should match ${expected.length} item${expected.length === 1 ? '' : 's'} when filtering [${items.join(', ')}] with pattern: '${pattern}'`, async () => {
            expectSearch(await search(pattern, items), expected);
        });
    });

    ([
        ['con', ['configs', 'base.tsconfig.json', 'tsconfig.json', 'base.nyc.json', 'CONTRIBUTING.MD']],
        ['bcn', ['baconing', 'narwhal', 'a mighty bear canoe'], ['baconing', 'a mighty bear canoe']]
    ] as ([string, string[], string[]])[]).forEach(test => {
        const [pattern, items, expected] = test;
        it(`should match the order of items after the filtering with pattern: '${pattern}'`, async () => {
            expectOrder(await search(pattern, items), expected || items);
        });
    });

    function expectOrder(actual: FuzzySearch.Match<string>[], expected: string[]) {
        expect(actual.map(result => result.item)).to.be.deep.equal(expected);
    }

    function expectSearch(actual: FuzzySearch.Match<string>[], expected: FuzzySearch.Match<string>[]) {
        expect(actual).to.be.deep.equal(expected);
    }

    async function search(pattern: string, items: string[]): Promise<FuzzySearch.Match<string>[]> {
        return new FuzzySearch().filter({
            items,
            pattern,
            transform: arg => arg
        });
    }

});
