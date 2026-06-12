"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.QaapPreviewFramePicker = exports.QaapPreviewFramePickerFactory = void 0;
var inversify_1 = require("@theia/core/shared/inversify");
var command_1 = require("@theia/core/lib/common/command");
var disposable_1 = require("@theia/core/lib/common/disposable");
var nls_1 = require("@theia/core/lib/common/nls");
var clipboard_service_1 = require("@theia/core/lib/browser/clipboard-service");
var message_service_1 = require("@theia/core/lib/common/message-service");
var element_inspector_service_1 = require("@theia/qaap-element-inspector/lib/browser/element-inspector-service");
var element_inspector_types_1 = require("@theia/qaap-element-inspector/lib/browser/element-inspector-types");
var element_picker_script_1 = require("@theia/qaap-element-inspector/lib/browser/element-picker-script");
var element_inspector_contribution_1 = require("@theia/qaap-element-inspector/lib/browser/element-inspector-contribution");
/** DOM picker + inspector bridge for a single preview iframe (mini-browser or embedded). */
var QaapPreviewFramePickerFactory = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _commands_decorators;
    var _commands_initializers = [];
    var _commands_extraInitializers = [];
    var _clipboard_decorators;
    var _clipboard_initializers = [];
    var _clipboard_extraInitializers = [];
    var _messageService_decorators;
    var _messageService_initializers = [];
    var _messageService_extraInitializers = [];
    var _inspectorService_decorators;
    var _inspectorService_initializers = [];
    var _inspectorService_extraInitializers = [];
    var QaapPreviewFramePickerFactory = _classThis = /** @class */ (function () {
        function QaapPreviewFramePickerFactory_1() {
            this.commands = __runInitializers(this, _commands_initializers, void 0);
            this.clipboard = (__runInitializers(this, _commands_extraInitializers), __runInitializers(this, _clipboard_initializers, void 0));
            this.messageService = (__runInitializers(this, _clipboard_extraInitializers), __runInitializers(this, _messageService_initializers, void 0));
            this.inspectorService = (__runInitializers(this, _messageService_extraInitializers), __runInitializers(this, _inspectorService_initializers, void 0));
            __runInitializers(this, _inspectorService_extraInitializers);
        }
        QaapPreviewFramePickerFactory_1.prototype.create = function (frame, toDispose) {
            return new QaapPreviewFramePicker(frame, this.commands, this.clipboard, this.messageService, this.inspectorService, toDispose);
        };
        return QaapPreviewFramePickerFactory_1;
    }());
    __setFunctionName(_classThis, "QaapPreviewFramePickerFactory");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _commands_decorators = [(0, inversify_1.inject)(command_1.CommandRegistry)];
        _clipboard_decorators = [(0, inversify_1.inject)(clipboard_service_1.ClipboardService)];
        _messageService_decorators = [(0, inversify_1.inject)(message_service_1.MessageService)];
        _inspectorService_decorators = [(0, inversify_1.inject)(element_inspector_service_1.ElementInspectorService)];
        __esDecorate(null, null, _commands_decorators, { kind: "field", name: "commands", static: false, private: false, access: { has: function (obj) { return "commands" in obj; }, get: function (obj) { return obj.commands; }, set: function (obj, value) { obj.commands = value; } }, metadata: _metadata }, _commands_initializers, _commands_extraInitializers);
        __esDecorate(null, null, _clipboard_decorators, { kind: "field", name: "clipboard", static: false, private: false, access: { has: function (obj) { return "clipboard" in obj; }, get: function (obj) { return obj.clipboard; }, set: function (obj, value) { obj.clipboard = value; } }, metadata: _metadata }, _clipboard_initializers, _clipboard_extraInitializers);
        __esDecorate(null, null, _messageService_decorators, { kind: "field", name: "messageService", static: false, private: false, access: { has: function (obj) { return "messageService" in obj; }, get: function (obj) { return obj.messageService; }, set: function (obj, value) { obj.messageService = value; } }, metadata: _metadata }, _messageService_initializers, _messageService_extraInitializers);
        __esDecorate(null, null, _inspectorService_decorators, { kind: "field", name: "inspectorService", static: false, private: false, access: { has: function (obj) { return "inspectorService" in obj; }, get: function (obj) { return obj.inspectorService; }, set: function (obj, value) { obj.inspectorService = value; } }, metadata: _metadata }, _inspectorService_initializers, _inspectorService_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QaapPreviewFramePickerFactory = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QaapPreviewFramePickerFactory = _classThis;
}();
exports.QaapPreviewFramePickerFactory = QaapPreviewFramePickerFactory;
var QaapPreviewFramePicker = /** @class */ (function () {
    function QaapPreviewFramePicker(frame, commands, clipboard, messageService, inspectorService, toDispose) {
        var _this = this;
        this.frame = frame;
        this.commands = commands;
        this.clipboard = clipboard;
        this.messageService = messageService;
        this.inspectorService = inspectorService;
        this.toDispose = toDispose;
        this.pickerListenerInstalled = false;
        toDispose.push(disposable_1.Disposable.create(function () {
            _this.pickerListenerInstalled = false;
        }));
    }
    QaapPreviewFramePicker.prototype.connectInlineInspector = function (inspector) {
        this.inlineInspector = inspector;
    };
    QaapPreviewFramePicker.prototype.bindInspectorWindow = function () {
        try {
            var win = this.frame.contentWindow;
            if (win) {
                this.inspectorService.bind(win);
            }
        }
        catch (_a) {
            /* cross-origin */
        }
    };
    QaapPreviewFramePicker.prototype.injectInspectorBridge = function () {
        try {
            var doc = this.frame.contentDocument;
            if (!doc) {
                return;
            }
            var script = doc.createElement('script');
            script.textContent = (0, element_picker_script_1.buildElementBridgeScript)();
            doc.documentElement.appendChild(script);
            script.remove();
        }
        catch (_a) {
            /* cross-origin */
        }
    };
    QaapPreviewFramePicker.prototype.onFrameLoad = function () {
        this.injectInspectorBridge();
        this.bindInspectorWindow();
    };
    QaapPreviewFramePicker.prototype.startElementPicker = function () {
        this.installPickerListener();
        try {
            var doc = this.frame.contentDocument;
            var win = this.frame.contentWindow;
            if (!doc || !win) {
                this.notifyPickerUnavailable();
                return;
            }
            this.injectInspectorBridge();
            var script = doc.createElement('script');
            script.textContent = (0, element_picker_script_1.buildElementPickerScript)();
            doc.documentElement.appendChild(script);
            script.remove();
            this.messageService.info(nls_1.nls.localize('qaap/preview/pickerActive', 'Element picker active — click an element in the preview.'));
        }
        catch (_a) {
            this.notifyPickerUnavailable();
        }
    };
    QaapPreviewFramePicker.prototype.openElementInspector = function () {
        return __awaiter(this, void 0, void 0, function () {
            var revealId, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.bindInspectorWindow();
                        if (this.inlineInspector) {
                            this.inlineInspector.toggle();
                            return [2 /*return*/];
                        }
                        revealId = element_inspector_contribution_1.ELEMENT_INSPECTOR_REVEAL_COMMAND_ID;
                        if (!this.commands.getCommand(revealId)) return [3 /*break*/, 4];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.commands.executeCommand(revealId)];
                    case 2:
                        _b.sent();
                        return [2 /*return*/];
                    case 3:
                        _a = _b.sent();
                        return [3 /*break*/, 4];
                    case 4:
                        this.messageService.warn(nls_1.nls.localize('qaap/preview/inspectorUnavailable', 'Element Inspector is not available. Open a same-origin preview and try again.'));
                        return [2 /*return*/];
                }
            });
        });
    };
    /** @deprecated Use {@link openElementInspector} — kept for callers that still say toggle. */
    QaapPreviewFramePicker.prototype.toggleElementInspector = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.openElementInspector()];
            });
        });
    };
    QaapPreviewFramePicker.prototype.notifyPickerUnavailable = function () {
        this.messageService.warn(nls_1.nls.localize('theia/mini-browser/pickerUnavailable', 'The element picker cannot run on this page because the preview is cross-origin. Open a same-origin preview to use it.'));
    };
    QaapPreviewFramePicker.prototype.installPickerListener = function () {
        var _this = this;
        if (this.pickerListenerInstalled) {
            return;
        }
        this.pickerListenerInstalled = true;
        var handler = function (event) {
            if (!event.data || typeof event.data !== 'object') {
                return;
            }
            if (_this.frame.contentWindow && event.source && event.source !== _this.frame.contentWindow) {
                return;
            }
            var data = event.data;
            if (data.type === element_inspector_types_1.ELEMENT_PICKER_MESSAGE_TYPE && data.payload) {
                void _this.handlePickedElement(data.payload);
            }
            else if (data.type === element_inspector_types_1.ELEMENT_REFRESH_RESPONSE_TYPE && data.payload) {
                _this.inspectorService.refreshed(data.payload);
            }
            else if (data.type === element_inspector_types_1.ELEMENT_PICKER_CANCEL_TYPE) {
                // in-frame script cleans up
            }
        };
        window.addEventListener('message', handler);
        this.toDispose.push(disposable_1.Disposable.create(function () { return window.removeEventListener('message', handler); }));
    };
    QaapPreviewFramePicker.prototype.handlePickedElement = function (element) {
        return __awaiter(this, void 0, void 0, function () {
            var summary, _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        this.inspectorService.bind((_b = this.frame.contentWindow) !== null && _b !== void 0 ? _b : undefined);
                        this.inspectorService.pick(element);
                        summary = this.formatElementForChat(element);
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.clipboard.writeText(summary)];
                    case 2:
                        _c.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        _a = _c.sent();
                        return [3 /*break*/, 4];
                    case 4: return [4 /*yield*/, this.openInlineInspector()];
                    case 5:
                        _c.sent();
                        this.messageService.info(nls_1.nls.localize('theia/mini-browser/elementCaptured', 'Captured {0}. Details opened in the Element Inspector and copied to the clipboard.', element.tagName + (element.id ? '#' + element.id : '') + (element.classes.length ? '.' + element.classes.slice(0, 2).join('.') : '')));
                        return [2 /*return*/];
                }
            });
        });
    };
    QaapPreviewFramePicker.prototype.openInlineInspector = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.inlineInspector) {
                            this.inlineInspector.open();
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, this.revealInspector()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    QaapPreviewFramePicker.prototype.revealInspector = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.commands.getCommand(element_inspector_contribution_1.ELEMENT_INSPECTOR_REVEAL_COMMAND_ID)) {
                            return [2 /*return*/];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.commands.executeCommand(element_inspector_contribution_1.ELEMENT_INSPECTOR_REVEAL_COMMAND_ID)];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        _a = _b.sent();
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    QaapPreviewFramePicker.prototype.formatElementForChat = function (element) {
        var lines = [];
        lines.push('Selected DOM element from preview ' + element.pageUrl);
        lines.push('DOM Path: ' + element.domPath);
        var _a = element.position, top = _a.top, left = _a.left, width = _a.width, height = _a.height;
        lines.push("Position: top=".concat(top, "px, left=").concat(left, "px, width=").concat(width, "px, height=").concat(height, "px"));
        lines.push('HTML Element: ' + element.outerHTML);
        if (element.textPreview) {
            lines.push('Text: ' + element.textPreview);
        }
        return lines.join('\n');
    };
    return QaapPreviewFramePicker;
}());
exports.QaapPreviewFramePicker = QaapPreviewFramePicker;
