// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    detectAgentFailureKind,
    extractAgentLogFailureHint,
    formatStoredAgentFailureMessage,
    localizeAgentFailureMessage,
    localizeGenericAgentFailureMessage,
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

    it('detectAgentFailureKind recognizes auth, timeout, and network failures', () => {
        expect(detectAgentFailureKind('invalid_api_key'))
            .to.equal('auth');
        expect(detectAgentFailureKind('request timed out after 90s'))
            .to.equal('timeout');
        expect(detectAgentFailureKind('fetch failed: ECONNREFUSED'))
            .to.equal('network');
    });

    it('extractAgentLogFailureHint surfaces JSON and terminal error lines', () => {
        expect(extractAgentLogFailureHint('{"error":{"message":"provider rejected the request"}}'))
            .to.equal('provider rejected the request');
        expect(extractAgentLogFailureHint('info\nError: something went wrong\n'))
            .to.equal('Error: something went wrong');
    });

    it('resolveAgentTurnFailureMessage maps known logs to product copy', () => {
        const friendly = resolveAgentTurnFailureMessage(
            'There was an issue with the selected model.',
            { state: 'failed', exitCode: 1 },
        );
        expect(friendly).to.equal(localizeAgentFailureMessage('model_unavailable'));
    });

    it('resolveAgentTurnFailureMessage prefers log hints over generic failed copy', () => {
        const friendly = resolveAgentTurnFailureMessage(
            'stderr\nError: command not found: qaiq\n',
            { state: 'failed', exitCode: 1 },
        );
        expect(friendly).to.contain('command not found: qaiq');
    });

    it('resolveAgentTurnFailureMessage returns humanized copy when the log is empty', () => {
        expect(resolveAgentTurnFailureMessage('', { state: 'failed', exitCode: 1 }))
            .to.equal(localizeGenericAgentFailureMessage('failed', 1));
        expect(resolveAgentTurnFailureMessage('', { state: 'interrupted' }))
            .to.equal(localizeGenericAgentFailureMessage('interrupted'));
    });

    it('formatStoredAgentFailureMessage upgrades legacy exit-code copy', () => {
        expect(formatStoredAgentFailureMessage('Agent failed (exit 1).'))
            .to.equal(localizeGenericAgentFailureMessage('failed', 1));
        expect(formatStoredAgentFailureMessage('Agent interrupted.'))
            .to.equal(localizeGenericAgentFailureMessage('interrupted'));
    });
});
