// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { shouldDeferTranscriptRowHeavyContent } from './qaap-transcript-row-defer-math';

describe('qaap-transcript-row-defer', () => {

    it('shouldDeferTranscriptRowHeavyContent keeps the streaming tail eager', () => {
        expect(shouldDeferTranscriptRowHeavyContent({
            messageIndex: 4,
            messageCount: 5,
            conversationStreaming: true,
        })).to.equal(false);
    });

    it('shouldDeferTranscriptRowHeavyContent defers historical rows', () => {
        expect(shouldDeferTranscriptRowHeavyContent({
            messageIndex: 2,
            messageCount: 5,
            conversationStreaming: true,
        })).to.equal(true);
        expect(shouldDeferTranscriptRowHeavyContent({
            messageIndex: 4,
            messageCount: 5,
            conversationStreaming: false,
        })).to.equal(true);
    });
});
