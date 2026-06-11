// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    formatTranscriptStreamElapsed,
    formatTranscriptStreamTokens,
    resolveTranscriptTurnStartMs,
    resolveTranscriptTurnStreamChars,
} from './qaap-transcript-stream-status';

describe('qaap-transcript-stream-status', () => {

    it('formats elapsed time across ranges', () => {
        expect(formatTranscriptStreamElapsed(0)).to.equal('0s');
        expect(formatTranscriptStreamElapsed(12_400)).to.equal('12s');
        expect(formatTranscriptStreamElapsed(83_000)).to.equal('1m 23s');
        expect(formatTranscriptStreamElapsed(3_720_000)).to.equal('1h 2m');
        expect(formatTranscriptStreamElapsed(-5)).to.equal('0s');
    });

    it('formats approximate token counts', () => {
        expect(formatTranscriptStreamTokens(0)).to.equal(undefined);
        expect(formatTranscriptStreamTokens(3_480)).to.equal('~870 tokens');
        expect(formatTranscriptStreamTokens(16_800)).to.equal('~4.2k tokens');
        expect(formatTranscriptStreamTokens(48_000)).to.equal('~12k tokens');
    });

    it('resolves the turn start from the last user message', () => {
        expect(resolveTranscriptTurnStartMs([
            { role: 'user', createdAt: 100 },
            { role: 'agent', createdAt: 200 },
            { role: 'user', createdAt: 300 },
            { role: 'agent', createdAt: 400 },
        ])).to.equal(300);
        expect(resolveTranscriptTurnStartMs([])).to.equal(undefined);
    });

    it('counts streamed chars from the in-flight agent message', () => {
        expect(resolveTranscriptTurnStreamChars([
            { role: 'user', createdAt: 1, content: 'hi' },
            {
                role: 'agent', createdAt: 2, segments: [
                    { type: 'thinking', content: '12345' },
                    { type: 'tool', content: 'ignored-tool-output' },
                    { type: 'text', content: '1234567890' },
                ],
            },
        ])).to.equal(15);
        expect(resolveTranscriptTurnStreamChars([
            { role: 'agent', createdAt: 2, content: 'abc' },
        ])).to.equal(3);
        expect(resolveTranscriptTurnStreamChars([{ role: 'user', content: 'hi' }])).to.equal(0);
    });
});
