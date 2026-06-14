// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { resolveQaapAgentTaskVisualStatus } from './qaap-agent-task-visual-status';

describe('resolveQaapAgentTaskVisualStatus', () => {
    it('keeps failures above every other signal', () => {
        const status = resolveQaapAgentTaskVisualStatus(
            { state: 'failed' },
            { status: 'streaming', linkedPullRequest: { owner: 'acme', repo: 'app', number: 4 }, messageCount: 2 },
            true,
        );
        expect(status.id).to.equal('failed');
    });

    it('classifies queued backend tasks as queued', () => {
        const status = resolveQaapAgentTaskVisualStatus({ state: 'queued' });
        expect(status.label).to.equal('queued');
    });

    it('classifies running backend or streaming conversation state as running', () => {
        expect(resolveQaapAgentTaskVisualStatus({ state: 'running' }).id).to.equal('running');
        expect(resolveQaapAgentTaskVisualStatus({ state: 'idle' }, { status: 'streaming', messageCount: 1 }).id).to.equal('running');
    });

    it('classifies explicit input waits and unread agent replies as needs-you', () => {
        expect(resolveQaapAgentTaskVisualStatus({ state: 'needs-input' }).id).to.equal('needs-you');
        expect(resolveQaapAgentTaskVisualStatus(
            { state: 'idle' },
            { status: 'idle', lastMessageRole: 'agent', messageCount: 3 },
            true,
        ).id).to.equal('needs-you');
    });

    it('classifies linked pull requests as PR ready after attention states', () => {
        expect(resolveQaapAgentTaskVisualStatus(
            { state: 'completed' },
            { status: 'idle', linkedPullRequest: { owner: 'acme', repo: 'app', number: 9 }, messageCount: 4 },
        ).id).to.equal('pr-ready');
    });

    it('classifies completed work as verified', () => {
        expect(resolveQaapAgentTaskVisualStatus({ state: 'completed' }).id).to.equal('verified');
    });

    it('falls back to idle for quiet tasks', () => {
        expect(resolveQaapAgentTaskVisualStatus({ state: 'idle' }).id).to.equal('idle');
    });

    it('classifies failed conversations even when task state was derived as completed', () => {
        expect(resolveQaapAgentTaskVisualStatus(
            { state: 'completed' },
            { status: 'failed', messageCount: 2 },
        ).id).to.equal('failed');
    });
});

