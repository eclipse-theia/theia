/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

// @ts-check
describe('file-search', function () {

    const { assert } = chai;

    const Uri = require('@theia/core/lib/common/uri');
    const { QuickFileOpenService } = require('@theia/file-search/lib/browser/quick-file-open');

    /** @type {import('inversify').Container} */
    const container = window['theia'].container;
    const quickFileOpenService = container.get(QuickFileOpenService);

    describe('quick-file-open', () => {

        describe('#compareItems', () => {

            it('should compare two quick-open-items by `label`', () => {

                /** @type monaco.quickInput.IAnythingQuickPickItem */
                const a = { label: 'a', resource: new Uri.default('a') };
                /** @type monaco.quickInput.IAnythingQuickPickItem */
                const b = { label: 'a', resource: new Uri.default('b') };

                assert.equal(quickFileOpenService['compareItems'](a, b), 1, 'a should be before b');
                assert.equal(quickFileOpenService['compareItems'](b, a), -1, 'a should be before b');
                assert.equal(quickFileOpenService['compareItems'](a, a), 0, 'items should be equal');

                assert.equal(quickFileOpenService['compareItems'](a, b, 'label'), 1, 'a should be before b');
                assert.equal(quickFileOpenService['compareItems'](b, a, 'label'), -1, 'a should be before b');
                assert.equal(quickFileOpenService['compareItems'](a, a, 'label'), 0, 'items should be equal');
            });

            it('should compare two quick-open-items by `uri`', () => {

                /** @type monaco.quickInput.IAnythingQuickPickItem */
                const a = { label: 'a', resource: new Uri.default('a') };
                /** @type monaco.quickInput.IAnythingQuickPickItem */
                const b = { label: 'a', resource: new Uri.default('b') };

                assert.equal(quickFileOpenService['compareItems'](a, b, 'resource'), 1, 'a should be before b');
                assert.equal(quickFileOpenService['compareItems'](b, a, 'resource'), -1, 'a should be before b');
                assert.equal(quickFileOpenService['compareItems'](a, a, 'resource'), 0, 'items should be equal');
            });

        });

    });

});
