// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { formatTimeAgo } from './chat-date-utils';

describe('formatTimeAgo', () => {

    // `formatTimeAgo` uses the runtime's default locale when no Theia locale is
    // set (as in tests), so expected strings must be computed with a reference
    // formatter using the same locale instead of being hard-coded.
    const reference = new Intl.RelativeTimeFormat(undefined, { numeric: 'always' });

    it('uses the largest unit that fits into the elapsed time', () => {
        const cases: ReadonlyArray<readonly [number, Intl.RelativeTimeFormatUnit]> = [
            [2_000, 'second'],
            [2 * 60_000, 'minute'],
            [2 * 3_600_000, 'hour'],
            [2 * 86_400_000, 'day'],
            [2 * 604_800_000, 'week'],
            [2 * 2_629_800_000, 'month'],
            [2 * 31_557_600_000, 'year']
        ];
        for (const [elapsed, unit] of cases) {
            const timestamp = Date.now() - elapsed;
            expect(formatTimeAgo(timestamp)).to.equal(reference.format(-2, unit));
        }
    });

    it('rounds down so the value never crosses into the next larger unit', () => {
        const cases: ReadonlyArray<readonly [number, Intl.RelativeTimeFormatUnit, number]> = [
            [90_000, 'minute', 1], // 1.5 minutes floor to 1
            [59.5 * 60_000, 'minute', 59],
            [23.6 * 3_600_000, 'hour', 23],
            [6.6 * 86_400_000, 'day', 6],
            [11.6 * 2_629_800_000, 'month', 11]
        ];
        for (const [elapsed, unit, value] of cases) {
            const timestamp = Date.now() - elapsed;
            expect(formatTimeAgo(timestamp)).to.equal(reference.format(-value, unit));
        }
    });

    it('renders the present timestamp as 0 seconds ago', () => {
        expect(formatTimeAgo(Date.now())).to.equal(reference.format(0, 'second'));
    });

    it('renders future timestamps as "in ..."', () => {
        const timestamp = Date.now() + 2.5 * 3_600_000; // 2.5 hours floor to 2
        expect(formatTimeAgo(timestamp)).to.equal(reference.format(2, 'hour'));
    });
});
