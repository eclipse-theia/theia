// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
import { deepClone, deepFreeze, isEmpty, notEmpty } from './objects';

describe('Objects', () => {

    describe('#deepClone', () => {

        describe('primitives', () => {
            it('should deep clone numbers', () => {
                expect(1).to.equal(deepClone(1));
            });
            it('should deep clone strings', () => {
                expect('foo').to.equal(deepClone('foo'));
                expect('').to.equal(deepClone(''));
            });
            it('should deep clone booleans', () => {
                expect(true).to.equal(deepClone(true));
                expect(false).to.equal(deepClone(false));
            });
        });

        describe('undefined', () => {
            it('should deep clone undefined', () => {
                expect(undefined).to.equal(deepClone(undefined));
            });
        });

        describe('arrays', () => {
            it('should deep clone arrays', () => {
                const a = [1, 2, 3];
                const b = deepClone(a);
                expect(a).to.deep.equal(b);
                expect(Array.isArray(a)).to.equal(true);
                expect(Array.isArray(b)).to.equal(true);
            });

            it('should deep clone nested arrays', () => {
                const a = [[1], [2]];
                const b = deepClone(a);
                expect(a).to.deep.equal(b);
                expect(Array.isArray(a)).to.equal(true);
                expect(Array.isArray(b)).to.equal(true);
            });
        });

        describe('objects', () => {
            it('should deep clone objects', () => {
                const a = { 'foo': true, 'bar': 1 };
                const b = deepClone(a);
                expect(a).to.deep.equal(b);
                expect(typeof a).to.equal('object');
                expect(typeof b).to.equal('object');
            });

            it('should deep clone nested objects', () => {
                const a = { 'foo': true, 'nested': { 'foo': 1 } };
                const b = deepClone(a);
                expect(a).to.deep.equal(b);
                expect(typeof a).to.equal('object');
                expect(typeof b).to.equal('object');
            });
        });
    });

    describe('#deepFreeze', () => {
        it('should deep freeze an object', () => {
            const e = { a: 10 };
            const d = deepFreeze(e);
            expect(Object.isFrozen(d)).to.equal(true);
        });
    });

    describe('#notEmpty', () => {
        it('should return "true" when not empty', () => {
            expect(notEmpty({})).to.equal(true);
            expect(notEmpty([])).to.equal(true);
            expect(notEmpty({ a: 1 })).to.equal(true);
        });
        it('should return "false" when empty', () => {
            expect(notEmpty(undefined)).to.equal(false);
        });
    });

    describe('#isEmpty', () => {
        it('should return "true" when it is empty', () => {
            // eslint-disable-next-line no-null/no-null
            const obj = Object.create(null);
            expect(isEmpty(obj)).to.equal(false);
        });
        it('should return "false" when not empty', () => {
            const z = { d: 5 };
            expect(isEmpty(z)).to.equal(false);
        });
    });

});
