"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
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
exports.QaapMiniBrowserContent = void 0;
var inversify_1 = require("@theia/core/shared/inversify");
var command_1 = require("@theia/core/lib/common/command");
var nls_1 = require("@theia/core/lib/common/nls");
var uri_1 = require("@theia/core/lib/common/uri");
var debounce = require("@theia/core/shared/lodash.debounce");
var widget_1 = require("@theia/core/lib/browser/widgets/widget");
var clipboard_service_1 = require("@theia/core/lib/browser/clipboard-service");
var message_service_1 = require("@theia/core/lib/common/message-service");
var mini_browser_content_1 = require("@theia/mini-browser/lib/browser/mini-browser-content");
var mini_browser_content_style_1 = require("@theia/mini-browser/lib/browser/mini-browser-content-style");
var qaap_mini_browser_content_style_1 = require("./qaap-mini-browser-content-style");
var qaap_mini_browser_defaults_1 = require("./qaap-mini-browser-defaults");
var qaap_agent_preview_chrome_1 = require("./qaap-agent-preview-chrome");
var qaap_agent_preview_chrome_style_1 = require("./qaap-agent-preview-chrome-style");
var qaap_preview_surface_registry_1 = require("./qaap-preview-surface-registry");
var qaap_preview_frame_picker_1 = require("./qaap-preview-frame-picker");
var qaap_preview_inline_inspector_1 = require("./qaap-preview-inline-inspector");
var qaap_preview_url_utils_1 = require("./qaap-preview-url-utils");
var element_inspector_service_1 = require("@theia/qaap-element-inspector/lib/browser/element-inspector-service");
/**
 * Qaap mini-browser preview: element inspector, workbench toolbar, read-only URL editing.
 */
var QaapMiniBrowserContent = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _classSuper = mini_browser_content_1.MiniBrowserContent;
    var _instanceExtraInitializers = [];
    var _clipboard_decorators;
    var _clipboard_initializers = [];
    var _clipboard_extraInitializers = [];
    var _messageService_decorators;
    var _messageService_initializers = [];
    var _messageService_extraInitializers = [];
    var _previewSurfaces_decorators;
    var _previewSurfaces_initializers = [];
    var _previewSurfaces_extraInitializers = [];
    var _pickerFactory_decorators;
    var _pickerFactory_initializers = [];
    var _pickerFactory_extraInitializers = [];
    var _elementInspectorService_decorators;
    var _elementInspectorService_initializers = [];
    var _elementInspectorService_extraInitializers = [];
    var _commandRegistry_decorators;
    var _commandRegistry_initializers = [];
    var _commandRegistry_extraInitializers = [];
    var _init_decorators;
    var QaapMiniBrowserContent = _classThis = /** @class */ (function (_super) {
        __extends(QaapMiniBrowserContent_1, _super);
        function QaapMiniBrowserContent_1() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.clipboard = (__runInitializers(_this, _instanceExtraInitializers), __runInitializers(_this, _clipboard_initializers, void 0));
            _this.messageService = (__runInitializers(_this, _clipboard_extraInitializers), __runInitializers(_this, _messageService_initializers, void 0));
            _this.previewSurfaces = (__runInitializers(_this, _messageService_extraInitializers), __runInitializers(_this, _previewSurfaces_initializers, void 0));
            _this.pickerFactory = (__runInitializers(_this, _previewSurfaces_extraInitializers), __runInitializers(_this, _pickerFactory_initializers, void 0));
            _this.elementInspectorService = (__runInitializers(_this, _pickerFactory_extraInitializers), __runInitializers(_this, _elementInspectorService_initializers, void 0));
            _this.commandRegistry = (__runInitializers(_this, _elementInspectorService_extraInitializers), __runInitializers(_this, _commandRegistry_initializers, void 0));
            _this.previewChrome = __runInitializers(_this, _commandRegistry_extraInitializers);
            return _this;
        }
        Object.defineProperty(QaapMiniBrowserContent_1.prototype, "previewFrame", {
            get: function () {
                return this.frame;
            },
            enumerable: false,
            configurable: true
        });
        QaapMiniBrowserContent_1.prototype.getPreviewFramePicker = function () {
            return this.ensureFramePicker();
        };
        QaapMiniBrowserContent_1.prototype.init = function () {
            var _this = this;
            this.toDispose.push(this.mouseTracker.onMousedown(function () {
                if (_this.frame.style.display !== 'none') {
                    _this.transparentOverlay.style.display = 'block';
                }
            }));
            this.toDispose.push(this.mouseTracker.onMouseup(function () {
                if (_this.frame.style.display !== 'none') {
                    _this.transparentOverlay.style.display = 'none';
                }
            }));
            var startPage = this.effectiveStartPage();
            if (startPage) {
                void this.listenOnContentChange(startPage);
                void this.go(startPage);
            }
            else {
                this.setInput(qaap_mini_browser_defaults_1.QAAP_DEFAULT_PREVIEW_INPUT_URL);
            }
            this.ensureFramePicker();
        };
        QaapMiniBrowserContent_1.prototype.ensureFramePicker = function () {
            if (!this.framePicker) {
                this.framePicker = this.pickerFactory.create(this.frame, this.toDispose);
                if (this.inlineInspector) {
                    this.framePicker.connectInlineInspector(this.inlineInspector);
                }
            }
            return this.framePicker;
        };
        QaapMiniBrowserContent_1.prototype.ensureInlineInspector = function (inspectorSlot) {
            if (this.inlineInspector) {
                return;
            }
            this.inlineInspector = new qaap_preview_inline_inspector_1.QaapPreviewInlineInspector(inspectorSlot, {
                service: this.elementInspectorService,
                commands: this.commandRegistry,
                messageService: this.messageService,
                toDispose: this.toDispose,
            });
            if (this.inspectorToggleButton) {
                this.inlineInspector.bindToggleButton(this.inspectorToggleButton);
            }
            this.ensureFramePicker().connectInlineInspector(this.inlineInspector);
        };
        QaapMiniBrowserContent_1.prototype.createContentArea = function (parent) {
            var contentArea = _super.prototype.createContentArea.call(this, parent);
            contentArea.classList.add('qaap-preview-content-area');
            var split = document.createElement('div');
            split.className = 'qaap-preview-split';
            var frameSlot = document.createElement('div');
            frameSlot.className = 'qaap-preview-frame-slot';
            var inspectorSlot = document.createElement('aside');
            inspectorSlot.className = 'qaap-preview-inspector-slot';
            contentArea.insertBefore(split, this.frame);
            frameSlot.append(this.frame);
            if (this.transparentOverlay.parentElement === contentArea) {
                frameSlot.append(this.transparentOverlay);
            }
            var loadIndicator = contentArea.querySelector(".".concat(mini_browser_content_style_1.MiniBrowserContentStyle.PRE_LOAD));
            if (loadIndicator instanceof HTMLElement && loadIndicator.parentElement === contentArea) {
                frameSlot.insertBefore(loadIndicator, this.frame);
            }
            split.append(frameSlot, inspectorSlot);
            (0, qaap_preview_inline_inspector_1.wirePreviewInspectorResize)(split, inspectorSlot, this.toDispose);
            this.ensureInlineInspector(inspectorSlot);
            return contentArea;
        };
        QaapMiniBrowserContent_1.prototype.go = function (location, options) {
            var _a;
            var normalized = (0, qaap_preview_url_utils_1.normalizePreviewUrlForSameOrigin)(location);
            var result = _super.prototype.go.call(this, normalized, options);
            (_a = this.previewChrome) === null || _a === void 0 ? void 0 : _a.recordNavigationIntent(location);
            return result;
        };
        QaapMiniBrowserContent_1.prototype.effectiveStartPage = function () {
            var _a;
            var raw = (_a = this.props.startPage) === null || _a === void 0 ? void 0 : _a.trim();
            if (!raw || (0, qaap_mini_browser_defaults_1.isMiniBrowserPreviewPlaceholderUrl)(raw)) {
                return undefined;
            }
            return raw;
        };
        QaapMiniBrowserContent_1.prototype.onAfterAttach = function (msg) {
            var _this = this;
            _super.prototype.onAfterAttach.call(this, msg);
            if (!this.surfaceHandle) {
                this.surfaceHandle = this.previewSurfaces.registerMiniBrowserContent(this, this.toDispose);
            }
            var url = this.effectiveStartPage();
            if (!url) {
                return;
            }
            queueMicrotask(function () {
                var src = _this.frame.src || '';
                var blankish = !src || src === 'about:blank';
                if (blankish) {
                    void _this.go(url);
                }
            });
        };
        QaapMiniBrowserContent_1.prototype.listenOnContentChange = function (location) {
            return __awaiter(this, void 0, void 0, function () {
                var fileUri_1, watcher, onFileChange, _a;
                var _this = this;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, this.fileService.exists(new uri_1.default(location))];
                        case 1:
                            if (_b.sent()) {
                                fileUri_1 = new uri_1.default(location);
                                watcher = this.fileService.watch(fileUri_1);
                                this.toDispose.push(watcher);
                                onFileChange = function (event) {
                                    if (event.contains(fileUri_1, 1 /* FileChangeType.ADDED */) || event.contains(fileUri_1, 0 /* FileChangeType.UPDATED */)) {
                                        _this.go(location, {
                                            showLoadIndicator: false
                                        });
                                    }
                                };
                                this.toDispose.push(this.fileService.onDidFilesChange(debounce(onFileChange, 500)));
                            }
                            return [3 /*break*/, 3];
                        case 2:
                            _a = _b.sent();
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        QaapMiniBrowserContent_1.prototype.createInput = function (parent) {
            var _this = this;
            var field = document.createElement('div');
            field.classList.add(qaap_mini_browser_content_style_1.QaapMiniBrowserContentStyle.URL_FIELD);
            parent.appendChild(field);
            var input = _super.prototype.createInput.call(this, field);
            if (this.getToolbarProps() === 'show') {
                var goButton = document.createElement('button');
                goButton.type = 'button';
                goButton.classList.add(qaap_mini_browser_content_style_1.QaapMiniBrowserContentStyle.GO_BUTTON);
                goButton.textContent = nls_1.nls.localize('theia/mini-browser/go', 'Go');
                goButton.title = nls_1.nls.localize('theia/mini-browser/goToUrl', 'Go to URL');
                this.toDispose.push((0, widget_1.addEventListener)(goButton, 'click', function () { return _this.navigateFromUrlBar(); }));
                field.appendChild(goButton);
            }
            return input;
        };
        QaapMiniBrowserContent_1.prototype.onUrlBarNavigateFailed = function (message) {
            _super.prototype.onUrlBarNavigateFailed.call(this, message);
            this.messageService.warn(message);
        };
        QaapMiniBrowserContent_1.prototype.createRefresh = function (parent) {
            var button = (0, qaap_agent_preview_chrome_1.createQaapPreviewToolbarIconButton)(nls_1.nls.localize('theia/mini-browser/reload', 'Reload'), 'refresh', qaap_agent_preview_chrome_style_1.QaapAgentPreviewChromeStyle.TOOLBAR_REFRESH);
            parent.appendChild(button);
            return this.onClick(button, this.refreshEmitter);
        };
        QaapMiniBrowserContent_1.prototype.createToolbar = function (parent) {
            var toolbar = document.createElement('div');
            toolbar.classList.add(this.getToolbarProps() === 'read-only' ? mini_browser_content_style_1.MiniBrowserContentStyle.TOOLBAR_READ_ONLY : mini_browser_content_style_1.MiniBrowserContentStyle.TOOLBAR);
            parent.appendChild(toolbar);
            this.createPrevious(toolbar);
            this.createNext(toolbar);
            this.createRefresh(toolbar);
            var input = this.createInput(toolbar);
            this.createWorkbenchControls(toolbar);
            if (this.getToolbarProps() !== 'hide') {
                this.ensurePreviewChrome(toolbar);
            }
            if (this.getToolbarProps() === 'hide') {
                toolbar.style.display = 'none';
            }
            return Object.assign(toolbar, { input: input });
        };
        QaapMiniBrowserContent_1.prototype.ensurePreviewChrome = function (toolbar) {
            if (this.previewChrome) {
                return;
            }
            var host = this.createPreviewChromeHost();
            this.previewChrome = new qaap_agent_preview_chrome_1.QaapAgentPreviewChromeController(host, {
                clipboard: this.clipboard,
                messageService: this.messageService,
            });
            var firstNav = toolbar.querySelector('.theia-mini-browser-previous');
            this.previewChrome.attachToolbarControls(toolbar, firstNav instanceof HTMLElement ? firstNav : undefined);
            this.toDispose.push(this.previewChrome);
        };
        QaapMiniBrowserContent_1.prototype.createPreviewChromeHost = function () {
            var _this = this;
            return {
                getRoot: function () { return _this.node; },
                getFrame: function () { return _this.frame; },
                getCurrentUrl: function () { return _this.frameSrc() || _this.input.value || ''; },
                getPageTitle: function () {
                    var _a;
                    try {
                        return ((_a = _this.frame.contentDocument) === null || _a === void 0 ? void 0 : _a.title) || undefined;
                    }
                    catch (_b) {
                        return undefined;
                    }
                },
                navigate: function (url, options) {
                    var normalized = url.trim();
                    if (options === null || options === void 0 ? void 0 : options.hard) {
                        var bust = normalized.includes('?')
                            ? "".concat(normalized, "&_qaap_cache_bust=").concat(Date.now())
                            : "".concat(normalized, "?_qaap_cache_bust=").concat(Date.now());
                        return _this.go(bust, { preserveFocus: false });
                    }
                    return _this.go(normalized, { preserveFocus: false });
                },
                reload: function () { return _this.handleRefresh(); },
                hardReload: function () {
                    var current = _this.frameSrc() || _this.input.value;
                    if (current) {
                        void _this.go(current.includes('?')
                            ? "".concat(current, "&_qaap_cache_bust=").concat(Date.now())
                            : "".concat(current, "?_qaap_cache_bust=").concat(Date.now()), { preserveFocus: false });
                    }
                    else {
                        _this.handleRefresh();
                    }
                },
                openExternal: function () { return _this.handleOpen(); },
                copyCurrentUrl: function () { return __awaiter(_this, void 0, void 0, function () {
                    var url;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                url = this.frameSrc() || this.input.value;
                                if (!url) return [3 /*break*/, 2];
                                return [4 /*yield*/, this.clipboard.writeText(url)];
                            case 1:
                                _a.sent();
                                this.messageService.info(nls_1.nls.localize('qaap/preview/urlCopied', 'URL copied to clipboard'));
                                _a.label = 2;
                            case 2: return [2 /*return*/];
                        }
                    });
                }); },
                onPickElement: function () { return _this.startElementPicker(); },
                onToggleInspector: function () { void _this.openElementInspector(); },
                setInspectorPosition: function (position) {
                    var split = _this.node.querySelector('.qaap-preview-split');
                    var inspectorSlot = _this.node.querySelector('.qaap-preview-inspector-slot');
                    if (split instanceof HTMLElement && inspectorSlot instanceof HTMLElement) {
                        (0, qaap_preview_inline_inspector_1.setPreviewInspectorPosition)(split, inspectorSlot, position);
                    }
                },
            };
        };
        QaapMiniBrowserContent_1.prototype.onFrameLoad = function () {
            var _a;
            _super.prototype.onFrameLoad.call(this);
            this.ensureFramePicker().onFrameLoad();
            if (this.frameSrc()) {
                (_a = this.previewChrome) === null || _a === void 0 ? void 0 : _a.recordVisit();
            }
        };
        /** Starts the in-iframe DOM picker (toolbar, command, AI tool). */
        QaapMiniBrowserContent_1.prototype.startElementPicker = function () {
            this.ensureFramePicker().startElementPicker();
        };
        QaapMiniBrowserContent_1.prototype.openElementInspector = function () {
            return this.ensureFramePicker().openElementInspector();
        };
        /** @deprecated Use {@link openElementInspector}. */
        QaapMiniBrowserContent_1.prototype.toggleElementInspector = function () {
            return this.openElementInspector();
        };
        QaapMiniBrowserContent_1.prototype.handleOpen = function () {
            var location = this.frameSrc() || this.input.value;
            if (location) {
                this.windowService.openNewWindow(location, { external: true });
            }
        };
        QaapMiniBrowserContent_1.prototype.createWorkbenchControls = function (parent) {
            var controls = document.createElement('div');
            controls.classList.add(qaap_mini_browser_content_style_1.QaapMiniBrowserContentStyle.WORKBENCH_CONTROLS);
            parent.appendChild(controls);
            this.createOpen(controls);
            this.createInspectButton(controls);
            this.createInspectorToggleButton(controls);
            return controls;
        };
        QaapMiniBrowserContent_1.prototype.createInspectButton = function (parent) {
            var _this = this;
            var button = this.createWorkbenchButton(parent, nls_1.nls.localize('theia/mini-browser/pickElement', 'Pick an element to send to chat'), 'inspect');
            this.toDispose.push((0, widget_1.addEventListener)(button, 'click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                _this.startElementPicker();
            }));
            return button;
        };
        QaapMiniBrowserContent_1.prototype.createInspectorToggleButton = function (parent) {
            var _this = this;
            var _a;
            var button = this.createWorkbenchButton(parent, nls_1.nls.localize('theia/mini-browser/toggleElementInspector', 'Toggle Element Inspector'), 'layout-panel');
            this.inspectorToggleButton = button;
            (_a = this.inlineInspector) === null || _a === void 0 ? void 0 : _a.bindToggleButton(button);
            this.toDispose.push((0, widget_1.addEventListener)(button, 'click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                void _this.openElementInspector();
            }));
            return button;
        };
        QaapMiniBrowserContent_1.prototype.createWorkbenchButton = function (parent, title, icon) {
            var _a;
            var button = document.createElement('button');
            button.type = 'button';
            button.title = title;
            (_a = button.classList).add.apply(_a, __spreadArray([qaap_mini_browser_content_style_1.QaapMiniBrowserContentStyle.WORKBENCH_BUTTON], (0, widget_1.codiconArray)(icon), false));
            parent.appendChild(button);
            return button;
        };
        QaapMiniBrowserContent_1.prototype.createOpen = function (parent) {
            var _this = this;
            var button = this.createWorkbenchButton(parent, nls_1.nls.localize('theia/mini-browser/openInNewBrowserTab', 'Open in New Browser Tab'), 'link-external');
            button.classList.add(qaap_mini_browser_content_style_1.QaapMiniBrowserContentStyle.OPEN);
            this.toDispose.push((0, widget_1.addEventListener)(button, 'click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                _this.openEmitter.fire(undefined);
            }));
            return button;
        };
        return QaapMiniBrowserContent_1;
    }(_classSuper));
    __setFunctionName(_classThis, "QaapMiniBrowserContent");
    (function () {
        var _a;
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_a = _classSuper[Symbol.metadata]) !== null && _a !== void 0 ? _a : null) : void 0;
        _clipboard_decorators = [(0, inversify_1.inject)(clipboard_service_1.ClipboardService)];
        _messageService_decorators = [(0, inversify_1.inject)(message_service_1.MessageService)];
        _previewSurfaces_decorators = [(0, inversify_1.inject)(qaap_preview_surface_registry_1.QaapPreviewSurfaceRegistry)];
        _pickerFactory_decorators = [(0, inversify_1.inject)(qaap_preview_frame_picker_1.QaapPreviewFramePickerFactory)];
        _elementInspectorService_decorators = [(0, inversify_1.inject)(element_inspector_service_1.ElementInspectorService)];
        _commandRegistry_decorators = [(0, inversify_1.inject)(command_1.CommandRegistry)];
        _init_decorators = [(0, inversify_1.postConstruct)()];
        __esDecorate(_classThis, null, _init_decorators, { kind: "method", name: "init", static: false, private: false, access: { has: function (obj) { return "init" in obj; }, get: function (obj) { return obj.init; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, null, _clipboard_decorators, { kind: "field", name: "clipboard", static: false, private: false, access: { has: function (obj) { return "clipboard" in obj; }, get: function (obj) { return obj.clipboard; }, set: function (obj, value) { obj.clipboard = value; } }, metadata: _metadata }, _clipboard_initializers, _clipboard_extraInitializers);
        __esDecorate(null, null, _messageService_decorators, { kind: "field", name: "messageService", static: false, private: false, access: { has: function (obj) { return "messageService" in obj; }, get: function (obj) { return obj.messageService; }, set: function (obj, value) { obj.messageService = value; } }, metadata: _metadata }, _messageService_initializers, _messageService_extraInitializers);
        __esDecorate(null, null, _previewSurfaces_decorators, { kind: "field", name: "previewSurfaces", static: false, private: false, access: { has: function (obj) { return "previewSurfaces" in obj; }, get: function (obj) { return obj.previewSurfaces; }, set: function (obj, value) { obj.previewSurfaces = value; } }, metadata: _metadata }, _previewSurfaces_initializers, _previewSurfaces_extraInitializers);
        __esDecorate(null, null, _pickerFactory_decorators, { kind: "field", name: "pickerFactory", static: false, private: false, access: { has: function (obj) { return "pickerFactory" in obj; }, get: function (obj) { return obj.pickerFactory; }, set: function (obj, value) { obj.pickerFactory = value; } }, metadata: _metadata }, _pickerFactory_initializers, _pickerFactory_extraInitializers);
        __esDecorate(null, null, _elementInspectorService_decorators, { kind: "field", name: "elementInspectorService", static: false, private: false, access: { has: function (obj) { return "elementInspectorService" in obj; }, get: function (obj) { return obj.elementInspectorService; }, set: function (obj, value) { obj.elementInspectorService = value; } }, metadata: _metadata }, _elementInspectorService_initializers, _elementInspectorService_extraInitializers);
        __esDecorate(null, null, _commandRegistry_decorators, { kind: "field", name: "commandRegistry", static: false, private: false, access: { has: function (obj) { return "commandRegistry" in obj; }, get: function (obj) { return obj.commandRegistry; }, set: function (obj, value) { obj.commandRegistry = value; } }, metadata: _metadata }, _commandRegistry_initializers, _commandRegistry_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QaapMiniBrowserContent = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QaapMiniBrowserContent = _classThis;
}();
exports.QaapMiniBrowserContent = QaapMiniBrowserContent;
