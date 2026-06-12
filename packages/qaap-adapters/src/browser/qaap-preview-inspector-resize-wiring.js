"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
exports.QAAP_PREVIEW_INSPECTOR_RESIZING = exports.QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE = void 0;
exports.syncPreviewInspectorResizeHandleOrientation = syncPreviewInspectorResizeHandleOrientation;
exports.wirePreviewInspectorResize = wirePreviewInspectorResize;
var disposable_1 = require("@theia/core/lib/common/disposable");
var widget_1 = require("@theia/core/lib/browser/widgets/widget");
var nls_1 = require("@theia/core/lib/common/nls");
var preview_inspector_panel_root_1 = require("@theia/qaap-element-inspector/lib/browser/preview-inspector-panel-root");
var qaap_preview_inspector_panel_size_1 = require("./qaap-preview-inspector-panel-size");
exports.QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE = 'qaap-preview-inspector-resize-handle';
exports.QAAP_PREVIEW_INSPECTOR_RESIZING = 'qaap-mod-inspector-resizing';
function syncPreviewInspectorResizeHandleOrientation(split, position) {
    var handle = split.querySelector(":scope > .".concat(exports.QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE));
    if (handle instanceof HTMLElement) {
        handle.setAttribute('aria-orientation', position === 'bottom' ? 'horizontal' : 'vertical');
    }
}
function wirePreviewInspectorResize(split, inspectorSlot, toDispose) {
    if (split.querySelector(":scope > .".concat(exports.QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE))) {
        return;
    }
    inspectorSlot.classList.add('qaap-preview-inspector-slot--resizable');
    (0, preview_inspector_panel_root_1.ensurePreviewInspectorPanelRoot)(inspectorSlot);
    (0, qaap_preview_inspector_panel_size_1.applyPreviewInspectorPanelSize)(inspectorSlot, split);
    var handle = document.createElement('div');
    handle.className = exports.QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', (0, qaap_preview_inspector_panel_size_1.readPreviewInspectorPosition)() === 'bottom' ? 'horizontal' : 'vertical');
    handle.setAttribute('aria-label', nls_1.nls.localize('qaap/preview/resizeInspector', 'Resize element inspector panel'));
    handle.tabIndex = 0;
    split.insertBefore(handle, inspectorSlot);
    var resizePointerId;
    var dragStartX = 0;
    var dragStartY = 0;
    var dragStartWidth = 0;
    var dragStartHeight = 0;
    var stackedLayout = function () { return (0, qaap_preview_inspector_panel_size_1.readPreviewInspectorPosition)() === 'bottom'; };
    var persistSize = function () {
        if (stackedLayout()) {
            (0, qaap_preview_inspector_panel_size_1.writePreviewInspectorHeight)(inspectorSlot.getBoundingClientRect().height, split.clientHeight);
        }
        else {
            (0, qaap_preview_inspector_panel_size_1.writePreviewInspectorWidth)(inspectorSlot.getBoundingClientRect().width, split.clientWidth);
        }
    };
    var stopDrag = function (e) {
        if (resizePointerId === undefined || e.pointerId !== resizePointerId) {
            return;
        }
        try {
            handle.releasePointerCapture(e.pointerId);
        }
        catch (_a) {
            /* already released */
        }
        resizePointerId = undefined;
        document.body.classList.remove(exports.QAAP_PREVIEW_INSPECTOR_RESIZING);
        document.body.classList.remove("".concat(exports.QAAP_PREVIEW_INSPECTOR_RESIZING, "-vertical"));
        persistSize();
    };
    var onPointerMove = function (e) {
        if (resizePointerId === undefined || e.pointerId !== resizePointerId) {
            return;
        }
        if (stackedLayout()) {
            var bounded_1 = (0, qaap_preview_inspector_panel_size_1.clampPreviewInspectorHeight)(dragStartHeight + (dragStartY - e.clientY), split.clientHeight);
            inspectorSlot.style.height = "".concat(bounded_1, "px");
            inspectorSlot.style.flex = "0 0 ".concat(bounded_1, "px");
            return;
        }
        var bounded = (0, qaap_preview_inspector_panel_size_1.clampPreviewInspectorWidth)(dragStartWidth + (dragStartX - e.clientX), split.clientWidth);
        inspectorSlot.style.width = "".concat(bounded, "px");
        inspectorSlot.style.flex = "0 0 ".concat(bounded, "px");
    };
    toDispose.push((0, widget_1.addEventListener)(handle, 'pointerdown', function (e) {
        if (e.button !== 0) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        handle.setAttribute('aria-orientation', stackedLayout() ? 'horizontal' : 'vertical');
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartWidth = inspectorSlot.getBoundingClientRect().width;
        dragStartHeight = inspectorSlot.getBoundingClientRect().height;
        resizePointerId = e.pointerId;
        handle.setPointerCapture(e.pointerId);
        document.body.classList.add(exports.QAAP_PREVIEW_INSPECTOR_RESIZING);
        if (stackedLayout()) {
            document.body.classList.add("".concat(exports.QAAP_PREVIEW_INSPECTOR_RESIZING, "-vertical"));
        }
    }));
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    toDispose.push(disposable_1.Disposable.create(function () {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', stopDrag);
        window.removeEventListener('pointercancel', stopDrag);
    }));
    toDispose.push((0, widget_1.addEventListener)(handle, 'lostpointercapture', function () {
        if (resizePointerId === undefined) {
            return;
        }
        resizePointerId = undefined;
        document.body.classList.remove(exports.QAAP_PREVIEW_INSPECTOR_RESIZING);
        document.body.classList.remove("".concat(exports.QAAP_PREVIEW_INSPECTOR_RESIZING, "-vertical"));
        persistSize();
    }));
    toDispose.push((0, widget_1.addEventListener)(handle, 'keydown', function (e) {
        var step = e.shiftKey ? 32 : 16;
        if (stackedLayout()) {
            var current_1 = inspectorSlot.getBoundingClientRect().height;
            var next_1 = current_1;
            if (e.key === 'ArrowUp') {
                next_1 = current_1 + step;
            }
            else if (e.key === 'ArrowDown') {
                next_1 = current_1 - step;
            }
            else {
                return;
            }
            e.preventDefault();
            var bounded_2 = (0, qaap_preview_inspector_panel_size_1.clampPreviewInspectorHeight)(next_1, split.clientHeight);
            inspectorSlot.style.height = "".concat(bounded_2, "px");
            inspectorSlot.style.flex = "0 0 ".concat(bounded_2, "px");
            (0, qaap_preview_inspector_panel_size_1.writePreviewInspectorHeight)(bounded_2, split.clientHeight);
            return;
        }
        var current = inspectorSlot.getBoundingClientRect().width;
        var next = current;
        if (e.key === 'ArrowLeft') {
            next = current + step;
        }
        else if (e.key === 'ArrowRight') {
            next = current - step;
        }
        else {
            return;
        }
        e.preventDefault();
        var bounded = (0, qaap_preview_inspector_panel_size_1.clampPreviewInspectorWidth)(next, split.clientWidth);
        inspectorSlot.style.width = "".concat(bounded, "px");
        inspectorSlot.style.flex = "0 0 ".concat(bounded, "px");
        (0, qaap_preview_inspector_panel_size_1.writePreviewInspectorWidth)(bounded, split.clientWidth);
    }));
    var onWindowResize = function () {
        if (!inspectorSlot.hidden) {
            (0, qaap_preview_inspector_panel_size_1.applyPreviewInspectorPanelSize)(inspectorSlot, split);
        }
    };
    window.addEventListener('resize', onWindowResize);
    toDispose.push(disposable_1.Disposable.create(function () { return window.removeEventListener('resize', onWindowResize); }));
}
