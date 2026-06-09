// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    hasTranscriptScrollableContentState,
    shouldShowTranscriptScrollToBottomState,
} from './qaap-transcript-scroll-to-bottom';

describe('qaap-transcript-scroll-to-bottom', () => {
    it('hasTranscriptScrollableContentState is false for empty chat', () => {
        expect(hasTranscriptScrollableContentState({
            emptyChat: true,
            hasMessages: true,
            scrollTop: 0,
            clientHeight: 400,
            scrollHeight: 1200,
        })).to.equal(false);
    });

    it('hasTranscriptScrollableContentState is false when content fits on screen', () => {
        expect(hasTranscriptScrollableContentState({
            emptyChat: false,
            hasMessages: true,
            scrollTop: 0,
            clientHeight: 400,
            scrollHeight: 400,
        })).to.equal(false);
    });

    it('hasTranscriptScrollableContentState is true when messages overflow', () => {
        expect(hasTranscriptScrollableContentState({
            emptyChat: false,
            hasMessages: true,
            scrollTop: 0,
            clientHeight: 400,
            scrollHeight: 1200,
        })).to.equal(true);
    });

    it('shouldShowTranscriptScrollToBottomState is false at the bottom', () => {
        expect(shouldShowTranscriptScrollToBottomState({
            emptyChat: false,
            hasMessages: true,
            scrollTop: 800,
            clientHeight: 400,
            scrollHeight: 1200,
        })).to.equal(false);
    });

    it('shouldShowTranscriptScrollToBottomState is true when scrolled up with overflow', () => {
        expect(shouldShowTranscriptScrollToBottomState({
            emptyChat: false,
            hasMessages: true,
            scrollTop: 120,
            clientHeight: 400,
            scrollHeight: 1200,
        })).to.equal(true);
    });
});
