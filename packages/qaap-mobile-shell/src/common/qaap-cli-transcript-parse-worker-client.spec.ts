// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { shouldApplyCliTranscriptParseWorkerResult } from '../browser/qaap-cli-transcript-parse-worker-protocol';

describe('qaap-cli-transcript-parse-worker-client', () => {

    describe('shouldApplyCliTranscriptParseWorkerResult', () => {

        it('accepts matching request ids', () => {
            expect(shouldApplyCliTranscriptParseWorkerResult(2, 2)).to.equal(true);
        });

        it('rejects stale responses', () => {
            expect(shouldApplyCliTranscriptParseWorkerResult(2, 3)).to.equal(false);
            expect(shouldApplyCliTranscriptParseWorkerResult(undefined, 1)).to.equal(false);
        });
    });
});
