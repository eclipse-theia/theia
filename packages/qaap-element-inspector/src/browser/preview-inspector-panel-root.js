"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
exports.QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS = void 0;
exports.ensurePreviewInspectorPanelRoot = ensurePreviewInspectorPanelRoot;
/** React mount target; keeps sibling resize handles on the inspector slot intact. */
exports.QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS = 'qaap-preview-inspector-panel-root';
function ensurePreviewInspectorPanelRoot(slot) {
    var selector = ":scope > .".concat(exports.QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS);
    var existing = slot.querySelector(selector);
    if (existing instanceof HTMLElement) {
        return existing;
    }
    var panelRoot = document.createElement('div');
    panelRoot.className = exports.QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS;
    slot.append(panelRoot);
    return panelRoot;
}
