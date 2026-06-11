// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { shouldApplyTranscriptMarkdownWorkerResult } from './qaap-transcript-markdown-worker-protocol';

describe('qaap-transcript-markdown-worker-client', () => {

    describe('shouldApplyTranscriptMarkdownWorkerResult', () => {

        it('accepts a result when the host generation still matches', () => {
            expect(shouldApplyTranscriptMarkdownWorkerResult(3, 3)).to.equal(true);
        });

        it('rejects stale worker results after a newer parse was requested', () => {
            expect(shouldApplyTranscriptMarkdownWorkerResult(4, 3)).to.equal(false);
        });

        it('rejects results when the host has no active generation', () => {
            expect(shouldApplyTranscriptMarkdownWorkerResult(undefined, 1)).to.equal(false);
        });
    });
});
