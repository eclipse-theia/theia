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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable no-unused-expressions */

import { expect } from 'chai';
import { ApplicationError } from './application-error';

describe('ApplicationError', () => {

    const TestError = ApplicationError.declare(9999, (message, data) => ({ message, data }));
    const TestError2 = ApplicationError.declare(9998, (message, data) => ({ message, data }));

    it('should not be able to use the same code twice', () => {
        expect(() => ApplicationError.declare(TestError.code, (message, data) => ({ message, data }))).throw();
    });

    it('using new should work', () => {
        const error = new TestError();
        expect(TestError.is(error));
    });

    it('prototype should be assigned correctly', () => {
        const error = new TestError();
        const proto = Object.getPrototypeOf(error);
        expect(proto).eq(TestError.prototype);
    });

    it('instanceof should work properly', () => {
        const testError = TestError('test');
        expect(testError).instanceof(Error, 'defined application errors should also be regular errors');
        expect(testError).instanceof(TestError, 'defined application errors should properly create instances of themselves');
        expect(testError).not.instanceof(TestError2, 'defined application errors should have their own independent identity');
        const normalError = new Error('test');
        expect(normalError).not.instanceOf(TestError, 'regular errors should not be considered application errors');
    });

    it('bare objects should still match', () => {
        const literal = {
            code: TestError.code,
            message: 'cool'
        };
        expect(literal).instanceof(TestError, 'some bare objects should be considered application error');
        expect(literal).not.instanceof(TestError2, 'instanceof should only return true if the code matches');
    });
});
