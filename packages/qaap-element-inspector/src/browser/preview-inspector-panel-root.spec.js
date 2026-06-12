"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
var jsdom_1 = require("@theia/core/lib/browser/test/jsdom");
var disableJSDOM = (0, jsdom_1.enableJSDOM)();
var chai_1 = require("chai");
var preview_inspector_panel_root_1 = require("./preview-inspector-panel-root");
disableJSDOM();
describe('preview-inspector-panel-root', function () {
    before(function () {
        disableJSDOM = (0, jsdom_1.enableJSDOM)();
    });
    after(function () {
        disableJSDOM();
    });
    it('ensurePreviewInspectorPanelRoot returns a stable child of the slot', function () {
        var slot = document.createElement('aside');
        document.body.append(slot);
        var first = (0, preview_inspector_panel_root_1.ensurePreviewInspectorPanelRoot)(slot);
        var second = (0, preview_inspector_panel_root_1.ensurePreviewInspectorPanelRoot)(slot);
        (0, chai_1.expect)(first).to.equal(second);
        (0, chai_1.expect)(slot.querySelectorAll(":scope > .".concat(preview_inspector_panel_root_1.QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS)).length).to.equal(1);
    });
});
