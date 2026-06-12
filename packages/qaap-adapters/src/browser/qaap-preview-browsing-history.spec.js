"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
var chai_1 = require("chai");
var qaap_preview_browsing_history_1 = require("./qaap-preview-browsing-history");
describe('qaap-preview-browsing-history', function () {
    var storage = new Map();
    beforeEach(function () {
        storage.clear();
        var mockStorage = {
            getItem: function (key) { var _a; return (_a = storage.get(key)) !== null && _a !== void 0 ? _a : null; },
            setItem: function (key, value) { storage.set(key, value); },
            removeItem: function (key) { storage.delete(key); },
            clear: function () { storage.clear(); },
            key: function () { return null; },
            length: 0,
        };
        var g = global;
        g.localStorage = mockStorage;
        g.window = g;
        g.window.localStorage = mockStorage;
    });
    var now = new Date('2026-06-02T15:00:00Z').getTime();
    var todayMorning = {
        url: 'http://localhost:3000/today',
        title: 'Today page',
        visitedAt: now - 2 * 60 * 60 * 1000,
    };
    var fiveDaysAgo = {
        url: 'http://localhost:5173/week',
        title: '',
        visitedAt: now - 5 * 24 * 60 * 60 * 1000,
    };
    var twentyDaysAgo = {
        url: 'https://github.com/signin',
        title: 'Sign in to GitHub',
        visitedAt: now - 20 * 24 * 60 * 60 * 1000,
    };
    it('groups entries into today / last 7 / last 30 sections', function () {
        var sections = (0, qaap_preview_browsing_history_1.groupPreviewBrowsingHistory)([todayMorning, fiveDaysAgo, twentyDaysAgo], now);
        (0, chai_1.expect)(sections.map(function (s) { return s.id; })).to.deep.equal(['today', 'last7', 'last30']);
        (0, chai_1.expect)(sections[0].entries).to.have.length(1);
        (0, chai_1.expect)(sections[1].entries[0].url).to.equal(fiveDaysAgo.url);
    });
    it('derives labels from URL when title is empty', function () {
        (0, chai_1.expect)((0, qaap_preview_browsing_history_1.previewHistoryEntryLabel)(fiveDaysAgo)).to.equal('localhost/week');
        (0, chai_1.expect)((0, qaap_preview_browsing_history_1.previewHistoryEntryLabel)(twentyDaysAgo)).to.equal('Sign in to GitHub');
    });
    it('clamps history panel width to container bounds', function () {
        (0, chai_1.expect)((0, qaap_preview_browsing_history_1.clampPreviewHistoryPanelWidth)(100)).to.equal(qaap_preview_browsing_history_1.QAAP_PREVIEW_HISTORY_WIDTH_MIN_PX);
        (0, chai_1.expect)((0, qaap_preview_browsing_history_1.clampPreviewHistoryPanelWidth)(900, 300)).to.equal(Math.round(300 * 0.92));
    });
    it('records active dev ports and dedupes proxy vs direct URLs', function () {
        (0, qaap_preview_browsing_history_1.recordPreviewBrowsingVisit)('http://localhost:3000/qaap-dev/3001/', 'App 3001');
        (0, qaap_preview_browsing_history_1.recordPreviewBrowsingVisit)('http://localhost:3001/', 'App 3001 again');
        var entries = (0, qaap_preview_browsing_history_1.readPreviewBrowsingHistory)();
        (0, chai_1.expect)(entries).to.have.length(1);
        (0, chai_1.expect)(entries[0].url).to.equal('http://localhost:3001/');
        (0, chai_1.expect)(entries[0].title).to.equal('App 3001 again');
    });
});
