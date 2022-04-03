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

import { AssertionError } from 'assert';
import { expect } from 'chai';
import { InProcessExchanger } from './in-process-proxy-provider';

describe('InProcessExchanger', () => {

    it('should exchange data between two callers', async () => {
        const exchanger = new InProcessExchanger<number>();
        const firstPromise = exchanger.exchange(1);
        const secondPromise = exchanger.exchange(2);
        const [first, second] = await Promise.all([firstPromise, secondPromise]);
        expect(first).eq(2);
        expect(second).eq(1);
        await exchanger.exchange(3).then(
            ok => { throw new AssertionError({ message: 'a third call to .exchange() should have failed' }); },
            error => { /* pass the test */ }
        );
    });
});
