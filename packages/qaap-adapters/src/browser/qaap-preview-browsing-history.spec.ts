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
    readPreviewBrowsingHistory,
    recordPreviewBrowsingVisit,
    type QaapPreviewHistoryEntry,
} from './qaap-preview-browsing-history';

describe('qaap-preview-browsing-history', () => {

    const storage = new Map<string, string>();

    beforeEach(() => {
        storage.clear();
        const mockStorage = {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => { storage.set(key, value); },
            removeItem: (key: string) => { storage.delete(key); },
            clear: () => { storage.clear(); },
            key: () => null,
            length: 0,
        };
        const g = global as typeof globalThis & { localStorage?: Storage; window?: Window & typeof globalThis };
        g.localStorage = mockStorage;
        g.window = g as unknown as Window & typeof globalThis;
        g.window.localStorage = mockStorage;
    });

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

    it('records active dev ports and dedupes proxy vs direct URLs', () => {
        recordPreviewBrowsingVisit('http://localhost:3000/qaap-dev/3001/', 'App 3001');
        recordPreviewBrowsingVisit('http://localhost:3001/', 'App 3001 again');
        const entries = readPreviewBrowsingHistory();
        expect(entries).to.have.length(1);
        expect(entries[0].url).to.equal('http://localhost:3001/');
        expect(entries[0].title).to.equal('App 3001 again');
    });
});
