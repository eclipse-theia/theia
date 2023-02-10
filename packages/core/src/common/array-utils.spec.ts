// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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
import { ArrayUtils } from './array-utils';

describe('array-utils', () => {
    it('pushAll should allow pushing of large number of items', () => {
        const initial = Array.from({ length: 10 });
        const addition = Array.from({ length: 1000000 });

        const result = ArrayUtils.pushAll(initial, addition);
        expect(result.length).to.equal(1000010);
    });

    it('pushAll should allow pushing of large number of items, independent from order', () => {
        const initial = Array.from({ length: 1000000 });
        const addition = Array.from({ length: 10 });

        const result = ArrayUtils.pushAll(initial, addition);
        expect(result.length).to.equal(1000010);
    });
});
