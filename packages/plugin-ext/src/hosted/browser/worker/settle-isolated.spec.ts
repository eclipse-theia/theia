// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
// ****************************************************************************

import { expect } from 'chai';
import { settleIsolated } from './settle-isolated';

// `settleIsolated` is what `worker-main.ts`'s `init()` uses to prepare every plugin: it fixes the
// bug where one plugin whose manifest fails to load (e.g. `loadManifest` rejecting on a 404)
// used to fail the whole `Promise.all`, which failed `init()`, which failed `$start` - meaning a
// single bad plugin took every plugin down with it.
describe('settleIsolated', () => {

    it('lets the other items load when one item fails to prepare', async () => {
        const errors: Array<{ item: string, error: unknown }> = [];

        const result = await settleIsolated(
            ['a', 'b', 'c'],
            async item => {
                if (item === 'b') {
                    throw new Error('boom');
                }
                return `prepared-${item}`;
            },
            (item, error) => errors.push({ item, error })
        );

        expect(result).to.deep.equal(['prepared-a', 'prepared-c']);
        expect(errors).to.have.lengthOf(1);
        expect(errors[0].item).to.equal('b');
        expect((errors[0].error as Error).message).to.equal('boom');
    });

    it('copes with a non-Error rejection value', async () => {
        // `readContents` rejects with the bare string 'NotFound' on a 404, not an `Error` - the
        // isolation must not assume `error.message` exists.
        const errors: unknown[] = [];

        const result = await settleIsolated(
            ['a', 'b'],
            async item => {
                if (item === 'a') {
                    // eslint-disable-next-line no-throw-literal
                    throw 'NotFound';
                }
                return item;
            },
            (item, error) => errors.push(error)
        );

        expect(result).to.deep.equal(['b']);
        expect(errors).to.deep.equal(['NotFound']);
    });

    it('preserves the original order among the items that succeed', async () => {
        // Resolve out of order to prove the result order comes from the input order, not
        // whichever promise settles first.
        const delays: Record<string, number> = { a: 15, b: 5, c: 10 };

        const result = await settleIsolated(
            ['a', 'b', 'c', 'd'],
            async item => {
                await new Promise(resolve => setTimeout(resolve, delays[item] ?? 0));
                if (item === 'd') {
                    throw new Error('fails last, but not counted in order');
                }
                return item;
            },
            () => { /* expected for 'd' */ }
        );

        expect(result).to.deep.equal(['a', 'b', 'c']);
    });

    it('reports every failure and keeps every success when nothing fails at all', async () => {
        const errors: unknown[] = [];

        const result = await settleIsolated(
            [1, 2, 3],
            async item => item * 2,
            (item, error) => errors.push(error)
        );

        expect(result).to.deep.equal([2, 4, 6]);
        expect(errors).to.be.empty;
    });

    it('keeps a successful item whose prepare() resolves to undefined, in order, alongside rejections and normal values', async () => {
        // Regression test: `undefined` used to double as the internal failure sentinel, so a
        // legitimately `undefined` result was indistinguishable from a failure and silently dropped.
        const failedItems: string[] = [];

        const result = await settleIsolated(
            ['a', 'b', 'c', 'd'],
            async item => {
                if (item === 'a') {
                    return undefined;
                }
                if (item === 'c') {
                    throw new Error('boom');
                }
                return item;
            },
            item => failedItems.push(item)
        );

        expect(result).to.deep.equal([undefined, 'b', 'd']);
        expect(failedItems).to.deep.equal(['c']);
    });
});
