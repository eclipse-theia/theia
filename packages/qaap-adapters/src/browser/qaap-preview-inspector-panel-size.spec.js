"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
var chai_1 = require("chai");
var qaap_preview_inspector_panel_size_1 = require("./qaap-preview-inspector-panel-size");
describe('qaap-preview-inspector-panel-size', function () {
    it('clamps inspector width to container bounds', function () {
        (0, chai_1.expect)((0, qaap_preview_inspector_panel_size_1.clampPreviewInspectorWidth)(100)).to.equal(qaap_preview_inspector_panel_size_1.QAAP_PREVIEW_INSPECTOR_WIDTH_MIN_PX);
        (0, chai_1.expect)((0, qaap_preview_inspector_panel_size_1.clampPreviewInspectorWidth)(900, 400)).to.equal(Math.round(400 * 0.88));
    });
    it('clamps inspector height to container bounds', function () {
        (0, chai_1.expect)((0, qaap_preview_inspector_panel_size_1.clampPreviewInspectorHeight)(100)).to.equal(qaap_preview_inspector_panel_size_1.QAAP_PREVIEW_INSPECTOR_HEIGHT_MIN_PX);
        (0, chai_1.expect)((0, qaap_preview_inspector_panel_size_1.clampPreviewInspectorHeight)(900, 500)).to.equal(Math.round(500 * 0.82));
    });
});
