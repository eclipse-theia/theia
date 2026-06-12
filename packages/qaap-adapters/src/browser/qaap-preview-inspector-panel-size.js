"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
exports.QAAP_PREVIEW_INSPECTOR_MOBILE_MQ = exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_DEFAULT_RATIO = exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_MAX_PX = exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_MIN_PX = exports.QAAP_PREVIEW_INSPECTOR_WIDTH_DEFAULT_PX = exports.QAAP_PREVIEW_INSPECTOR_WIDTH_MAX_PX = exports.QAAP_PREVIEW_INSPECTOR_WIDTH_MIN_PX = exports.QAAP_PREVIEW_INSPECTOR_POSITION_STORAGE_KEY = exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_STORAGE_KEY = exports.QAAP_PREVIEW_INSPECTOR_WIDTH_STORAGE_KEY = void 0;
exports.isPreviewInspectorMobileLayout = isPreviewInspectorMobileLayout;
exports.resolveDefaultPreviewInspectorPosition = resolveDefaultPreviewInspectorPosition;
exports.readPreviewInspectorPosition = readPreviewInspectorPosition;
exports.writePreviewInspectorPosition = writePreviewInspectorPosition;
exports.clampPreviewInspectorWidth = clampPreviewInspectorWidth;
exports.clampPreviewInspectorHeight = clampPreviewInspectorHeight;
exports.readPreviewInspectorWidth = readPreviewInspectorWidth;
exports.readPreviewInspectorHeight = readPreviewInspectorHeight;
exports.writePreviewInspectorWidth = writePreviewInspectorWidth;
exports.writePreviewInspectorHeight = writePreviewInspectorHeight;
exports.applyPreviewInspectorPanelSize = applyPreviewInspectorPanelSize;
exports.QAAP_PREVIEW_INSPECTOR_WIDTH_STORAGE_KEY = 'qaap.preview.inspectorPanelWidth';
exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_STORAGE_KEY = 'qaap.preview.inspectorPanelHeight';
exports.QAAP_PREVIEW_INSPECTOR_POSITION_STORAGE_KEY = 'qaap.preview.inspectorPanelPosition';
exports.QAAP_PREVIEW_INSPECTOR_WIDTH_MIN_PX = 240;
exports.QAAP_PREVIEW_INSPECTOR_WIDTH_MAX_PX = 720;
exports.QAAP_PREVIEW_INSPECTOR_WIDTH_DEFAULT_PX = 320;
exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_MIN_PX = 160;
exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_MAX_PX = 900;
exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_DEFAULT_RATIO = 0.45;
exports.QAAP_PREVIEW_INSPECTOR_MOBILE_MQ = '(max-width: 767px)';
function isPreviewInspectorMobileLayout() {
    return typeof window !== 'undefined' && window.matchMedia(exports.QAAP_PREVIEW_INSPECTOR_MOBILE_MQ).matches;
}
function resolveDefaultPreviewInspectorPosition() {
    return isPreviewInspectorMobileLayout() ? 'bottom' : 'side';
}
function readPreviewInspectorPosition() {
    var fallback = resolveDefaultPreviewInspectorPosition();
    if (typeof window === 'undefined') {
        return fallback;
    }
    try {
        var raw = window.localStorage.getItem(exports.QAAP_PREVIEW_INSPECTOR_POSITION_STORAGE_KEY);
        if (raw === 'side' || raw === 'bottom') {
            return raw;
        }
    }
    catch (_a) {
        /* storage blocked */
    }
    return fallback;
}
function writePreviewInspectorPosition(position) {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(exports.QAAP_PREVIEW_INSPECTOR_POSITION_STORAGE_KEY, position);
    }
    catch (_a) {
        /* storage blocked */
    }
}
function clampPreviewInspectorWidth(widthPx, containerWidthPx) {
    var max = exports.QAAP_PREVIEW_INSPECTOR_WIDTH_MAX_PX;
    if (containerWidthPx !== undefined && containerWidthPx > 0) {
        max = Math.min(max, Math.round(containerWidthPx * 0.88));
    }
    max = Math.max(exports.QAAP_PREVIEW_INSPECTOR_WIDTH_MIN_PX, max);
    return Math.max(exports.QAAP_PREVIEW_INSPECTOR_WIDTH_MIN_PX, Math.min(max, Math.round(widthPx)));
}
function clampPreviewInspectorHeight(heightPx, containerHeightPx) {
    var max = exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_MAX_PX;
    if (containerHeightPx !== undefined && containerHeightPx > 0) {
        max = Math.min(max, Math.round(containerHeightPx * 0.82));
    }
    max = Math.max(exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_MIN_PX, max);
    return Math.max(exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_MIN_PX, Math.min(max, Math.round(heightPx)));
}
function readPreviewInspectorWidth(containerWidthPx) {
    if (typeof window === 'undefined') {
        return clampPreviewInspectorWidth(exports.QAAP_PREVIEW_INSPECTOR_WIDTH_DEFAULT_PX, containerWidthPx);
    }
    try {
        var raw = window.localStorage.getItem(exports.QAAP_PREVIEW_INSPECTOR_WIDTH_STORAGE_KEY);
        var parsed = raw ? Number(raw) : exports.QAAP_PREVIEW_INSPECTOR_WIDTH_DEFAULT_PX;
        if (!Number.isFinite(parsed)) {
            return clampPreviewInspectorWidth(exports.QAAP_PREVIEW_INSPECTOR_WIDTH_DEFAULT_PX, containerWidthPx);
        }
        return clampPreviewInspectorWidth(parsed, containerWidthPx);
    }
    catch (_a) {
        return clampPreviewInspectorWidth(exports.QAAP_PREVIEW_INSPECTOR_WIDTH_DEFAULT_PX, containerWidthPx);
    }
}
function readPreviewInspectorHeight(containerHeightPx) {
    var fallback = containerHeightPx && containerHeightPx > 0
        ? Math.round(containerHeightPx * exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_DEFAULT_RATIO)
        : 320;
    if (typeof window === 'undefined') {
        return clampPreviewInspectorHeight(fallback, containerHeightPx);
    }
    try {
        var raw = window.localStorage.getItem(exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_STORAGE_KEY);
        var parsed = raw ? Number(raw) : fallback;
        if (!Number.isFinite(parsed)) {
            return clampPreviewInspectorHeight(fallback, containerHeightPx);
        }
        return clampPreviewInspectorHeight(parsed, containerHeightPx);
    }
    catch (_a) {
        return clampPreviewInspectorHeight(fallback, containerHeightPx);
    }
}
function writePreviewInspectorWidth(widthPx, containerWidthPx) {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(exports.QAAP_PREVIEW_INSPECTOR_WIDTH_STORAGE_KEY, String(clampPreviewInspectorWidth(widthPx, containerWidthPx)));
    }
    catch (_a) {
        /* storage blocked */
    }
}
function writePreviewInspectorHeight(heightPx, containerHeightPx) {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(exports.QAAP_PREVIEW_INSPECTOR_HEIGHT_STORAGE_KEY, String(clampPreviewInspectorHeight(heightPx, containerHeightPx)));
    }
    catch (_a) {
        /* storage blocked */
    }
}
function applyPreviewInspectorPanelSize(inspectorSlot, split) {
    var position = readPreviewInspectorPosition();
    split.classList.toggle('qaap-preview-split--inspector-bottom', position === 'bottom');
    split.classList.toggle('qaap-preview-split--inspector-side', position === 'side');
    if (position === 'bottom') {
        var height = readPreviewInspectorHeight(split.clientHeight);
        inspectorSlot.style.width = '100%';
        inspectorSlot.style.maxWidth = 'none';
        inspectorSlot.style.height = "".concat(height, "px");
        inspectorSlot.style.flex = "0 0 ".concat(height, "px");
        return;
    }
    var width = readPreviewInspectorWidth(split.clientWidth);
    inspectorSlot.style.width = "".concat(width, "px");
    inspectorSlot.style.flex = "0 0 ".concat(width, "px");
    inspectorSlot.style.maxWidth = 'none';
    inspectorSlot.style.height = '';
}
