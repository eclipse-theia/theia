"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
exports.QaapPreviewInlineInspector = exports.applyPreviewInspectorPanelSize = exports.wirePreviewInspectorResize = exports.QAAP_PREVIEW_INSPECTOR_RESIZING = exports.QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE = void 0;
exports.createPreviewSplitLayout = createPreviewSplitLayout;
exports.setPreviewInspectorPosition = setPreviewInspectorPosition;
var nls_1 = require("@theia/core/lib/common/nls");
var element_inspector_panel_mount_1 = require("@theia/qaap-element-inspector/lib/browser/element-inspector-panel-mount");
var qaap_preview_inspector_panel_size_1 = require("./qaap-preview-inspector-panel-size");
Object.defineProperty(exports, "applyPreviewInspectorPanelSize", { enumerable: true, get: function () { return qaap_preview_inspector_panel_size_1.applyPreviewInspectorPanelSize; } });
var qaap_preview_inspector_resize_wiring_1 = require("./qaap-preview-inspector-resize-wiring");
Object.defineProperty(exports, "QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE", { enumerable: true, get: function () { return qaap_preview_inspector_resize_wiring_1.QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE; } });
Object.defineProperty(exports, "QAAP_PREVIEW_INSPECTOR_RESIZING", { enumerable: true, get: function () { return qaap_preview_inspector_resize_wiring_1.QAAP_PREVIEW_INSPECTOR_RESIZING; } });
Object.defineProperty(exports, "wirePreviewInspectorResize", { enumerable: true, get: function () { return qaap_preview_inspector_resize_wiring_1.wirePreviewInspectorResize; } });
/** Inline Element Inspector rail (Design / CSS / HTML) beside the preview iframe. */
var QaapPreviewInlineInspector = /** @class */ (function () {
    function QaapPreviewInlineInspector(container, options) {
        this.container = container;
        this.options = options;
        this.host = (0, element_inspector_panel_mount_1.mountEmbeddedElementInspector)(container, options.service, options.commands, options.toDispose);
    }
    QaapPreviewInlineInspector.prototype.bindToggleButton = function (button) {
        var _a;
        this.toggleButton = button;
        (_a = this.host) === null || _a === void 0 ? void 0 : _a.syncButtonState(button);
    };
    QaapPreviewInlineInspector.prototype.open = function () {
        var _a, _b;
        var split = this.container.closest('.qaap-preview-split');
        if (split instanceof HTMLElement) {
            (0, qaap_preview_inspector_panel_size_1.applyPreviewInspectorPanelSize)(this.container, split);
        }
        (_a = this.host) === null || _a === void 0 ? void 0 : _a.show();
        (_b = this.host) === null || _b === void 0 ? void 0 : _b.syncButtonState(this.toggleButton);
    };
    QaapPreviewInlineInspector.prototype.close = function () {
        var _a, _b;
        (_a = this.host) === null || _a === void 0 ? void 0 : _a.hide();
        (_b = this.host) === null || _b === void 0 ? void 0 : _b.syncButtonState(this.toggleButton);
    };
    QaapPreviewInlineInspector.prototype.toggle = function () {
        var _a;
        if (!this.host) {
            return;
        }
        this.host.toggle();
        if (this.host.isOpen() && !this.options.service.state.picked) {
            (_a = this.options.messageService) === null || _a === void 0 ? void 0 : _a.info(nls_1.nls.localize('qaap/preview/inspectorPickHint', 'Use the element picker ({0}) in the preview toolbar, then edit styles here.', 'inspect'));
        }
    };
    QaapPreviewInlineInspector.prototype.isOpen = function () {
        var _a, _b;
        return (_b = (_a = this.host) === null || _a === void 0 ? void 0 : _a.isOpen()) !== null && _b !== void 0 ? _b : false;
    };
    return QaapPreviewInlineInspector;
}());
exports.QaapPreviewInlineInspector = QaapPreviewInlineInspector;
function createPreviewSplitLayout(frameHost) {
    var _a;
    var split = document.createElement('div');
    split.className = 'qaap-preview-split';
    var frameSlot = document.createElement('div');
    frameSlot.className = 'qaap-preview-frame-slot';
    var inspectorSlot = document.createElement('aside');
    inspectorSlot.className = 'qaap-preview-inspector-slot';
    inspectorSlot.hidden = true;
    (_a = frameHost.parentElement) === null || _a === void 0 ? void 0 : _a.insertBefore(split, frameHost);
    frameSlot.append(frameHost);
    split.append(frameSlot, inspectorSlot);
    return { split: split, frameSlot: frameSlot, inspectorSlot: inspectorSlot };
}
function setPreviewInspectorPosition(split, inspectorSlot, position) {
    (0, qaap_preview_inspector_panel_size_1.writePreviewInspectorPosition)(position);
    (0, qaap_preview_inspector_panel_size_1.applyPreviewInspectorPanelSize)(inspectorSlot, split);
    (0, qaap_preview_inspector_resize_wiring_1.syncPreviewInspectorResizeHandleOrientation)(split, position);
}
