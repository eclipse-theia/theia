// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildWorkHubHomeUsageSummary,
    formatWorkHubUsageCount,
    formatWorkHubUsageTokens,
} from './qaap-work-hub-usage-summary';

describe('qaap-work-hub-usage-summary', () => {

    const now = Date.parse('2026-06-03T15:00:00.000Z');

    it('formatWorkHubUsageTokens abbreviates millions and thousands', () => {
        expect(formatWorkHubUsageTokens(16_600_000)).to.equal('16,6M');
        expect(formatWorkHubUsageTokens(2_400)).to.equal('2,4k');
        expect(formatWorkHubUsageCount(28457)).to.equal('28.457');
    });

    it('buildWorkHubHomeUsageSummary aggregates sessions, messages, and heatmap', () => {
        const summary = buildWorkHubHomeUsageSummary([
            {
                createdAt: Date.parse('2026-06-01T10:00:00.000Z'),
                updatedAt: Date.parse('2026-06-03T12:00:00.000Z'),
                messageCount: 12,
            },
            {
                createdAt: Date.parse('2026-06-02T08:00:00.000Z'),
                updatedAt: Date.parse('2026-06-02T18:00:00.000Z'),
                messageCount: 4,
            },
        ], { now, favoriteModelLabel: 'Opus 4.7' });

        const all = summary.metricsByRange.all;
        expect(all.find(metric => metric.label === 'sessions')?.value).to.equal('2');
        expect(all.find(metric => metric.label === 'messages')?.value).to.equal('16');
        expect(all.find(metric => metric.label === 'favoriteModel')?.value).to.equal('Opus 4.7');
        expect(summary.heatmapByRange.all.length).to.equal(26 * 7);
        expect(summary.heatmapByRange.all.some(cell => cell.level > 0)).to.equal(true);
    });

    it('buildWorkHubHomeUsageSummary filters ranges', () => {
        const summary = buildWorkHubHomeUsageSummary([
            {
                createdAt: Date.parse('2026-01-01T10:00:00.000Z'),
                updatedAt: Date.parse('2026-01-01T10:00:00.000Z'),
                messageCount: 3,
            },
            {
                createdAt: Date.parse('2026-06-02T08:00:00.000Z'),
                updatedAt: Date.parse('2026-06-02T18:00:00.000Z'),
                messageCount: 4,
            },
        ], { now });

        expect(summary.metricsByRange['7d'].find(metric => metric.label === 'sessions')?.value).to.equal('1');
        expect(summary.metricsByRange.all.find(metric => metric.label === 'sessions')?.value).to.equal('2');
    });
});
