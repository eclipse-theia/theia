// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildConversationListMetrics,
    formatToolActivityLabel,
    parseDiffStatsFromText,
} from './qaap-agent-conversation-list-metrics';

describe('parseDiffStatsFromText', () => {
    it('parses git combined insert/delete summary', () => {
        const stats = parseDiffStatsFromText('3 files changed, 12 insertions(+), 23 deletions(-)');
        expect(stats).to.deep.equal({ added: 12, removed: 23 });
    });

    it('parses cursor-style +N -M', () => {
        const stats = parseDiffStatsFromText('summary +12 -23 done');
        expect(stats).to.deep.equal({ added: 12, removed: 23 });
    });
});

describe('formatToolActivityLabel', () => {
    it('maps search tools to Searching', () => {
        expect(formatToolActivityLabel('Grep')).to.equal('Searching');
    });
});

describe('buildConversationListMetrics', () => {
    it('exposes streaming activity and turn start', () => {
        const metrics = buildConversationListMetrics({
            status: 'streaming',
            messages: [
                { role: 'user', content: 'fix tests', createdAt: 1000 },
                {
                    role: 'agent',
                    content: '',
                    createdAt: 1100,
                    segments: [{
                        type: 'tool',
                        toolUseId: 't1',
                        name: 'Grep',
                        args: 'pattern',
                        finished: false,
                    }],
                },
            ],
        });
        expect(metrics.activityLabel).to.equal('Searching');
        expect(metrics.turnStartedAt).to.equal(1000);
    });

    it('exposes diff stats and duration for a completed turn', () => {
        const metrics = buildConversationListMetrics({
            status: 'idle',
            messages: [
                { role: 'user', content: 'ship it', createdAt: 1000 },
                {
                    role: 'agent',
                    content: 'done\n3 files changed, 5 insertions(+), 2 deletions(-)',
                    createdAt: 5000,
                },
            ],
        });
        expect(metrics.linesAdded).to.equal(5);
        expect(metrics.linesRemoved).to.equal(2);
        expect(metrics.lastTurnDurationMs).to.equal(4000);
    });

    it('accumulates diff stats across all turns in the conversation', () => {
        const metrics = buildConversationListMetrics({
            status: 'idle',
            messages: [
                { role: 'user', content: 'first', createdAt: 1000 },
                {
                    role: 'agent',
                    content: '3 files changed, 2 insertions(+), 1 deletions(-)',
                    createdAt: 2000,
                },
                { role: 'user', content: 'second', createdAt: 3000 },
                {
                    role: 'agent',
                    content: 'more work +3 -4',
                    createdAt: 4000,
                },
            ],
        });
        expect(metrics.linesAdded).to.equal(5);
        expect(metrics.linesRemoved).to.equal(5);
    });
});
