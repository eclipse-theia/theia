// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    detectAgentFailureKind,
    localizeAgentFailureMessage,
    resolveAgentTurnFailureMessage,
} from './qaap-agent-failure-message';

describe('qaap-agent-failure-message', () => {

    it('detectAgentFailureKind recognizes quota and credit exhaustion', () => {
        expect(detectAgentFailureKind('{"error":{"type":"invalid_request","message":"quota exceeded"}}'))
            .to.equal('quota');
        expect(detectAgentFailureKind('Free credits for Kimi K2.6 are exhausted.'))
            .to.equal('quota');
    });

    it('detectAgentFailureKind recognizes rate limits', () => {
        expect(detectAgentFailureKind('HTTP 429: rate_limit_exceeded'))
            .to.equal('rate_limit');
        expect(detectAgentFailureKind('Too many requests — try again later'))
            .to.equal('rate_limit');
    });

    it('detectAgentFailureKind recognizes model unavailable messages', () => {
        expect(detectAgentFailureKind('There was an issue with the selected model.'))
            .to.equal('model_unavailable');
        expect(detectAgentFailureKind('model_not_found: kimi-k2.6'))
            .to.equal('model_unavailable');
    });

    it('resolveAgentTurnFailureMessage maps known logs to product copy', () => {
        const friendly = resolveAgentTurnFailureMessage(
            'There was an issue with the selected model.',
            'Agent failed (exit 1).',
        );
        expect(friendly).to.equal(localizeAgentFailureMessage('model_unavailable'));
        expect(resolveAgentTurnFailureMessage('', 'Agent failed (exit 1).'))
            .to.equal('Agent failed (exit 1).');
    });
});
