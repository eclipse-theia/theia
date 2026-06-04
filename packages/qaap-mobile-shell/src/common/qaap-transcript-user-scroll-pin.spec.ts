// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    isTranscriptScrollAtTop,
    isTranscriptScrollNearBottom,
    resolveStuckUserIndex,
    resolveTranscriptPinnedUserIndex,
    shouldPinTranscriptUserIndex,
    transcriptUserMessageScrollTop,
} from './qaap-transcript-user-scroll-pin';

describe('qaap-transcript-user-scroll-pin', () => {

    it('returns undefined at scroll top before any pin', () => {
        expect(resolveTranscriptPinnedUserIndex([4], 0, undefined)).to.equal(undefined);
    });

    it('pins once scroll passes the anchor', () => {
        expect(resolveTranscriptPinnedUserIndex([4], 120, undefined)).to.equal(0);
    });

    it('stays pinned when scrolling back toward the natural position', () => {
        expect(resolveTranscriptPinnedUserIndex([4, 400], 10, 0)).to.equal(0);
        expect(resolveTranscriptPinnedUserIndex([4, 400], 4, 0)).to.equal(0);
    });

    it('hands off to the next user message when scrolling down', () => {
        expect(resolveTranscriptPinnedUserIndex([4, 400, 900], 500, 0)).to.equal(1);
    });

    it('hands off to the previous user message when scrolling up', () => {
        expect(resolveTranscriptPinnedUserIndex([4, 400, 900], 200, 1)).to.equal(0);
    });

    it('scrolls to the message anchor offset with top padding', () => {
        expect(transcriptUserMessageScrollTop(420)).to.equal(412);
        expect(transcriptUserMessageScrollTop(4)).to.equal(0);
    });

    it('picks the last user message stuck at the scrollport top (handoff)', () => {
        expect(resolveStuckUserIndex([520, 23, 23])).to.equal(2);
        expect(resolveStuckUserIndex([23, 23, 890])).to.equal(1);
        expect(resolveStuckUserIndex([120, 400])).to.equal(undefined);
        expect(resolveStuckUserIndex([23])).to.equal(0);
        expect(resolveStuckUserIndex([25])).to.equal(undefined);
    });

    it('detects transcript top before first sticky preview', () => {
        expect(isTranscriptScrollAtTop(0)).to.equal(true);
        expect(isTranscriptScrollAtTop(2)).to.equal(false);
    });

    it('detects transcript bottom proximity for newest-response reading', () => {
        expect(isTranscriptScrollNearBottom(776, 200, 1000)).to.equal(true);
        expect(isTranscriptScrollNearBottom(740, 200, 1000)).to.equal(false);
    });

    it('does not pin the final user message while reading the latest AI response', () => {
        expect(shouldPinTranscriptUserIndex(0, 1)).to.equal(false);
        expect(shouldPinTranscriptUserIndex(1, 2)).to.equal(false);
        expect(shouldPinTranscriptUserIndex(0, 2)).to.equal(true);
        expect(shouldPinTranscriptUserIndex(undefined, 2)).to.equal(false);
    });
});
