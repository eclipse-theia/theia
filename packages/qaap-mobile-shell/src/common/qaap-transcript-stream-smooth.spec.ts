// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    nextStreamSmoothRevealLength,
    STREAM_SMOOTH_CATCH_UP_MS,
    STREAM_SMOOTH_MAX_LAG_CHARS,
    STREAM_SMOOTH_MIN_CHARS_PER_SECOND,
} from './qaap-transcript-stream-smooth';

describe('qaap-transcript-stream-smooth', () => {

    it('clamps to the target when already caught up', () => {
        expect(nextStreamSmoothRevealLength(100, 100, 16)).to.equal(100);
        expect(nextStreamSmoothRevealLength(120, 100, 16)).to.equal(100);
    });

    it('advances at least one character per tick while behind', () => {
        expect(nextStreamSmoothRevealLength(0, 5, 0)).to.equal(1);
        expect(nextStreamSmoothRevealLength(4, 5, 1)).to.equal(5);
    });

    it('reveals at the minimum rate for tiny backlogs', () => {
        const next = nextStreamSmoothRevealLength(0, 10, 1000);
        expect(next).to.equal(10);
        const perFrame = nextStreamSmoothRevealLength(0, 1000, 16) - 0;
        expect(perFrame).to.be.at.least(Math.floor(STREAM_SMOOTH_MIN_CHARS_PER_SECOND * 16 / 1000));
    });

    it('drains most of a backlog within two catch-up windows (exponential approach)', () => {
        const backlog = STREAM_SMOOTH_MAX_LAG_CHARS;
        let revealed = 0;
        for (let elapsed = 0; elapsed < STREAM_SMOOTH_CATCH_UP_MS * 2; elapsed += 16) {
            revealed = nextStreamSmoothRevealLength(revealed, backlog, 16);
        }
        expect(backlog - revealed).to.be.at.most(backlog * 0.2);
    });

    it('always finishes a stalled stream via the minimum-rate floor', () => {
        const backlog = STREAM_SMOOTH_MAX_LAG_CHARS;
        let revealed = 0;
        let ticks = 0;
        while (revealed < backlog && ticks < 1000) {
            revealed = nextStreamSmoothRevealLength(revealed, backlog, 16);
            ticks++;
        }
        expect(revealed).to.equal(backlog);
    });

    it('jumps straight to the end when the backlog is too large', () => {
        expect(nextStreamSmoothRevealLength(0, STREAM_SMOOTH_MAX_LAG_CHARS + 1, 16))
            .to.equal(STREAM_SMOOTH_MAX_LAG_CHARS + 1);
    });

    it('is monotonic and bounded by the target', () => {
        let revealed = 0;
        for (let tick = 0; tick < 200; tick++) {
            const next = nextStreamSmoothRevealLength(revealed, 500, 16);
            expect(next).to.be.at.least(revealed);
            expect(next).to.be.at.most(500);
            revealed = next;
        }
        expect(revealed).to.equal(500);
    });
});
