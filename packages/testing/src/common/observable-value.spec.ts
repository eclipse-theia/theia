// *****************************************************************************
// Copyright (C) 2023 Mathieu Bussieres and others.
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

import { expect } from 'chai';
import { MutableObservableValue } from './observable-value';

describe('MutableObservableValue', () => {
    describe('value', () => {
        it('gets the value', () => {
            const VALUE = 'Test';
            const TEST = new MutableObservableValue(VALUE);
            expect(TEST.value).to.eq(VALUE);
        });
        it('sets a new value', () => {
            const VALUE = 'Test';
            const TEST = new MutableObservableValue(VALUE);
            expect(TEST.value).to.eq(VALUE);

            const NEW_VALUE = 'New Test';
            TEST.value = NEW_VALUE;
            expect(TEST.value).to.eq(NEW_VALUE);
        });
    });
});
