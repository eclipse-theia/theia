/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { hexStrToUnsignedLong } from './util';
import { expect } from 'chai';
import * as Long from 'long';

describe('utils', function (): void {
    it('#hexStrToUnsignedLong', function (): void {
        let val = hexStrToUnsignedLong('');
        expect(val).eql(new Long(0, 0, true));

        val = hexStrToUnsignedLong('0x');
        expect(val).eql(new Long(0, 0, true));

        val = hexStrToUnsignedLong('0x0');
        expect(val).eql(new Long(0, 0, true));

        val = hexStrToUnsignedLong('0x1');
        expect(val).eql(new Long(0x1, 0, true));

        val = hexStrToUnsignedLong('0x12345678abcd');
        expect(val).eql(new Long(0x5678abcd, 0x1234, true));

        val = hexStrToUnsignedLong('0x12345678abcd1234');
        expect(val).eql(new Long(0xabcd1234, 0x12345678, true));
    });

    it('should handle -1 correctly', () => {
        const val = hexStrToUnsignedLong('-0x1');
        expect(val).eql(Long.fromInt(-1, true));
    });

    it('should handle long decimal numbers (up to 2^64-1)', () => {
        const input = '18446744073709551615';
        const val = Long.fromString(input, true, 10);
        expect(val.toString(10)).eql(input);
    });
});
