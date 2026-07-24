// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import { expect } from 'chai';
import { rejects } from 'assert';
import { promises as fs } from 'fs';
import { deepClone, isENOENT, isObject, isStringArray } from '../utils';

describe('utils', () => {

    describe('isObject', () => {
        it('returns true for plain objects', () => {
            expect(isObject({})).to.equal(true);
            expect(isObject({ a: 1 })).to.equal(true);
        });

        it('returns false for null and primitives', () => {
            // eslint-disable-next-line no-null/no-null
            expect(isObject(null)).to.equal(false);
            expect(isObject(undefined)).to.equal(false);
            expect(isObject('x')).to.equal(false);
        });

        it('returns true for arrays because they are objects in JavaScript', () => {
            expect(isObject([])).to.equal(true);
        });
    });

    describe('isStringArray', () => {
        it('returns true only for string arrays', () => {
            expect(isStringArray(['a', 'b'])).to.equal(true);
            expect(isStringArray([])).to.equal(true);
        });

        it('returns false for mixed or non-array values', () => {
            expect(isStringArray(['a', 1])).to.equal(false);
            expect(isStringArray('a')).to.equal(false);
        });
    });

    describe('isENOENT', () => {
        it('detects fs ENOENT errors', async () => {
            await rejects(fs.readFile('definitely-missing-' + Date.now()), reason => isENOENT(reason));
        });

        it('returns false for plain errors and null', () => {
            expect(isENOENT(new Error('I am not ENOENT'))).to.equal(false);
            // eslint-disable-next-line no-null/no-null
            expect(isENOENT(null)).to.equal(false);
        });

        it('returns false for other errno codes', async () => {
            await rejects(fs.readdir(__filename), reason => !isENOENT(reason));
        });
    });

    describe('deepClone', () => {
        it('clones nested objects without sharing references', () => {
            const source = { nested: { value: 1 }, list: [1, 2] };
            const clone = deepClone(source);
            expect(clone).to.deep.equal(source);
            expect(clone).to.not.equal(source);
            expect(clone.nested).to.not.equal(source.nested);
            expect(clone.list).to.not.equal(source.list);
        });

        it('returns primitives and regexps unchanged', () => {
            expect(deepClone(42)).to.equal(42);
            const re = /abc/;
            expect(deepClone(re)).to.equal(re);
        });
    });
});
