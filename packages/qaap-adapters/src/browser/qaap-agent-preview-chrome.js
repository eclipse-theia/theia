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
exports.QaapAgentPreviewChromeController = void 0;
exports.createQaapPreviewToolbarIconButton = createQaapPreviewToolbarIconButton;
exports.mountEmbeddedAgentPreviewChrome = mountEmbeddedAgentPreviewChrome;
exports.attachAgentPreviewChromeToMiniBrowserContent = attachAgentPreviewChromeToMiniBrowserContent;
var nls_1 = require("@theia/core/lib/common/nls");
var disposable_1 = require("@theia/core/lib/common/disposable");
var widget_1 = require("@theia/core/lib/browser/widgets/widget");
var mini_browser_content_1 = require("@theia/mini-browser/lib/browser/mini-browser-content");
var mini_browser_url_utils_1 = require("@theia/mini-browser/lib/browser/mini-browser-url-utils");
var qaap_agent_preview_chrome_style_1 = require("./qaap-agent-preview-chrome-style");
var qaap_preview_url_utils_1 = require("./qaap-preview-url-utils");
var qaap_preview_inline_inspector_1 = require("./qaap-preview-inline-inspector");
var qaap_preview_browsing_history_1 = require("./qaap-preview-browsing-history");
var qaap_preview_overflow_actions_1 = require("./qaap-preview-overflow-actions");
/** Cursor-style preview chrome: browsing history drawer + overflow menu. */
var QaapAgentPreviewChromeController = /** @class */ (function () {
    function QaapAgentPreviewChromeController(host, options) {
        if (options === void 0) { options = {}; }
        var _this = this;
        this.host = host;
        this.options = options;
        this.toDispose = new disposable_1.DisposableCollection();
        this.historyOpen = false;
        this.bookmarkBarVisible = (0, qaap_preview_browsing_history_1.readPreviewBookmarkBarVisible)();
        var root = host.getRoot();
        root.classList.add(qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.ROOT);
        if (options.embedded) {
            root.classList.add(qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.MOD_EMBEDDED);
        }
        else {
            root.classList.add(qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.MOD_MINI_BROWSER);
        }
        this.ensureBookmarkBar(root);
        this.ensureHistoryDrawer(root);
        this.toDispose.push(disposable_1.Disposable.create(function () {
            var _a, _b, _c;
            root.classList.remove(qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.ROOT, qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.MOD_EMBEDDED, qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.MOD_MINI_BROWSER, qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_OPEN);
            (_a = _this.historyRoot) === null || _a === void 0 ? void 0 : _a.remove();
            (_b = _this.bookmarkBar) === null || _b === void 0 ? void 0 : _b.remove();
            (_c = _this.overflowMenu) === null || _c === void 0 ? void 0 : _c.remove();
        }));
    }
    QaapAgentPreviewChromeController.prototype.dispose = function () {
        this.toDispose.dispose();
    };
    /** Toolbar buttons for mini-browser (history + overflow). */
    QaapAgentPreviewChromeController.prototype.attachToolbarControls = function (toolbar, beforeFirst) {
        var _this = this;
        var historyBtn = this.createToolbarIconButton(nls_1.nls.localize('qaap/preview/openHistory', 'Show browsing history'), 'history', qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.TOOLBAR_HISTORY);
        this.historyButton = historyBtn;
        this.toDispose.push((0, widget_1.addEventListener)(historyBtn, 'click', function () { return _this.toggleHistory(); }));
        var overflowBtn = this.createToolbarIconButton(nls_1.nls.localize('qaap/preview/moreActions', 'More preview actions'), 'kebab-vertical', qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.TOOLBAR_OVERFLOW);
        this.toDispose.push((0, widget_1.addEventListener)(overflowBtn, 'click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            _this.toggleOverflowMenu(overflowBtn);
        }));
        if (beforeFirst) {
            toolbar.insertBefore(historyBtn, beforeFirst);
            toolbar.appendChild(overflowBtn);
        }
        else {
            toolbar.insertBefore(historyBtn, toolbar.firstChild);
            toolbar.appendChild(overflowBtn);
        }
    };
    QaapAgentPreviewChromeController.prototype.recordNavigationIntent = function (url) {
        var trimmed = url.trim();
        if (!trimmed || trimmed === 'about:blank') {
            return;
        }
        (0, qaap_preview_browsing_history_1.recordPreviewBrowsingVisit)(trimmed, this.host.getPageTitle());
        this.refreshBookmarkBar();
        if (this.historyOpen) {
            this.renderHistoryList();
        }
    };
    QaapAgentPreviewChromeController.prototype.recordVisit = function () {
        var url = this.host.getCurrentUrl();
        if (!url) {
            return;
        }
        this.recordNavigationIntent(url);
    };
    QaapAgentPreviewChromeController.prototype.toggleHistory = function (open) {
        var _a;
        this.historyOpen = open !== null && open !== void 0 ? open : !this.historyOpen;
        var root = this.host.getRoot();
        root.classList.toggle(qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_OPEN, this.historyOpen);
        if (this.historyRoot) {
            this.historyRoot.hidden = !this.historyOpen;
        }
        if (this.historyOpen) {
            if (this.historyPanel) {
                this.applyHistoryPanelWidth(this.historyPanel);
            }
            this.renderHistoryList();
            (_a = this.historySearchInput) === null || _a === void 0 ? void 0 : _a.focus();
        }
    };
    QaapAgentPreviewChromeController.prototype.ensureBookmarkBar = function (root) {
        var bar = document.createElement('div');
        bar.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.BOOKMARK_BAR;
        bar.hidden = !this.bookmarkBarVisible;
        var toolbar = root.querySelector('.theia-mini-browser-toolbar, .theia-mini-browser-toolbar-read-only, .qaap-agent-preview-embedded-toolbar');
        if (toolbar === null || toolbar === void 0 ? void 0 : toolbar.parentElement) {
            toolbar.parentElement.insertBefore(bar, toolbar.nextSibling);
        }
        else {
            root.prepend(bar);
        }
        this.bookmarkBar = bar;
        this.refreshBookmarkBar();
    };
    QaapAgentPreviewChromeController.prototype.refreshBookmarkBar = function () {
        var _this = this;
        if (!this.bookmarkBar) {
            return;
        }
        this.bookmarkBar.replaceChildren();
        if (!this.bookmarkBarVisible) {
            return;
        }
        var seen = new Set();
        var _loop_1 = function (entry) {
            if (seen.has(entry.url)) {
                return "continue";
            }
            seen.add(entry.url);
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.BOOKMARK_ITEM;
            btn.title = entry.url;
            btn.textContent = (0, qaap_preview_browsing_history_1.previewHistoryEntryLabel)(entry);
            this_1.toDispose.push((0, widget_1.addEventListener)(btn, 'click', function () {
                void _this.host.navigate(entry.url);
                _this.toggleHistory(false);
            }));
            this_1.bookmarkBar.appendChild(btn);
            if (seen.size >= 8) {
                return "break";
            }
        };
        var this_1 = this;
        for (var _i = 0, _a = (0, qaap_preview_browsing_history_1.readPreviewBrowsingHistory)(); _i < _a.length; _i++) {
            var entry = _a[_i];
            var state_1 = _loop_1(entry);
            if (state_1 === "break")
                break;
        }
    };
    QaapAgentPreviewChromeController.prototype.ensureHistoryDrawer = function (root) {
        var _this = this;
        var historyRoot = document.createElement('div');
        historyRoot.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY;
        historyRoot.hidden = true;
        var backdrop = document.createElement('button');
        backdrop.type = 'button';
        backdrop.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_BACKDROP;
        backdrop.setAttribute('aria-label', nls_1.nls.localize('qaap/preview/closeHistory', 'Close history'));
        this.toDispose.push((0, widget_1.addEventListener)(backdrop, 'click', function () { return _this.toggleHistory(false); }));
        var panel = document.createElement('aside');
        panel.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_PANEL;
        panel.setAttribute('role', 'navigation');
        panel.setAttribute('aria-label', nls_1.nls.localize('qaap/preview/historyTitle', 'Browsing history'));
        this.applyHistoryPanelWidth(panel);
        var panelBody = document.createElement('div');
        panelBody.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_PANEL_BODY;
        var search = document.createElement('input');
        search.type = 'search';
        search.className = "".concat(qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_SEARCH, " theia-input");
        search.placeholder = nls_1.nls.localize('qaap/preview/historySearch', 'Search');
        search.spellcheck = false;
        this.historySearchInput = search;
        this.toDispose.push((0, widget_1.addEventListener)(search, 'input', function () { return _this.renderHistoryList(); }));
        var list = document.createElement('div');
        list.className = 'qaap-agent-preview-history-list';
        this.historyList = list;
        panelBody.append(search, list);
        var resizeHandle = document.createElement('div');
        resizeHandle.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_RESIZE_HANDLE;
        resizeHandle.setAttribute('role', 'separator');
        resizeHandle.setAttribute('aria-orientation', 'vertical');
        resizeHandle.setAttribute('aria-label', nls_1.nls.localize('qaap/preview/resizeHistory', 'Resize browsing history panel'));
        resizeHandle.tabIndex = 0;
        this.installHistoryPanelResize(panel, resizeHandle);
        panel.append(panelBody, resizeHandle);
        this.toDispose.push((0, widget_1.addEventListener)(panel, 'pointerdown', function (e) { return e.stopPropagation(); }));
        historyRoot.append(backdrop, panel);
        this.historyPanel = panel;
        var contentAnchor = root.querySelector('.theia-mini-browser-content-area, .qaap-agent-preview-embedded-body');
        if (contentAnchor instanceof HTMLElement) {
            contentAnchor.appendChild(historyRoot);
        }
        else {
            root.appendChild(historyRoot);
        }
        this.historyRoot = historyRoot;
        var onKey = function (e) {
            if (e.key === 'Escape' && _this.historyOpen) {
                _this.toggleHistory(false);
            }
        };
        window.addEventListener('keydown', onKey);
        this.toDispose.push(disposable_1.Disposable.create(function () { return window.removeEventListener('keydown', onKey); }));
    };
    QaapAgentPreviewChromeController.prototype.historyPanelContainerWidth = function () {
        var _a;
        var anchor = (_a = this.historyRoot) === null || _a === void 0 ? void 0 : _a.parentElement;
        return anchor === null || anchor === void 0 ? void 0 : anchor.clientWidth;
    };
    QaapAgentPreviewChromeController.prototype.applyHistoryPanelWidth = function (panel, widthPx) {
        var containerWidth = this.historyPanelContainerWidth();
        var width = widthPx !== undefined
            ? (0, qaap_preview_browsing_history_1.clampPreviewHistoryPanelWidth)(widthPx, containerWidth)
            : (0, qaap_preview_browsing_history_1.readPreviewHistoryPanelWidth)(containerWidth);
        panel.style.width = "".concat(width, "px");
        panel.style.maxWidth = 'none';
    };
    QaapAgentPreviewChromeController.prototype.installHistoryPanelResize = function (panel, handle) {
        var _this = this;
        var dragStartX = 0;
        var dragStartWidth = 0;
        var stopDrag = function (e) {
            if (_this.historyResizePointerId === undefined || e.pointerId !== _this.historyResizePointerId) {
                return;
            }
            try {
                handle.releasePointerCapture(e.pointerId);
            }
            catch (_a) {
                /* already released */
            }
            _this.historyResizePointerId = undefined;
            document.body.classList.remove(qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_RESIZING);
            (0, qaap_preview_browsing_history_1.writePreviewHistoryPanelWidth)(panel.getBoundingClientRect().width, _this.historyPanelContainerWidth());
        };
        var onPointerMove = function (e) {
            if (_this.historyResizePointerId === undefined || e.pointerId !== _this.historyResizePointerId) {
                return;
            }
            var delta = e.clientX - dragStartX;
            _this.applyHistoryPanelWidth(panel, dragStartWidth + delta);
        };
        this.toDispose.push((0, widget_1.addEventListener)(handle, 'pointerdown', function (e) {
            if (e.button !== 0) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            dragStartX = e.clientX;
            dragStartWidth = panel.getBoundingClientRect().width;
            _this.historyResizePointerId = e.pointerId;
            handle.setPointerCapture(e.pointerId);
            document.body.classList.add(qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_RESIZING);
        }));
        this.toDispose.push((0, widget_1.addEventListener)(handle, 'pointermove', onPointerMove));
        this.toDispose.push((0, widget_1.addEventListener)(handle, 'pointerup', stopDrag));
        this.toDispose.push((0, widget_1.addEventListener)(handle, 'pointercancel', stopDrag));
        this.toDispose.push((0, widget_1.addEventListener)(handle, 'lostpointercapture', function () {
            if (_this.historyResizePointerId === undefined) {
                return;
            }
            _this.historyResizePointerId = undefined;
            document.body.classList.remove(qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_RESIZING);
            (0, qaap_preview_browsing_history_1.writePreviewHistoryPanelWidth)(panel.getBoundingClientRect().width, _this.historyPanelContainerWidth());
        }));
        this.toDispose.push((0, widget_1.addEventListener)(handle, 'keydown', function (e) {
            var step = e.shiftKey ? 32 : 16;
            var containerWidth = _this.historyPanelContainerWidth();
            var current = panel.getBoundingClientRect().width;
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                _this.applyHistoryPanelWidth(panel, current + step);
                (0, qaap_preview_browsing_history_1.writePreviewHistoryPanelWidth)(panel.getBoundingClientRect().width, containerWidth);
            }
            else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                _this.applyHistoryPanelWidth(panel, current - step);
                (0, qaap_preview_browsing_history_1.writePreviewHistoryPanelWidth)(panel.getBoundingClientRect().width, containerWidth);
            }
        }));
    };
    QaapAgentPreviewChromeController.prototype.renderHistoryList = function () {
        var _a, _b;
        if (!this.historyList || !this.historyRoot) {
            return;
        }
        this.historyRoot.hidden = !this.historyOpen;
        var query = (_b = (_a = this.historySearchInput) === null || _a === void 0 ? void 0 : _a.value.trim().toLowerCase()) !== null && _b !== void 0 ? _b : '';
        var entries = (0, qaap_preview_browsing_history_1.readPreviewBrowsingHistory)().filter(function (entry) {
            if (!query) {
                return true;
            }
            var label = (0, qaap_preview_browsing_history_1.previewHistoryEntryLabel)(entry).toLowerCase();
            return label.includes(query) || entry.url.toLowerCase().includes(query);
        });
        this.historyList.replaceChildren();
        var sections = (0, qaap_preview_browsing_history_1.groupPreviewBrowsingHistory)(entries);
        if (!sections.length) {
            var empty = document.createElement('div');
            empty.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_EMPTY;
            empty.textContent = nls_1.nls.localize('qaap/preview/historyEmpty', 'No pages visited yet.');
            this.historyList.append(empty);
            return;
        }
        for (var _i = 0, sections_1 = sections; _i < sections_1.length; _i++) {
            var section = sections_1[_i];
            var sectionEl = document.createElement('section');
            sectionEl.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_SECTION;
            var title = document.createElement('div');
            title.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_SECTION_TITLE;
            title.textContent = nls_1.nls.localize(section.labelKey, section.defaultLabel);
            sectionEl.append(title);
            for (var _c = 0, _d = section.entries; _c < _d.length; _c++) {
                var entry = _d[_c];
                sectionEl.append(this.createHistoryItem(entry));
            }
            this.historyList.append(sectionEl);
        }
    };
    QaapAgentPreviewChromeController.prototype.createHistoryItem = function (entry) {
        var _this = this;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_ITEM;
        var icon = document.createElement('img');
        icon.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_ITEM_ICON;
        icon.alt = '';
        icon.loading = 'lazy';
        var favicon = (0, qaap_preview_browsing_history_1.faviconUrlForPreview)(entry.url);
        if (favicon) {
            icon.src = favicon;
        }
        else {
            icon.hidden = true;
        }
        var label = document.createElement('span');
        label.className = qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.HISTORY_ITEM_LABEL;
        label.textContent = (0, qaap_preview_browsing_history_1.previewHistoryEntryLabel)(entry);
        btn.append(icon, label);
        this.toDispose.push((0, widget_1.addEventListener)(btn, 'click', function () {
            void _this.host.navigate(entry.url);
            _this.toggleHistory(false);
        }));
        return btn;
    };
    QaapAgentPreviewChromeController.prototype.toggleOverflowMenu = function (anchor) {
        var _this = this;
        if (this.overflowMenu) {
            this.closeOverflowMenu();
            return;
        }
        var mounted = (0, qaap_preview_overflow_actions_1.mountPreviewOverflowMenu)({
            anchor: anchor,
            bookmarkBarVisible: function () { return _this.bookmarkBarVisible; },
            getContext: function () { return _this.createOverflowActionContext(); },
            onClose: function () { return _this.closeOverflowMenu(); },
        });
        this.overflowMenu = mounted.menu;
        this.overflowMenuDispose = mounted.dispose;
    };
    QaapAgentPreviewChromeController.prototype.createOverflowActionContext = function () {
        var _this = this;
        return {
            getFrame: function () { return _this.host.getFrame(); },
            getCurrentUrl: function () { return _this.host.getCurrentUrl(); },
            reload: function () { return _this.host.reload(); },
            hardReload: function () { return _this.host.hardReload(); },
            openExternal: function () { return _this.host.openExternal(); },
            copyCurrentUrl: function () { return _this.host.copyCurrentUrl(); },
            clipboard: this.options.clipboard,
            messageService: this.options.messageService,
            notify: this.options.notify,
            bookmarkBarVisible: function () { return _this.bookmarkBarVisible; },
            toggleBookmarkBar: function () { return _this.toggleBookmarkBar(); },
            setInspectorPosition: this.host.setInspectorPosition
                ? function (position) { var _a, _b; return (_b = (_a = _this.host).setInspectorPosition) === null || _b === void 0 ? void 0 : _b.call(_a, position); }
                : undefined,
            clearHistory: function () { return _this.clearHistory(); },
        };
    };
    QaapAgentPreviewChromeController.prototype.closeOverflowMenu = function () {
        var _a;
        (_a = this.overflowMenuDispose) === null || _a === void 0 ? void 0 : _a.call(this);
        this.overflowMenuDispose = undefined;
        this.overflowMenu = undefined;
    };
    QaapAgentPreviewChromeController.prototype.toggleBookmarkBar = function () {
        this.bookmarkBarVisible = !this.bookmarkBarVisible;
        (0, qaap_preview_browsing_history_1.writePreviewBookmarkBarVisible)(this.bookmarkBarVisible);
        if (this.bookmarkBar) {
            this.bookmarkBar.hidden = !this.bookmarkBarVisible;
        }
        this.refreshBookmarkBar();
        (0, qaap_preview_overflow_actions_1.previewNotify)({ messageService: this.options.messageService, notify: this.options.notify }, this.bookmarkBarVisible
            ? nls_1.nls.localize('qaap/preview/bookmarkBarOn', 'Bookmark bar shown')
            : nls_1.nls.localize('qaap/preview/bookmarkBarOff', 'Bookmark bar hidden'));
    };
    QaapAgentPreviewChromeController.prototype.clearHistory = function () {
        (0, qaap_preview_browsing_history_1.clearPreviewBrowsingHistory)();
        this.renderHistoryList();
        this.refreshBookmarkBar();
        (0, qaap_preview_overflow_actions_1.previewNotify)({ messageService: this.options.messageService, notify: this.options.notify }, nls_1.nls.localize('qaap/preview/historyCleared', 'Browsing history cleared'));
    };
    QaapAgentPreviewChromeController.prototype.createToolbarIconButton = function (title, icon, className) {
        return createQaapPreviewToolbarIconButton(title, icon, className);
    };
    return QaapAgentPreviewChromeController;
}());
exports.QaapAgentPreviewChromeController = QaapAgentPreviewChromeController;
/** Icon toolbar control matching Qaap preview chrome (codicon, hover pill). */
function createQaapPreviewToolbarIconButton(title, icon, className) {
    var _a;
    var button = document.createElement('button');
    button.type = 'button';
    button.title = title;
    (_a = button.classList).add.apply(_a, __spreadArray([className], (0, widget_1.codiconArray)(icon), false));
    return button;
}
/** Full preview chrome for embedded hosts (e.g. mobile transcript Preview tab). */
function mountEmbeddedAgentPreviewChrome(host, options) {
    var _a, _b, _c, _d;
    var _this = this;
    var disposables = new disposable_1.DisposableCollection();
    var root = document.createElement('div');
    root.className = 'qaap-agent-preview-embedded';
    host.replaceChildren(root);
    var toolbar = document.createElement('div');
    toolbar.className = 'qaap-agent-preview-embedded-toolbar theia-mini-browser-toolbar';
    var refreshBtn = createQaapPreviewToolbarIconButton(nls_1.nls.localize('theia/mini-browser/reload', 'Reload'), 'refresh', qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.TOOLBAR_REFRESH);
    toolbar.append(refreshBtn);
    var urlField = document.createElement('div');
    urlField.className = 'theia-mini-browser-url-field';
    var urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'theia-input';
    urlInput.spellcheck = false;
    urlInput.readOnly = !!options.readOnlyUrl;
    urlField.append(urlInput);
    var goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.className = 'theia-mini-browser-url-field-go';
    goBtn.textContent = nls_1.nls.localize('theia/mini-browser/go', 'Go');
    if (!options.readOnlyUrl) {
        urlField.append(goBtn);
    }
    var body = document.createElement('div');
    body.className = 'theia-mini-browser-content-area qaap-agent-preview-embedded-body qaap-preview-content-area';
    var split = document.createElement('div');
    split.className = 'qaap-preview-split';
    var frameSlot = document.createElement('div');
    frameSlot.className = 'qaap-preview-frame-slot';
    var inspectorSlot = document.createElement('aside');
    inspectorSlot.className = 'qaap-preview-inspector-slot';
    var frame = document.createElement('iframe');
    var sandbox = (mini_browser_content_1.MiniBrowserProps.SandboxOptions.DEFAULT).map(function (name) { return mini_browser_content_1.MiniBrowserProps.SandboxOptions[name]; });
    (_a = frame.sandbox).add.apply(_a, sandbox);
    frameSlot.append(frame);
    split.append(frameSlot, inspectorSlot);
    body.append(split);
    (0, qaap_preview_inline_inspector_1.wirePreviewInspectorResize)(split, inspectorSlot, disposables);
    var surfaceHandle;
    if (options.previewSurfaces) {
        surfaceHandle = options.previewSurfaces.registerEmbedded(frame, disposables);
    }
    var workbench = document.createElement('div');
    workbench.className = 'theia-mini-browser-workbench-controls';
    var openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.title = nls_1.nls.localize('theia/mini-browser/openInNewBrowserTab', 'Open in New Browser Tab');
    (_b = openBtn.classList).add.apply(_b, __spreadArray(['theia-mini-browser-workbench-button', 'theia-mini-browser-open'], (0, widget_1.codiconArray)('link-external'), false));
    workbench.append(openBtn);
    var pickHandler = function () {
        var _a;
        if (surfaceHandle) {
            surfaceHandle.picker.startElementPicker();
            return;
        }
        (_a = options.onPickElement) === null || _a === void 0 ? void 0 : _a.call(options);
    };
    var inspectorHandler = function () {
        var _a;
        if (surfaceHandle) {
            void surfaceHandle.picker.openElementInspector();
            return;
        }
        (_a = options.onToggleInspector) === null || _a === void 0 ? void 0 : _a.call(options);
    };
    var inlineInspector;
    if (options.inspectorDeps) {
        inlineInspector = new qaap_preview_inline_inspector_1.QaapPreviewInlineInspector(inspectorSlot, {
            service: options.inspectorDeps.service,
            commands: options.inspectorDeps.commands,
            messageService: options.messageService,
            toDispose: disposables,
        });
        surfaceHandle === null || surfaceHandle === void 0 ? void 0 : surfaceHandle.picker.connectInlineInspector(inlineInspector);
    }
    var pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.title = nls_1.nls.localize('theia/mini-browser/pickElement', 'Pick an element to send to chat');
    (_c = pickBtn.classList).add.apply(_c, __spreadArray(['theia-mini-browser-workbench-button'], (0, widget_1.codiconArray)('inspect'), false));
    disposables.push((0, widget_1.addEventListener)(pickBtn, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        pickHandler();
    }));
    workbench.append(pickBtn);
    var inspectorBtn = document.createElement('button');
    inspectorBtn.type = 'button';
    inspectorBtn.title = nls_1.nls.localize('theia/mini-browser/toggleElementInspector', 'Toggle Element Inspector');
    (_d = inspectorBtn.classList).add.apply(_d, __spreadArray(['theia-mini-browser-workbench-button'], (0, widget_1.codiconArray)('layout-panel'), false));
    inlineInspector === null || inlineInspector === void 0 ? void 0 : inlineInspector.bindToggleButton(inspectorBtn);
    disposables.push((0, widget_1.addEventListener)(inspectorBtn, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        inspectorHandler();
    }));
    workbench.append(inspectorBtn);
    toolbar.append(urlField, workbench);
    root.append(toolbar, body);
    var currentUrl = normalizePreviewNavigateUrl(options.url);
    var previewController;
    var adapter = {
        getRoot: function () { return root; },
        getFrame: function () { return frame; },
        getCurrentUrl: function () { return currentUrl; },
        getPageTitle: function () {
            var _a;
            try {
                return ((_a = frame.contentDocument) === null || _a === void 0 ? void 0 : _a.title) || undefined;
            }
            catch (_b) {
                return undefined;
            }
        },
        navigate: function (url, navOptions) {
            var _a;
            var next = normalizePreviewNavigateUrl(url);
            currentUrl = next;
            urlInput.value = next;
            if (navOptions === null || navOptions === void 0 ? void 0 : navOptions.hard) {
                var bust = next.includes('?') ? "".concat(next, "&_qaap_cache_bust=").concat(Date.now()) : "".concat(next, "?_qaap_cache_bust=").concat(Date.now());
                frame.src = bust;
            }
            else {
                frame.src = next;
            }
            previewController === null || previewController === void 0 ? void 0 : previewController.recordNavigationIntent(url);
            (_a = options.onNavigate) === null || _a === void 0 ? void 0 : _a.call(options, next);
        },
        reload: function () {
            var _a;
            try {
                (_a = frame.contentWindow) === null || _a === void 0 ? void 0 : _a.location.reload();
            }
            catch (_b) {
                frame.src = currentUrl;
            }
        },
        hardReload: function () {
            var _a;
            var url = currentUrl.trim();
            if (!url) {
                (0, qaap_preview_overflow_actions_1.previewNotify)({ messageService: options.messageService, notify: options.notify }, nls_1.nls.localize('qaap/preview/noUrlToReload', 'No URL loaded'), 'warn');
                return;
            }
            var bust = url.includes('?')
                ? "".concat(url, "&_qaap_cache_bust=").concat(Date.now())
                : "".concat(url, "?_qaap_cache_bust=").concat(Date.now());
            try {
                (_a = frame.contentWindow) === null || _a === void 0 ? void 0 : _a.location.replace(bust);
            }
            catch (_b) {
                frame.src = bust;
            }
        },
        openExternal: function () {
            var target = currentUrl;
            if (options.openExternal) {
                options.openExternal(target);
            }
            else {
                window.open(target, '_blank', 'noopener,noreferrer');
            }
        },
        copyCurrentUrl: function () { return __awaiter(_this, void 0, void 0, function () {
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!options.clipboard) return [3 /*break*/, 2];
                        return [4 /*yield*/, options.clipboard.writeText(currentUrl)];
                    case 1:
                        _c.sent();
                        return [3 /*break*/, 4];
                    case 2:
                        if (!((_a = navigator.clipboard) === null || _a === void 0 ? void 0 : _a.writeText)) return [3 /*break*/, 4];
                        return [4 /*yield*/, navigator.clipboard.writeText(currentUrl)];
                    case 3:
                        _c.sent();
                        _c.label = 4;
                    case 4:
                        (_b = options.messageService) === null || _b === void 0 ? void 0 : _b.info(nls_1.nls.localize('qaap/preview/urlCopied', 'URL copied to clipboard'));
                        return [2 /*return*/];
                }
            });
        }); },
        onPickElement: pickHandler,
        onToggleInspector: inspectorHandler,
        setInspectorPosition: function (position) { return (0, qaap_preview_inline_inspector_1.setPreviewInspectorPosition)(split, inspectorSlot, position); },
    };
    var controller = new QaapAgentPreviewChromeController(adapter, {
        clipboard: options.clipboard,
        messageService: options.messageService,
        notify: options.notify,
        embedded: true,
    });
    previewController = controller;
    controller.attachToolbarControls(toolbar, refreshBtn);
    disposables.push(controller);
    disposables.push((0, widget_1.addEventListener)(refreshBtn, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        adapter.reload();
    }));
    disposables.push((0, widget_1.addEventListener)(openBtn, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        adapter.openExternal();
    }));
    disposables.push((0, widget_1.addEventListener)(goBtn, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        void adapter.navigate(urlInput.value);
    }));
    disposables.push((0, widget_1.addEventListener)(urlInput, 'keydown', function (e) {
        if (e.key === 'Enter') {
            void adapter.navigate(urlInput.value);
        }
    }));
    disposables.push((0, widget_1.addEventListener)(frame, 'load', function () {
        var _a;
        try {
            var href = (_a = frame.contentWindow) === null || _a === void 0 ? void 0 : _a.location.href;
            if (href && href !== 'about:blank') {
                currentUrl = href;
                urlInput.value = href;
            }
        }
        catch (_b) {
            /* cross-origin */
        }
        surfaceHandle === null || surfaceHandle === void 0 ? void 0 : surfaceHandle.picker.onFrameLoad();
        controller.recordVisit();
    }));
    var api = {
        root: root,
        frame: frame,
        controller: controller,
        setUrl: function (url) {
            void adapter.navigate(url);
        },
        navigate: function (url) { return adapter.navigate(url); },
        reload: function () { return adapter.reload(); },
        dispose: function () {
            disposables.dispose();
            host.replaceChildren();
        },
    };
    api.setUrl(options.url);
    return api;
}
function normalizePreviewNavigateUrl(url) {
    var opened = (0, mini_browser_url_utils_1.normalizeMiniBrowserOpenUrl)(url) || url;
    return (0, qaap_preview_url_utils_1.normalizePreviewUrlForSameOrigin)(opened);
}
function attachAgentPreviewChromeToMiniBrowserContent(content, deps) {
    var _this = this;
    var previewController;
    var host = {
        getRoot: function () { return content.node; },
        getFrame: function () { return content.frame; },
        getCurrentUrl: function () { return content.frameSrc() || content.input.value || ''; },
        getPageTitle: function () {
            var _a;
            try {
                return ((_a = content.frame.contentDocument) === null || _a === void 0 ? void 0 : _a.title) || undefined;
            }
            catch (_b) {
                return undefined;
            }
        },
        navigate: function (url, options) {
            var normalized = (0, mini_browser_url_utils_1.normalizeMiniBrowserOpenUrl)(url) || url;
            previewController === null || previewController === void 0 ? void 0 : previewController.recordNavigationIntent(url);
            if (options === null || options === void 0 ? void 0 : options.hard) {
                var bust = normalized.includes('?')
                    ? "".concat(normalized, "&_qaap_cache_bust=").concat(Date.now())
                    : "".concat(normalized, "?_qaap_cache_bust=").concat(Date.now());
                return content.go(bust, { preserveFocus: false });
            }
            return content.go(normalized, { preserveFocus: false });
        },
        reload: function () { return content.handleRefresh(); },
        hardReload: function () {
            var current = content.frameSrc() || content.input.value;
            if (current) {
                void host.navigate(current, { hard: true });
            }
            else {
                content.handleRefresh();
            }
        },
        openExternal: function () { return content.handleOpen(); },
        copyCurrentUrl: function () { return __awaiter(_this, void 0, void 0, function () {
            var url;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = host.getCurrentUrl();
                        if (!url) return [3 /*break*/, 2];
                        return [4 /*yield*/, deps.clipboard.writeText(url)];
                    case 1:
                        _a.sent();
                        deps.messageService.info(nls_1.nls.localize('qaap/preview/urlCopied', 'URL copied to clipboard'));
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        }); },
        onPickElement: function () { return content.startElementPicker(); },
        onToggleInspector: deps.inspectorToggleCommandId && content.commands
            ? function () {
                var id = deps.inspectorToggleCommandId;
                if (content.commands.isEnabled(id)) {
                    void content.commands.executeCommand(id).catch(function () { return undefined; });
                }
            }
            : undefined,
    };
    var controller = new QaapAgentPreviewChromeController(host, {
        clipboard: deps.clipboard,
        messageService: deps.messageService,
    });
    previewController = controller;
    var toolbar = content.node.querySelector('.theia-mini-browser-toolbar, .theia-mini-browser-toolbar-read-only');
    if (toolbar instanceof HTMLElement) {
        var firstNav = toolbar.querySelector('.theia-mini-browser-previous');
        controller.attachToolbarControls(toolbar, firstNav instanceof HTMLElement ? firstNav : undefined);
    }
    return controller;
}
