// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildVirtualListOffsets,
    resolveVirtualListTotalHeight,
    resolveVirtualListVisibleRange,
} from './qaap-transcript-virtual-list-math';

describe('qaap-transcript-virtual-list-math', () => {

    it('buildVirtualListOffsets accumulates prefix offsets with default fallback', () => {
        const offsets = buildVirtualListOffsets([100, 0, 50], 80);
        expect(offsets).to.deep.equal([0, 100, 180, 230]);
        expect(resolveVirtualListTotalHeight(offsets)).to.equal(230);
    });

    it('resolveVirtualListVisibleRange windowizes a long list', () => {
        const offsets = buildVirtualListOffsets(Array.from({ length: 100 }, () => 100), 100);
        const range = resolveVirtualListVisibleRange(500, 300, offsets, 50);
        expect(range.startIndex).to.equal(4);
        expect(range.endIndex).to.be.greaterThan(range.startIndex);
        expect(range.windowOffset).to.equal(400);
        expect(range.totalHeight).to.equal(10_000);
    });

    it('resolveVirtualListVisibleRange matches a linear scan on irregular sizes', () => {
        const sizes = [40, 0, 320, 12, 90, 0, 500, 64, 64, 200];
        const defaultSize = 128;
        const offsets = buildVirtualListOffsets(sizes, defaultSize);
        for (let scrollTop = 0; scrollTop <= resolveVirtualListTotalHeight(offsets); scrollTop += 37) {
            const range = resolveVirtualListVisibleRange(scrollTop, 250, offsets, 60);
            const viewStart = Math.max(0, scrollTop - 60);
            const viewEnd = scrollTop + 250 + 60;
            let expectedStart = 0;
            while (expectedStart < sizes.length - 1 && offsets[expectedStart + 1] <= viewStart) {
                expectedStart++;
            }
            let expectedEnd = expectedStart;
            while (expectedEnd < sizes.length - 1 && offsets[expectedEnd + 1] < viewEnd) {
                expectedEnd++;
            }
            expect(range.startIndex, `start at scrollTop=${scrollTop}`).to.equal(expectedStart);
            expect(range.endIndex, `end at scrollTop=${scrollTop}`).to.equal(expectedEnd);
            expect(range.windowOffset).to.equal(offsets[range.startIndex]);
        }
    });

    it('resolveVirtualListVisibleRange handles the empty list', () => {
        const range = resolveVirtualListVisibleRange(0, 300, buildVirtualListOffsets([], 100), 50);
        expect(range.startIndex).to.equal(0);
        expect(range.endIndex).to.equal(-1);
        expect(range.totalHeight).to.equal(0);
    });
});
