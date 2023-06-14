// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

// @ts-check
describe('file-search', function () {

    const { assert } = chai;

    const Uri = require('@theia/core/lib/common/uri');
    const { QuickFileOpenService } = require('@theia/file-search/lib/browser/quick-file-open');
    const { CancellationTokenSource } = require('@theia/core/lib/common/cancellation');

    /** @type {import('inversify').Container} */
    const container = window['theia'].container;
    const quickFileOpenService = container.get(QuickFileOpenService);

    describe('quick-file-open', () => {

        describe('#compareItems', () => {

            /** @type import ('@theia/file-search/lib/browser/quick-file-open').QuickFileOpenService['compareItems']*/
            const sortByCompareItems = (a, b) => quickFileOpenService['compareItems'](a, b);

            it('should compare two quick-open-items by `label`', () => {

                /** @type import ('@theia/file-search/lib/browser/quick-file-open').FileQuickPickItem*/
                const a = { label: 'a', uri: new Uri.default('b') };
                /** @type import ('@theia/file-search/lib/browser/quick-file-open').FileQuickPickItem*/
                const b = { label: 'b', uri: new Uri.default('a') };

                assert.deepEqual([a, b].sort(sortByCompareItems), [a, b], 'a should be before b');
                assert.deepEqual([b, a].sort(sortByCompareItems), [a, b], 'a should be before b');
                assert.equal(quickFileOpenService['compareItems'](a, a), 0, 'items should be equal');
            });

            it('should compare two quick-open-items by `uri`', () => {

                /** @type import ('@theia/file-search/lib/browser/quick-file-open').FileQuickPickItem*/
                const a = { label: 'a', uri: new Uri.default('a') };
                /** @type import ('@theia/file-search/lib/browser/quick-file-open').FileQuickPickItem*/
                const b = { label: 'a', uri: new Uri.default('b') };
                assert.deepEqual([a, b].sort(sortByCompareItems), [a, b], 'a should be before b');
                assert.deepEqual([b, a].sort(sortByCompareItems), [a, b], 'a should be before b');
                assert.equal(sortByCompareItems(a, a), 0, 'items should be equal');
            });

            it('should not place very good matches above exact matches', () => {
                const exactMatch = 'almost_absurdly_long_file_name_with_many_parts.file';
                const veryGoodMatch = 'almost_absurdly_long_file_name_with_many_parts_plus_one.file';
                quickFileOpenService['filterAndRange'] = { filter: exactMatch };
                /** @type import ('@theia/file-search/lib/browser/quick-file-open').FileQuickPickItem*/
                const a = { label: exactMatch, uri: new Uri.default(exactMatch) };
                /** @type import ('@theia/file-search/lib/browser/quick-file-open').FileQuickPickItem*/
                const b = { label: veryGoodMatch, uri: new Uri.default(veryGoodMatch) };
                assert.deepEqual([a, b].sort(sortByCompareItems), [a, b], 'a should be before b');
                assert.deepEqual([b, a].sort(sortByCompareItems), [a, b], 'a should be before b');
                assert.equal(sortByCompareItems(a, a), 0, 'items should be equal');
                quickFileOpenService['filterAndRange'] = quickFileOpenService['filterAndRangeDefault'];
            });

        });

        describe('#filterAndRange', () => {

            it('should return the default when not searching', () => {
                const filterAndRange = quickFileOpenService['filterAndRange'];
                assert.equal(filterAndRange, quickFileOpenService['filterAndRangeDefault']);
            });

            it('should update when searching', () => {
                quickFileOpenService['getPicks']('a:2:1', new CancellationTokenSource().token); // perform a mock search.
                const filterAndRange = quickFileOpenService['filterAndRange'];
                assert.equal(filterAndRange.filter, 'a');
                assert.deepEqual(filterAndRange.range, { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } });
            });

        });

        describe('#splitFilterAndRange', () => {

            const expression1 = 'a:2:1';
            const expression2 = 'a:2,1';
            const expression3 = 'a:2#2';
            const expression4 = 'a#2:2';
            const expression5 = 'a#2,1';
            const expression6 = 'a#2#2';
            const expression7 = 'a:2';
            const expression8 = 'a#2';

            it('should split the filter correctly for different combinations', () => {
                assert.equal((quickFileOpenService['splitFilterAndRange'](expression1).filter), 'a');
                assert.equal((quickFileOpenService['splitFilterAndRange'](expression2).filter), 'a');
                assert.equal((quickFileOpenService['splitFilterAndRange'](expression3).filter), 'a');
                assert.equal((quickFileOpenService['splitFilterAndRange'](expression4).filter), 'a');
                assert.equal((quickFileOpenService['splitFilterAndRange'](expression5).filter), 'a');
                assert.equal((quickFileOpenService['splitFilterAndRange'](expression6).filter), 'a');
                assert.equal((quickFileOpenService['splitFilterAndRange'](expression7).filter), 'a');
                assert.equal((quickFileOpenService['splitFilterAndRange'](expression8).filter), 'a');
            });

            it('should split the range correctly for different combinations', () => {
                const rangeTest1 = { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } };
                const rangeTest2 = { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } };

                assert.deepEqual(quickFileOpenService['splitFilterAndRange'](expression1).range, rangeTest1);
                assert.deepEqual(quickFileOpenService['splitFilterAndRange'](expression2).range, rangeTest1);
                assert.deepEqual(quickFileOpenService['splitFilterAndRange'](expression3).range, rangeTest2);
                assert.deepEqual(quickFileOpenService['splitFilterAndRange'](expression4).range, rangeTest2);
                assert.deepEqual(quickFileOpenService['splitFilterAndRange'](expression5).range, rangeTest1);
                assert.deepEqual(quickFileOpenService['splitFilterAndRange'](expression6).range, rangeTest2);
                assert.deepEqual(quickFileOpenService['splitFilterAndRange'](expression7).range, rangeTest1);
                assert.deepEqual(quickFileOpenService['splitFilterAndRange'](expression8).range, rangeTest1);
            });

        });

    });

});
