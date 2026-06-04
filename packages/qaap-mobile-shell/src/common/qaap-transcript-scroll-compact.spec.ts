// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    isTranscriptContentTall,
    transcriptScrollCompactMaxHeightPx,
    TRANSCRIPT_SCROLL_COMPACT_LINE_COUNT,
} from './qaap-transcript-scroll-compact';

describe('qaap-transcript-scroll-compact', () => {

    it('computes max height for five lines at 13px', () => {
        const max = transcriptScrollCompactMaxHeightPx(13, TRANSCRIPT_SCROLL_COMPACT_LINE_COUNT);
        expect(max).to.equal(Math.ceil(13 * 1.58 * 5 + 6));
    });

    it('marks content taller than the compact cap as tall', () => {
        const max = transcriptScrollCompactMaxHeightPx(13);
        const el = { scrollHeight: max + 10 } as HTMLElement;
        expect(isTranscriptContentTall(el, max)).to.equal(true);
        expect(isTranscriptContentTall({ scrollHeight: max } as HTMLElement, max)).to.equal(false);
    });
});
