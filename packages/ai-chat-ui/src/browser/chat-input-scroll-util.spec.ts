// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
import { computeRevealScrollDelta } from './chat-input-scroll-util';

describe('computeRevealScrollDelta', () => {
    const viewportHeight = 240;

    it('returns 0 when the row is fully visible', () => {
        expect(computeRevealScrollDelta(100, 120, viewportHeight)).to.equal(0);
    });

    it('returns 0 when the row touches the bottom edge', () => {
        expect(computeRevealScrollDelta(220, 240, viewportHeight)).to.equal(0);
    });

    it('scrolls up by the overshoot when the row is above the viewport', () => {
        expect(computeRevealScrollDelta(-346, -326, viewportHeight)).to.equal(-346);
    });

    it('scrolls down by the overshoot when the row is below the viewport', () => {
        expect(computeRevealScrollDelta(560, 580, viewportHeight)).to.equal(340);
    });

    it('scrolls down when the row is only partially below the viewport', () => {
        expect(computeRevealScrollDelta(230, 250, viewportHeight)).to.equal(10);
    });
});
