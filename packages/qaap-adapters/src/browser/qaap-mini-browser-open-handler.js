"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QaapMiniBrowserOpenHandler = void 0;
var inversify_1 = require("@theia/core/shared/inversify");
var uri_1 = require("@theia/core/lib/common/uri");
var browser_1 = require("@theia/core/lib/browser");
var message_service_1 = require("@theia/core/lib/common/message-service");
var nls_1 = require("@theia/core/lib/common/nls");
var mobile_layout_state_1 = require("@theia/core/lib/browser/shell/mobile-layout-state");
var mini_browser_open_handler_1 = require("@theia/mini-browser/lib/browser/mini-browser-open-handler");
var mini_browser_url_utils_1 = require("@theia/mini-browser/lib/browser/mini-browser-url-utils");
var qaap_mini_browser_defaults_1 = require("./qaap-mini-browser-defaults");
/**
 * Qaap mobile / URL preview behavior for mini-browser open handler.
 */
var QaapMiniBrowserOpenHandler = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _classSuper = mini_browser_open_handler_1.MiniBrowserOpenHandler;
    var _messages_decorators;
    var _messages_initializers = [];
    var _messages_extraInitializers = [];
    var QaapMiniBrowserOpenHandler = _classThis = /** @class */ (function (_super) {
        __extends(QaapMiniBrowserOpenHandler_1, _super);
        function QaapMiniBrowserOpenHandler_1() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.messages = __runInitializers(_this, _messages_initializers, void 0);
            __runInitializers(_this, _messages_extraInitializers);
            return _this;
        }
        QaapMiniBrowserOpenHandler_1.prototype.registerCommands = function (commands) {
            var _this = this;
            commands.registerCommand(__assign(__assign({}, mini_browser_open_handler_1.MiniBrowserCommands.PREVIEW), { iconClass: (0, browser_1.codicon)('play') }), {
                execute: function (widget) { return _this.preview(widget); },
                isEnabled: function (widget) { return _this.canPreviewWidget(widget); },
                isVisible: function (widget) { return _this.canPreviewWidget(widget); }
            });
            commands.registerCommand(mini_browser_open_handler_1.MiniBrowserCommands.OPEN_SOURCE, {
                execute: function (widget) { return _this.openSource(widget); },
                isEnabled: function (widget) { return !!_this.getSourceUri(widget); },
                isVisible: function (widget) { return !!_this.getSourceUri(widget); }
            });
            commands.registerCommand(mini_browser_open_handler_1.MiniBrowserCommands.OPEN_URL, {
                execute: function () {
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    return _this.openUrl(_this.coerceUrlCommandArg(args));
                }
            });
        };
        QaapMiniBrowserOpenHandler_1.prototype.coerceUrlCommandArg = function (args) {
            for (var _i = 0, args_1 = args; _i < args_1.length; _i++) {
                var arg = args_1[_i];
                if (typeof arg === 'string') {
                    var t = (0, mini_browser_url_utils_1.normalizeMiniBrowserOpenUrl)(arg);
                    if (t) {
                        return t;
                    }
                }
            }
            return undefined;
        };
        QaapMiniBrowserOpenHandler_1.prototype.openUrl = function (urlFromCommand) {
            return __awaiter(this, void 0, void 0, function () {
                var url;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            url = urlFromCommand ? (0, mini_browser_url_utils_1.normalizeMiniBrowserOpenUrl)(urlFromCommand) : '';
                            if (!!url) return [3 /*break*/, 2];
                            return [4 /*yield*/, this.openEmptyPreview()];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                        case 2: return [4 /*yield*/, this.openPreviewForProduct(url)];
                        case 3:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        };
        QaapMiniBrowserOpenHandler_1.prototype.options = function (uri, options) {
            return __awaiter(this, void 0, void 0, function () {
                var result, _removed, withoutPlaceholder;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!(uri === null || uri === void 0 ? void 0 : uri.isEqual(mini_browser_open_handler_1.MiniBrowserOpenHandler.PREVIEW_URI))) return [3 /*break*/, 2];
                            return [4 /*yield*/, this.defaultOptions()];
                        case 1:
                            result = _a.sent();
                            if (options) {
                                result = __assign(__assign({}, result), options);
                            }
                            if ((0, qaap_mini_browser_defaults_1.isMiniBrowserPreviewPlaceholderUrl)(result.startPage)) {
                                _removed = result.startPage, withoutPlaceholder = __rest(result, ["startPage"]);
                                result = withoutPlaceholder;
                            }
                            return [2 /*return*/, result];
                        case 2: return [2 /*return*/, _super.prototype.options.call(this, uri, options)];
                    }
                });
            });
        };
        /** Opens preview with toolbar URL input; no quick-input prompt. */
        QaapMiniBrowserOpenHandler_1.prototype.openEmptyPreview = function () {
            return __awaiter(this, void 0, void 0, function () {
                var area, props;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            area = this.previewArea();
                            return [4 /*yield*/, this.closePreviewIfNeedsFreshAttach(area)];
                        case 1:
                            _a.sent();
                            props = {
                                name: nls_1.nls.localize(mini_browser_open_handler_1.MiniBrowserCommands.PREVIEW_CATEGORY_KEY, mini_browser_open_handler_1.MiniBrowserCommands.PREVIEW_CATEGORY),
                                toolbar: 'show',
                                widgetOptions: {
                                    area: area,
                                    mode: 'tab-after'
                                },
                                resetBackground: false,
                                iconClass: (0, browser_1.codicon)('preview'),
                                openFor: 'preview'
                            };
                            return [2 /*return*/, this.open(mini_browser_open_handler_1.MiniBrowserOpenHandler.PREVIEW_URI, props)];
                    }
                });
            });
        };
        QaapMiniBrowserOpenHandler_1.prototype.openPreviewForProduct = function (startPage) {
            return __awaiter(this, void 0, void 0, function () {
                var trimmed, mapped, err_1, props, area;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            trimmed = (0, mini_browser_url_utils_1.normalizeMiniBrowserOpenUrl)(startPage);
                            if (!trimmed) {
                                this.messages.warn(nls_1.nls.localize('theia/mini-browser/emptyUrl', 'Please enter a URL.'));
                                return [2 /*return*/, undefined];
                            }
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, this.locationMapperService.map(trimmed)];
                        case 2:
                            mapped = _a.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            err_1 = _a.sent();
                            this.messages.error(nls_1.nls.localize('theia/mini-browser/urlMapFailed', 'Could not resolve that URL: {0}', (0, mini_browser_url_utils_1.formatMiniBrowserNavigateError)(err_1)));
                            return [2 /*return*/, undefined];
                        case 4: return [4 /*yield*/, this.getOpenPreviewProps(mapped)];
                        case 5:
                            props = _a.sent();
                            area = props.widgetOptions && props.widgetOptions.area || this.previewArea();
                            return [4 /*yield*/, this.closePreviewIfNeedsFreshAttach(area)];
                        case 6:
                            _a.sent();
                            return [2 /*return*/, this.open(mini_browser_open_handler_1.MiniBrowserOpenHandler.PREVIEW_URI, props)];
                    }
                });
            });
        };
        QaapMiniBrowserOpenHandler_1.prototype.getOpenPreviewProps = function (startPage) {
            return __awaiter(this, void 0, void 0, function () {
                var resetBackground, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            resetBackground = false;
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, this.resetBackground(new uri_1.default(startPage))];
                        case 2:
                            resetBackground = _b.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            _a = _b.sent();
                            resetBackground = startPage.startsWith('http://') || startPage.startsWith('https://');
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/, {
                                name: nls_1.nls.localize(mini_browser_open_handler_1.MiniBrowserCommands.PREVIEW_CATEGORY_KEY, mini_browser_open_handler_1.MiniBrowserCommands.PREVIEW_CATEGORY),
                                startPage: startPage,
                                toolbar: 'show',
                                widgetOptions: {
                                    area: this.previewArea(),
                                    mode: 'tab-after'
                                },
                                resetBackground: resetBackground,
                                iconClass: (0, browser_1.codicon)('preview'),
                                openFor: 'preview'
                            }];
                    }
                });
            });
        };
        QaapMiniBrowserOpenHandler_1.prototype.previewArea = function () {
            return this.isMobileOneColumn() ? 'main' : 'right';
        };
        QaapMiniBrowserOpenHandler_1.prototype.closePreviewIfNeedsFreshAttach = function (area) {
            return __awaiter(this, void 0, void 0, function () {
                var existing, currentArea;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.getWidget(mini_browser_open_handler_1.MiniBrowserOpenHandler.PREVIEW_URI)];
                        case 1:
                            existing = _a.sent();
                            if (!(existing === null || existing === void 0 ? void 0 : existing.isAttached)) {
                                return [2 /*return*/];
                            }
                            currentArea = this.shell.getAreaFor(existing);
                            if (!(this.isMobileOneColumn() || (currentArea && currentArea !== area))) return [3 /*break*/, 3];
                            return [4 /*yield*/, this.shell.closeWidget(existing.id, { save: false })];
                        case 2:
                            _a.sent();
                            _a.label = 3;
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        QaapMiniBrowserOpenHandler_1.prototype.isMobileOneColumn = function () {
            if (typeof document === 'undefined') {
                return false;
            }
            var shellNode = document.getElementById('theia-app-shell');
            return !!(shellNode === null || shellNode === void 0 ? void 0 : shellNode.classList.contains(mobile_layout_state_1.MOBILE_ONE_COLUMN_LAYOUT_CLASS));
        };
        return QaapMiniBrowserOpenHandler_1;
    }(_classSuper));
    __setFunctionName(_classThis, "QaapMiniBrowserOpenHandler");
    (function () {
        var _a;
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_a = _classSuper[Symbol.metadata]) !== null && _a !== void 0 ? _a : null) : void 0;
        _messages_decorators = [(0, inversify_1.inject)(message_service_1.MessageService)];
        __esDecorate(null, null, _messages_decorators, { kind: "field", name: "messages", static: false, private: false, access: { has: function (obj) { return "messages" in obj; }, get: function (obj) { return obj.messages; }, set: function (obj, value) { obj.messages = value; } }, metadata: _metadata }, _messages_initializers, _messages_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QaapMiniBrowserOpenHandler = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QaapMiniBrowserOpenHandler = _classThis;
}();
exports.QaapMiniBrowserOpenHandler = QaapMiniBrowserOpenHandler;
