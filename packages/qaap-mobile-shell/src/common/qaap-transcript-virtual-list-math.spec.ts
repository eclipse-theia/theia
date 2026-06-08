// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildVirtualListLayouts,
    resolveVirtualListTotalHeight,
    resolveVirtualListVisibleRange,
} from './qaap-transcript-virtual-list-math';

describe('qaap-transcript-virtual-list-math', () => {

    it('buildVirtualListLayouts accumulates offsets', () => {
        const layouts = buildVirtualListLayouts([100, 0, 50], 80);
        expect(layouts.map(layout => layout.offset)).to.deep.equal([0, 100, 180]);
        expect(layouts.map(layout => layout.size)).to.deep.equal([100, 80, 50]);
        expect(resolveVirtualListTotalHeight(layouts)).to.equal(230);
    });

    it('resolveVirtualListVisibleRange windowizes a long list', () => {
        const layouts = buildVirtualListLayouts(Array.from({ length: 100 }, () => 100), 100);
        const range = resolveVirtualListVisibleRange(500, 300, layouts, 50);
        expect(range.startIndex).to.equal(4);
        expect(range.endIndex).to.be.greaterThan(range.startIndex);
        expect(range.windowOffset).to.equal(400);
        expect(range.totalHeight).to.equal(10_000);
    });
});
