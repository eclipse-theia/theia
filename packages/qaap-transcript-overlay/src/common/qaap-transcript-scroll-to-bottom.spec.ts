// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    hasTranscriptScrollableContentState,
    resolveTranscriptNearBottomThresholdPx,
    shouldShowTranscriptScrollToBottomState,
} from './qaap-transcript-scroll-to-bottom';

describe('qaap-transcript-scroll-to-bottom', () => {
    it('hasTranscriptScrollableContentState is false for empty chat', () => {
        expect(hasTranscriptScrollableContentState({
            emptyChat: true,
            hasConversationMessages: false,
            scrollTop: 0,
            clientHeight: 400,
            scrollHeight: 1200,
        })).to.equal(false);
    });

    it('hasTranscriptScrollableContentState is false when quick actions overflow without messages', () => {
        expect(hasTranscriptScrollableContentState({
            emptyChat: true,
            hasConversationMessages: false,
            scrollTop: 0,
            clientHeight: 300,
            scrollHeight: 900,
        })).to.equal(false);
    });

    it('hasTranscriptScrollableContentState is false when content fits on screen', () => {
        expect(hasTranscriptScrollableContentState({
            emptyChat: false,
            hasConversationMessages: true,
            scrollTop: 0,
            clientHeight: 400,
            scrollHeight: 400,
        })).to.equal(false);
    });

    it('hasTranscriptScrollableContentState is true when messages overflow', () => {
        expect(hasTranscriptScrollableContentState({
            emptyChat: false,
            hasConversationMessages: true,
            scrollTop: 0,
            clientHeight: 400,
            scrollHeight: 1200,
        })).to.equal(true);
    });

    it('resolveTranscriptNearBottomThresholdPx includes composer clearance', () => {
        expect(resolveTranscriptNearBottomThresholdPx(180, 180, 220)).to.equal(236);
    });

    it('shouldShowTranscriptScrollToBottomState is false at the bottom', () => {
        expect(shouldShowTranscriptScrollToBottomState({
            emptyChat: false,
            hasConversationMessages: true,
            scrollTop: 800,
            clientHeight: 400,
            scrollHeight: 1200,
        })).to.equal(false);
    });

    it('shouldShowTranscriptScrollToBottomState is false at max scroll even inside a wide threshold band', () => {
        expect(shouldShowTranscriptScrollToBottomState({
            emptyChat: false,
            hasConversationMessages: true,
            scrollTop: 800,
            clientHeight: 400,
            scrollHeight: 1200,
            nearBottomThresholdPx: 500,
        })).to.equal(false);
    });

    it('shouldShowTranscriptScrollToBottomState is false inside composer padding band', () => {
        expect(shouldShowTranscriptScrollToBottomState({
            emptyChat: false,
            hasConversationMessages: true,
            scrollTop: 620,
            clientHeight: 400,
            scrollHeight: 1200,
            nearBottomThresholdPx: 200,
        })).to.equal(false);
    });

    it('shouldShowTranscriptScrollToBottomState is true when scrolled up with overflow', () => {
        expect(shouldShowTranscriptScrollToBottomState({
            emptyChat: false,
            hasConversationMessages: true,
            scrollTop: 120,
            clientHeight: 400,
            scrollHeight: 1200,
            nearBottomThresholdPx: 200,
        })).to.equal(true);
    });
});
