"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QAAP_PREVIEW_HISTORY_WIDTH_MAX_PX = exports.QAAP_PREVIEW_HISTORY_WIDTH_MIN_PX = exports.QAAP_PREVIEW_HISTORY_WIDTH_DEFAULT_PX = exports.QAAP_PREVIEW_HISTORY_WIDTH_STORAGE_KEY = exports.QAAP_PREVIEW_BOOKMARK_BAR_PREF_KEY = exports.QAAP_PREVIEW_BROWSING_HISTORY_STORAGE_KEY = void 0;
exports.previewHistoryEntryLabel = previewHistoryEntryLabel;
exports.faviconUrlForPreview = faviconUrlForPreview;
exports.readPreviewBrowsingHistory = readPreviewBrowsingHistory;
exports.writePreviewBrowsingHistory = writePreviewBrowsingHistory;
exports.recordPreviewBrowsingVisit = recordPreviewBrowsingVisit;
exports.clearPreviewBrowsingHistory = clearPreviewBrowsingHistory;
exports.readPreviewBookmarkBarVisible = readPreviewBookmarkBarVisible;
exports.writePreviewBookmarkBarVisible = writePreviewBookmarkBarVisible;
exports.groupPreviewBrowsingHistory = groupPreviewBrowsingHistory;
exports.clampPreviewHistoryPanelWidth = clampPreviewHistoryPanelWidth;
exports.readPreviewHistoryPanelWidth = readPreviewHistoryPanelWidth;
exports.writePreviewHistoryPanelWidth = writePreviewHistoryPanelWidth;
var qaap_preview_url_utils_1 = require("./qaap-preview-url-utils");
exports.QAAP_PREVIEW_BROWSING_HISTORY_STORAGE_KEY = 'qaap.preview.browsingHistory';
exports.QAAP_PREVIEW_BOOKMARK_BAR_PREF_KEY = 'qaap.preview.showBookmarkBar';
exports.QAAP_PREVIEW_HISTORY_WIDTH_STORAGE_KEY = 'qaap.preview.historyPanelWidth';
exports.QAAP_PREVIEW_HISTORY_WIDTH_DEFAULT_PX = 320;
exports.QAAP_PREVIEW_HISTORY_WIDTH_MIN_PX = 200;
exports.QAAP_PREVIEW_HISTORY_WIDTH_MAX_PX = 520;
var MAX_ENTRIES = 200;
function previewHistoryEntryLabel(entry) {
    var _a;
    var title = (_a = entry.title) === null || _a === void 0 ? void 0 : _a.trim();
    if (title) {
        return title;
    }
    try {
        var parsed = new URL(entry.url);
        return parsed.hostname + parsed.pathname;
    }
    catch (_b) {
        return entry.url;
    }
}
function faviconUrlForPreview(entryUrl) {
    try {
        var host = new URL(entryUrl).hostname;
        if (!host) {
            return undefined;
        }
        return "https://www.google.com/s2/favicons?domain=".concat(encodeURIComponent(host), "&sz=32");
    }
    catch (_a) {
        return undefined;
    }
}
function readPreviewBrowsingHistory() {
    if (typeof window === 'undefined') {
        return [];
    }
    try {
        var raw = window.localStorage.getItem(exports.QAAP_PREVIEW_BROWSING_HISTORY_STORAGE_KEY);
        if (!raw) {
            return [];
        }
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map(normalizeHistoryEntry)
            .filter(function (entry) { return !!entry; });
    }
    catch (_a) {
        return [];
    }
}
function writePreviewBrowsingHistory(entries) {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(exports.QAAP_PREVIEW_BROWSING_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    }
    catch (_a) {
        /* quota or private mode */
    }
}
function recordPreviewBrowsingVisit(url, title) {
    var displayUrl = (0, qaap_preview_url_utils_1.toPreviewHistoryDisplayUrl)(url);
    if (!displayUrl || displayUrl === 'about:blank') {
        return readPreviewBrowsingHistory();
    }
    var historyKey = (0, qaap_preview_url_utils_1.canonicalPreviewHistoryKey)(displayUrl);
    var now = Date.now();
    var nextTitle = (title === null || title === void 0 ? void 0 : title.trim()) || previewHistoryEntryLabel({ url: displayUrl, title: '', visitedAt: now });
    var withoutDup = readPreviewBrowsingHistory().filter(function (entry) { return (0, qaap_preview_url_utils_1.canonicalPreviewHistoryKey)(entry.url) !== historyKey; });
    var next = __spreadArray([
        { url: displayUrl, title: nextTitle, visitedAt: now }
    ], withoutDup, true).slice(0, MAX_ENTRIES);
    writePreviewBrowsingHistory(next);
    return next;
}
function clearPreviewBrowsingHistory() {
    writePreviewBrowsingHistory([]);
}
function readPreviewBookmarkBarVisible() {
    if (typeof window === 'undefined') {
        return false;
    }
    try {
        return window.localStorage.getItem(exports.QAAP_PREVIEW_BOOKMARK_BAR_PREF_KEY) === 'true';
    }
    catch (_a) {
        return false;
    }
}
function writePreviewBookmarkBarVisible(visible) {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(exports.QAAP_PREVIEW_BOOKMARK_BAR_PREF_KEY, visible ? 'true' : 'false');
    }
    catch (_a) {
        /* ignore */
    }
}
function groupPreviewBrowsingHistory(entries, now) {
    if (now === void 0) { now = Date.now(); }
    var startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    var todayStart = startOfToday.getTime();
    var last7Start = todayStart - 6 * 24 * 60 * 60 * 1000;
    var last30Start = todayStart - 29 * 24 * 60 * 60 * 1000;
    var today = [];
    var last7 = [];
    var last30 = [];
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var entry = entries_1[_i];
        if (entry.visitedAt >= todayStart) {
            today.push(entry);
        }
        else if (entry.visitedAt >= last7Start) {
            last7.push(entry);
        }
        else if (entry.visitedAt >= last30Start) {
            last30.push(entry);
        }
    }
    var sections = [];
    if (today.length) {
        sections.push({
            id: 'today',
            labelKey: 'qaap/preview/historyToday',
            defaultLabel: 'Today',
            entries: today,
        });
    }
    if (last7.length) {
        sections.push({
            id: 'last7',
            labelKey: 'qaap/preview/historyLast7',
            defaultLabel: 'Last 7 days',
            entries: last7,
        });
    }
    if (last30.length) {
        sections.push({
            id: 'last30',
            labelKey: 'qaap/preview/historyLast30',
            defaultLabel: 'Last 30 days',
            entries: last30,
        });
    }
    return sections;
}
function clampPreviewHistoryPanelWidth(widthPx, containerWidthPx) {
    var max = exports.QAAP_PREVIEW_HISTORY_WIDTH_MAX_PX;
    if (containerWidthPx !== undefined && containerWidthPx > 0) {
        max = Math.min(max, Math.round(containerWidthPx * 0.92));
    }
    max = Math.max(exports.QAAP_PREVIEW_HISTORY_WIDTH_MIN_PX, max);
    return Math.max(exports.QAAP_PREVIEW_HISTORY_WIDTH_MIN_PX, Math.min(max, Math.round(widthPx)));
}
function readPreviewHistoryPanelWidth(containerWidthPx) {
    if (typeof window === 'undefined') {
        return clampPreviewHistoryPanelWidth(exports.QAAP_PREVIEW_HISTORY_WIDTH_DEFAULT_PX, containerWidthPx);
    }
    try {
        var raw = window.localStorage.getItem(exports.QAAP_PREVIEW_HISTORY_WIDTH_STORAGE_KEY);
        var parsed = raw ? Number(raw) : exports.QAAP_PREVIEW_HISTORY_WIDTH_DEFAULT_PX;
        if (!Number.isFinite(parsed)) {
            return clampPreviewHistoryPanelWidth(exports.QAAP_PREVIEW_HISTORY_WIDTH_DEFAULT_PX, containerWidthPx);
        }
        return clampPreviewHistoryPanelWidth(parsed, containerWidthPx);
    }
    catch (_a) {
        return clampPreviewHistoryPanelWidth(exports.QAAP_PREVIEW_HISTORY_WIDTH_DEFAULT_PX, containerWidthPx);
    }
}
function writePreviewHistoryPanelWidth(widthPx, containerWidthPx) {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(exports.QAAP_PREVIEW_HISTORY_WIDTH_STORAGE_KEY, String(clampPreviewHistoryPanelWidth(widthPx, containerWidthPx)));
    }
    catch (_a) {
        /* ignore */
    }
}
function normalizeHistoryEntry(value) {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    var record = value;
    if (typeof record.url !== 'string' || !record.url.trim()) {
        return undefined;
    }
    var visitedAt = typeof record.visitedAt === 'number' && Number.isFinite(record.visitedAt)
        ? record.visitedAt
        : Date.now();
    var title = typeof record.title === 'string' ? record.title : '';
    return { url: record.url.trim(), title: title, visitedAt: visitedAt };
}
