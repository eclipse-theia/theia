// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    clampPreviewHistoryPanelWidth,
    groupPreviewBrowsingHistory,
    previewHistoryEntryLabel,
    QAAP_PREVIEW_HISTORY_WIDTH_MIN_PX,
    type QaapPreviewHistoryEntry,
} from './qaap-preview-browsing-history';

describe('qaap-preview-browsing-history', () => {

    const now = new Date('2026-06-02T15:00:00Z').getTime();
    const todayMorning: QaapPreviewHistoryEntry = {
        url: 'http://localhost:3000/today',
        title: 'Today page',
        visitedAt: now - 2 * 60 * 60 * 1000,
    };
    const fiveDaysAgo: QaapPreviewHistoryEntry = {
        url: 'http://localhost:5173/week',
        title: '',
        visitedAt: now - 5 * 24 * 60 * 60 * 1000,
    };
    const twentyDaysAgo: QaapPreviewHistoryEntry = {
        url: 'https://github.com/signin',
        title: 'Sign in to GitHub',
        visitedAt: now - 20 * 24 * 60 * 60 * 1000,
    };

    it('groups entries into today / last 7 / last 30 sections', () => {
        const sections = groupPreviewBrowsingHistory([todayMorning, fiveDaysAgo, twentyDaysAgo], now);
        expect(sections.map(s => s.id)).to.deep.equal(['today', 'last7', 'last30']);
        expect(sections[0].entries).to.have.length(1);
        expect(sections[1].entries[0].url).to.equal(fiveDaysAgo.url);
    });

    it('derives labels from URL when title is empty', () => {
        expect(previewHistoryEntryLabel(fiveDaysAgo)).to.equal('localhost/week');
        expect(previewHistoryEntryLabel(twentyDaysAgo)).to.equal('Sign in to GitHub');
    });

    it('clamps history panel width to container bounds', () => {
        expect(clampPreviewHistoryPanelWidth(100)).to.equal(QAAP_PREVIEW_HISTORY_WIDTH_MIN_PX);
        expect(clampPreviewHistoryPanelWidth(900, 300)).to.equal(Math.round(300 * 0.92));
    });
});
