"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
var chai_1 = require("chai");
var qaap_preview_overflow_actions_1 = require("./qaap-preview-overflow-actions");
describe('qaap-preview-overflow-actions', function () {
    it('buildPreviewOverflowMenuItems includes all Cursor-style preview actions', function () {
        var ids = (0, qaap_preview_overflow_actions_1.buildPreviewOverflowMenuItems)({ bookmarkBarVisible: function () { return false; } }).map(function (item) { return item.id; });
        (0, chai_1.expect)(ids).to.deep.equal([
            'take-screenshot',
            'hard-reload',
            'copy-url',
            'bookmark-bar',
            'inspector-side',
            'inspector-bottom',
            'clear-history',
            'clear-cookies',
            'clear-cache',
        ]);
    });
    it('bookmark bar label reflects visibility', function () {
        var hidden = (0, qaap_preview_overflow_actions_1.buildPreviewOverflowMenuItems)({ bookmarkBarVisible: function () { return false; } })
            .find(function (item) { return item.id === 'bookmark-bar'; });
        var shown = (0, qaap_preview_overflow_actions_1.buildPreviewOverflowMenuItems)({ bookmarkBarVisible: function () { return true; } })
            .find(function (item) { return item.id === 'bookmark-bar'; });
        (0, chai_1.expect)(hidden === null || hidden === void 0 ? void 0 : hidden.label).to.contain('Show');
        (0, chai_1.expect)(shown === null || shown === void 0 ? void 0 : shown.label).to.contain('Hide');
        (0, chai_1.expect)(shown === null || shown === void 0 ? void 0 : shown.checked).to.equal(true);
    });
});
