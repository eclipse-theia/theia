"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QAAP_PREVIEW_OVERFLOW_MENU_Z_INDEX = void 0;
exports.previewNotify = previewNotify;
exports.buildPreviewOverflowMenuItems = buildPreviewOverflowMenuItems;
exports.runPreviewOverflowAction = runPreviewOverflowAction;
exports.mountPreviewOverflowMenu = mountPreviewOverflowMenu;
exports.captureSameOriginPreview = captureSameOriginPreview;
var nls_1 = require("@theia/core/lib/common/nls");
var qaap_preview_inspector_panel_size_1 = require("./qaap-preview-inspector-panel-size");
exports.QAAP_PREVIEW_OVERFLOW_MENU_Z_INDEX = '2147483025';
function previewNotify(ctx, message, kind) {
    var _a, _b, _c;
    if (kind === void 0) { kind = 'info'; }
    if (kind === 'warn') {
        (_a = ctx.messageService) === null || _a === void 0 ? void 0 : _a.warn(message);
    }
    else {
        (_b = ctx.messageService) === null || _b === void 0 ? void 0 : _b.info(message);
    }
    (_c = ctx.notify) === null || _c === void 0 ? void 0 : _c.call(ctx, message, kind);
}
function buildPreviewOverflowMenuItems(ctx) {
    var bookmarkVisible = ctx.bookmarkBarVisible();
    var inspectorPosition = (0, qaap_preview_inspector_panel_size_1.readPreviewInspectorPosition)();
    return [
        {
            id: 'take-screenshot',
            label: nls_1.nls.localize('qaap/preview/takeScreenshot', 'Take Screenshot'),
        },
        {
            id: 'hard-reload',
            label: nls_1.nls.localize('qaap/preview/hardReload', 'Hard Reload'),
        },
        {
            id: 'copy-url',
            label: nls_1.nls.localize('qaap/preview/copyUrl', 'Copy Current URL'),
        },
        {
            id: 'bookmark-bar',
            label: bookmarkVisible
                ? nls_1.nls.localize('qaap/preview/hideBookmarkBar', 'Hide Bookmark Bar')
                : nls_1.nls.localize('qaap/preview/showBookmarkBar', 'Show Bookmark Bar'),
            toggle: true,
            checked: bookmarkVisible,
        },
        {
            id: 'inspector-side',
            label: nls_1.nls.localize('qaap/preview/inspectorSide', 'Element Inspector beside preview'),
            toggle: true,
            checked: inspectorPosition === 'side',
        },
        {
            id: 'inspector-bottom',
            label: nls_1.nls.localize('qaap/preview/inspectorBottom', 'Element Inspector below preview'),
            toggle: true,
            checked: inspectorPosition === 'bottom',
        },
        {
            id: 'clear-history',
            label: nls_1.nls.localize('qaap/preview/clearHistory', 'Clear Browsing History'),
        },
        {
            id: 'clear-cookies',
            label: nls_1.nls.localize('qaap/preview/clearCookies', 'Clear Cookies'),
        },
        {
            id: 'clear-cache',
            label: nls_1.nls.localize('qaap/preview/clearCache', 'Clear Cache'),
        },
    ];
}
function runPreviewOverflowAction(id, ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _a = id;
                    switch (_a) {
                        case 'take-screenshot': return [3 /*break*/, 1];
                        case 'reload': return [3 /*break*/, 3];
                        case 'hard-reload': return [3 /*break*/, 4];
                        case 'copy-url': return [3 /*break*/, 5];
                        case 'open-external': return [3 /*break*/, 7];
                        case 'bookmark-bar': return [3 /*break*/, 8];
                        case 'inspector-side': return [3 /*break*/, 9];
                        case 'inspector-bottom': return [3 /*break*/, 10];
                        case 'clear-history': return [3 /*break*/, 11];
                        case 'clear-cookies': return [3 /*break*/, 12];
                        case 'clear-cache': return [3 /*break*/, 13];
                    }
                    return [3 /*break*/, 15];
                case 1: return [4 /*yield*/, runPreviewTakeScreenshot(ctx)];
                case 2:
                    _d.sent();
                    return [2 /*return*/];
                case 3:
                    ctx.reload();
                    previewNotify(ctx, nls_1.nls.localize('qaap/preview/reloaded', 'Preview reloaded'));
                    return [2 /*return*/];
                case 4:
                    ctx.hardReload();
                    previewNotify(ctx, nls_1.nls.localize('qaap/preview/hardReloaded', 'Preview hard reloaded'));
                    return [2 /*return*/];
                case 5: return [4 /*yield*/, runPreviewCopyCurrentUrl(ctx)];
                case 6:
                    _d.sent();
                    return [2 /*return*/];
                case 7:
                    ctx.openExternal();
                    return [2 /*return*/];
                case 8:
                    ctx.toggleBookmarkBar();
                    return [2 /*return*/];
                case 9:
                    (_b = ctx.setInspectorPosition) === null || _b === void 0 ? void 0 : _b.call(ctx, 'side');
                    return [2 /*return*/];
                case 10:
                    (_c = ctx.setInspectorPosition) === null || _c === void 0 ? void 0 : _c.call(ctx, 'bottom');
                    return [2 /*return*/];
                case 11:
                    ctx.clearHistory();
                    return [2 /*return*/];
                case 12:
                    clearSameOriginPreviewCookies(ctx);
                    return [2 /*return*/];
                case 13: return [4 /*yield*/, clearSameOriginPreviewCache(ctx)];
                case 14:
                    _d.sent();
                    return [2 /*return*/];
                case 15: return [2 /*return*/];
            }
        });
    });
}
/** Portal overflow menu to `document.body` with per-item click handlers (mobile-safe). */
function mountPreviewOverflowMenu(options) {
    var menu = document.createElement('div');
    menu.className = 'qaap-agent-preview-overflow-menu';
    menu.setAttribute('role', 'menu');
    var items = buildPreviewOverflowMenuItems({ bookmarkBarVisible: options.bookmarkBarVisible });
    for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
        var item = items_1[_i];
        menu.append(createPreviewOverflowMenuRow(item));
    }
    var activate = function (actionId) {
        void runPreviewOverflowAction(actionId, options.getContext()).catch(function () {
            previewNotify(options.getContext(), nls_1.nls.localize('qaap/preview/actionFailed', 'Could not run that action'), 'warn');
        });
        options.onClose();
    };
    var _loop_1 = function (row) {
        var actionId = row.getAttribute('data-action');
        if (!actionId) {
            return "continue";
        }
        var onActivate = function (e) {
            e.preventDefault();
            e.stopPropagation();
            activate(actionId);
        };
        row.addEventListener('click', onActivate);
        row.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                onActivate(e);
            }
        });
    };
    for (var _a = 0, _b = menu.querySelectorAll('[data-action]'); _a < _b.length; _a++) {
        var row = _b[_a];
        _loop_1(row);
    }
    document.body.append(menu);
    positionPreviewOverflowMenu(menu, options.anchor);
    menu.style.zIndex = exports.QAAP_PREVIEW_OVERFLOW_MENU_Z_INDEX;
    var closeOnOutside = function (e) {
        var target = e.target;
        if (menu.contains(target) || options.anchor.contains(target)) {
            return;
        }
        options.onClose();
    };
    var dispose = function () {
        document.removeEventListener('click', closeOnOutside, true);
        menu.remove();
    };
    requestAnimationFrame(function () { return document.addEventListener('click', closeOnOutside, true); });
    return { menu: menu, dispose: dispose };
}
function createPreviewOverflowMenuRow(item) {
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'qaap-agent-preview-overflow-item';
    row.setAttribute('role', 'menuitem');
    row.setAttribute('data-action', item.id);
    if (item.toggle) {
        row.classList.add('qaap-agent-preview-overflow-toggle');
        row.setAttribute('aria-checked', item.checked ? 'true' : 'false');
        var label = document.createElement('span');
        label.className = 'qaap-agent-preview-overflow-item-label';
        label.textContent = item.label;
        var toggle = document.createElement('span');
        toggle.className = 'qaap-agent-preview-overflow-toggle-switch';
        toggle.setAttribute('aria-hidden', 'true');
        row.append(label, toggle);
    }
    else {
        row.textContent = item.label;
    }
    return row;
}
function positionPreviewOverflowMenu(menu, anchor) {
    var margin = 8;
    var gap = 4;
    var anchorRect = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.visibility = 'hidden';
    menu.style.pointerEvents = 'auto';
    var menuHeight = menu.offsetHeight || 1;
    var top = anchorRect.bottom + gap;
    var maxBottom = window.innerHeight - margin;
    if (top + menuHeight > maxBottom) {
        var aboveTop = anchorRect.top - gap - menuHeight;
        top = aboveTop >= margin ? aboveTop : Math.max(margin, maxBottom - menuHeight);
    }
    var right = window.innerWidth - anchorRect.right;
    right = Math.max(margin, right);
    menu.style.top = "".concat(top, "px");
    menu.style.right = "".concat(right, "px");
    menu.style.left = 'auto';
    menu.style.visibility = '';
}
function runPreviewCopyCurrentUrl(ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var url, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    url = ctx.getCurrentUrl().trim();
                    if (!url) {
                        previewNotify(ctx, nls_1.nls.localize('qaap/preview/noUrlToCopy', 'No URL to copy'), 'warn');
                        return [2 /*return*/];
                    }
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 7, , 8]);
                    if (!ctx.clipboard) return [3 /*break*/, 3];
                    return [4 /*yield*/, ctx.clipboard.writeText(url)];
                case 2:
                    _c.sent();
                    return [3 /*break*/, 6];
                case 3:
                    if (!((_b = navigator.clipboard) === null || _b === void 0 ? void 0 : _b.writeText)) return [3 /*break*/, 5];
                    return [4 /*yield*/, navigator.clipboard.writeText(url)];
                case 4:
                    _c.sent();
                    return [3 /*break*/, 6];
                case 5: throw new Error('clipboard unavailable');
                case 6:
                    previewNotify(ctx, nls_1.nls.localize('qaap/preview/urlCopied', 'URL copied to clipboard'));
                    return [3 /*break*/, 8];
                case 7:
                    _a = _c.sent();
                    previewNotify(ctx, nls_1.nls.localize('qaap/preview/urlCopyFailed', 'Could not copy URL to clipboard'), 'warn');
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
function captureSameOriginPreview(doc, frame) {
    return __awaiter(this, void 0, void 0, function () {
        var width, height, canvas, ctx, svg, img, url;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    width = Math.max(doc.documentElement.scrollWidth, frame.clientWidth);
                    height = Math.max(doc.documentElement.scrollHeight, frame.clientHeight);
                    canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    ctx = canvas.getContext('2d');
                    if (!ctx) {
                        return [2 /*return*/, undefined];
                    }
                    svg = "\n<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"".concat(width, "\" height=\"").concat(height, "\">\n  <foreignObject width=\"100%\" height=\"100%\">\n    ").concat(new XMLSerializer().serializeToString(doc.documentElement), "\n  </foreignObject>\n</svg>");
                    img = new Image();
                    url = "data:image/svg+xml;charset=utf-8,".concat(encodeURIComponent(svg));
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            img.onload = function () { return resolve(); };
                            img.onerror = function () { return reject(new Error('svg render failed')); };
                            img.src = url;
                        })];
                case 1:
                    _a.sent();
                    ctx.drawImage(img, 0, 0);
                    return [2 /*return*/, new Promise(function (resolve) {
                            canvas.toBlob(function (blob) { return resolve(blob !== null && blob !== void 0 ? blob : undefined); }, 'image/png');
                        })];
            }
        });
    });
}
function runPreviewTakeScreenshot(ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var frame, doc, blob, url, link, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    frame = ctx.getFrame();
                    doc = frame === null || frame === void 0 ? void 0 : frame.contentDocument;
                    if (!frame || !(doc === null || doc === void 0 ? void 0 : doc.body)) {
                        previewNotify(ctx, nls_1.nls.localize('qaap/preview/screenshotUnavailable', 'Screenshots only work for same-origin previews. Open in browser to capture cross-origin pages.'), 'warn');
                        return [2 /*return*/];
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, captureSameOriginPreview(doc, frame)];
                case 2:
                    blob = _b.sent();
                    if (!blob) {
                        throw new Error('capture failed');
                    }
                    if (!(ctx.clipboard && typeof ClipboardItem !== 'undefined')) return [3 /*break*/, 4];
                    return [4 /*yield*/, navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])];
                case 3:
                    _b.sent();
                    previewNotify(ctx, nls_1.nls.localize('qaap/preview/screenshotCopied', 'Screenshot copied to clipboard'));
                    return [2 /*return*/];
                case 4:
                    url = URL.createObjectURL(blob);
                    link = document.createElement('a');
                    link.href = url;
                    link.download = 'preview-screenshot.png';
                    link.click();
                    URL.revokeObjectURL(url);
                    previewNotify(ctx, nls_1.nls.localize('qaap/preview/screenshotDownloaded', 'Screenshot downloaded'));
                    return [3 /*break*/, 6];
                case 5:
                    _a = _b.sent();
                    previewNotify(ctx, nls_1.nls.localize('qaap/preview/screenshotFailed', 'Could not capture a screenshot for this page.'), 'warn');
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function clearSameOriginPreviewCookies(ctx) {
    var _a;
    try {
        var frame = ctx.getFrame();
        var doc = frame === null || frame === void 0 ? void 0 : frame.contentDocument;
        if (!doc) {
            throw new Error('cross-origin');
        }
        var cookies = doc.cookie.split(';');
        for (var _i = 0, cookies_1 = cookies; _i < cookies_1.length; _i++) {
            var chunk = cookies_1[_i];
            var name_1 = (_a = chunk.split('=')[0]) === null || _a === void 0 ? void 0 : _a.trim();
            if (!name_1) {
                continue;
            }
            var paths = ['/', window.location.pathname].filter(Boolean);
            for (var _b = 0, paths_1 = paths; _b < paths_1.length; _b++) {
                var path = paths_1[_b];
                doc.cookie = "".concat(name_1, "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=").concat(path);
            }
            doc.cookie = "".concat(name_1, "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/");
        }
        previewNotify(ctx, nls_1.nls.localize('qaap/preview/cookiesCleared', 'Preview cookies cleared'));
        ctx.reload();
    }
    catch (_c) {
        previewNotify(ctx, nls_1.nls.localize('qaap/preview/cookiesUnavailable', 'Cookies cannot be cleared for cross-origin previews.'), 'warn');
    }
}
function clearSameOriginPreviewCache(ctx) {
    return __awaiter(this, void 0, void 0, function () {
        var frame, cleared, win, cacheStorage_1, keys, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    frame = ctx.getFrame();
                    cleared = false;
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 5, , 6]);
                    win = frame === null || frame === void 0 ? void 0 : frame.contentWindow;
                    if (!(win && 'caches' in win)) return [3 /*break*/, 4];
                    cacheStorage_1 = win.caches;
                    return [4 /*yield*/, cacheStorage_1.keys()];
                case 2:
                    keys = _b.sent();
                    return [4 /*yield*/, Promise.all(keys.map(function (key) { return cacheStorage_1.delete(key); }))];
                case 3:
                    _b.sent();
                    cleared = keys.length > 0;
                    _b.label = 4;
                case 4: return [3 /*break*/, 6];
                case 5:
                    _a = _b.sent();
                    return [3 /*break*/, 6];
                case 6:
                    ctx.hardReload();
                    previewNotify(ctx, cleared
                        ? nls_1.nls.localize('qaap/preview/cacheCleared', 'Preview cache cleared')
                        : nls_1.nls.localize('qaap/preview/cacheReloaded', 'Preview reloaded (cache API unavailable for this page)'));
                    return [2 /*return*/];
            }
        });
    });
}
