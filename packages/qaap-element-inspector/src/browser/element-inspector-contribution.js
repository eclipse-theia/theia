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
exports.ElementInspectorContribution = exports.ElementInspectorCommands = exports.ELEMENT_INSPECTOR_GENERATE_VARIANT_COMMAND_ID = exports.ELEMENT_INSPECTOR_ASK_AGENT_COMMAND_ID = exports.ELEMENT_INSPECTOR_COPY_SELECTOR_COMMAND_ID = exports.ELEMENT_INSPECTOR_REVEAL_COMMAND_ID = exports.ELEMENT_INSPECTOR_TOGGLE_COMMAND_ID = void 0;
var inversify_1 = require("@theia/core/shared/inversify");
var command_1 = require("@theia/core/lib/common/command");
var view_contribution_1 = require("@theia/core/lib/browser/shell/view-contribution");
var browser_1 = require("@theia/core/lib/browser");
var clipboard_service_1 = require("@theia/core/lib/browser/clipboard-service");
var message_service_1 = require("@theia/core/lib/common/message-service");
var nls_1 = require("@theia/core/lib/common/nls");
var common_1 = require("@theia/ai-chat/lib/common");
var ai_chat_ui_contribution_1 = require("@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution");
var coder_agent_1 = require("@theia/ai-ide/lib/browser/coder-agent");
var element_inspector_service_1 = require("./element-inspector-service");
var element_inspector_widget_1 = require("./element-inspector-widget");
var qaap_element_inspector_dom_utils_1 = require("./qaap-element-inspector-dom-utils");
exports.ELEMENT_INSPECTOR_TOGGLE_COMMAND_ID = 'theia-mini-browser.element-inspector.toggle';
exports.ELEMENT_INSPECTOR_REVEAL_COMMAND_ID = 'theia-mini-browser.element-inspector.reveal';
exports.ELEMENT_INSPECTOR_COPY_SELECTOR_COMMAND_ID = 'qaap.element-inspector.copySelector';
exports.ELEMENT_INSPECTOR_ASK_AGENT_COMMAND_ID = 'qaap.element-inspector.askAgent';
exports.ELEMENT_INSPECTOR_GENERATE_VARIANT_COMMAND_ID = 'qaap.element-inspector.generateVariant';
var ElementInspectorCommands;
(function (ElementInspectorCommands) {
    ElementInspectorCommands.TOGGLE = {
        id: exports.ELEMENT_INSPECTOR_TOGGLE_COMMAND_ID,
        category: nls_1.nls.localize('theia/mini-browser/category', 'Mini Browser'),
        label: nls_1.nls.localize('theia/mini-browser/toggleElementInspector', 'Toggle Element Inspector'),
        iconClass: (0, browser_1.codicon)('inspect')
    };
    ElementInspectorCommands.REVEAL = {
        id: exports.ELEMENT_INSPECTOR_REVEAL_COMMAND_ID,
        category: nls_1.nls.localize('theia/mini-browser/category', 'Mini Browser'),
        label: nls_1.nls.localize('theia/mini-browser/revealElementInspector', 'Reveal Element Inspector')
    };
    ElementInspectorCommands.COPY_SELECTOR = {
        id: exports.ELEMENT_INSPECTOR_COPY_SELECTOR_COMMAND_ID,
        category: nls_1.nls.localize('theia/mini-browser/category', 'Mini Browser'),
        label: nls_1.nls.localize('qaap/elementInspector/copySelector', 'Copy selector / component path'),
        iconClass: (0, browser_1.codicon)('copy')
    };
    ElementInspectorCommands.ASK_AGENT = {
        id: exports.ELEMENT_INSPECTOR_ASK_AGENT_COMMAND_ID,
        category: nls_1.nls.localize('theia/mini-browser/category', 'Mini Browser'),
        label: nls_1.nls.localize('qaap/elementInspector/askAgent', 'Ask agent about this element'),
        iconClass: (0, browser_1.codicon)('comment-discussion')
    };
    ElementInspectorCommands.GENERATE_VARIANT = {
        id: exports.ELEMENT_INSPECTOR_GENERATE_VARIANT_COMMAND_ID,
        category: nls_1.nls.localize('theia/mini-browser/category', 'Mini Browser'),
        label: nls_1.nls.localize('qaap/elementInspector/generateVariant', 'Generate UI variant in repo'),
        iconClass: (0, browser_1.codicon)('sparkle')
    };
})(ElementInspectorCommands || (exports.ElementInspectorCommands = ElementInspectorCommands = {}));
var ElementInspectorContribution = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _classSuper = view_contribution_1.AbstractViewContribution;
    var _inspector_decorators;
    var _inspector_initializers = [];
    var _inspector_extraInitializers = [];
    var _clipboard_decorators;
    var _clipboard_initializers = [];
    var _clipboard_extraInitializers = [];
    var _messages_decorators;
    var _messages_initializers = [];
    var _messages_extraInitializers = [];
    var _chatService_decorators;
    var _chatService_initializers = [];
    var _chatService_extraInitializers = [];
    var _commands_decorators;
    var _commands_initializers = [];
    var _commands_extraInitializers = [];
    var ElementInspectorContribution = _classThis = /** @class */ (function (_super) {
        __extends(ElementInspectorContribution_1, _super);
        function ElementInspectorContribution_1() {
            var _this = _super.call(this, {
                widgetId: element_inspector_widget_1.ElementInspectorWidget.ID,
                widgetName: element_inspector_widget_1.ElementInspectorWidget.LABEL,
                defaultWidgetOptions: {
                    /** Full editor tab (Cursor-style), not the right side panel. */
                    area: 'main',
                    mode: 'tab-after'
                },
                toggleCommandId: exports.ELEMENT_INSPECTOR_TOGGLE_COMMAND_ID
            }) || this;
            _this.inspector = __runInitializers(_this, _inspector_initializers, void 0);
            _this.clipboard = (__runInitializers(_this, _inspector_extraInitializers), __runInitializers(_this, _clipboard_initializers, void 0));
            _this.messages = (__runInitializers(_this, _clipboard_extraInitializers), __runInitializers(_this, _messages_initializers, void 0));
            _this.chatService = (__runInitializers(_this, _messages_extraInitializers), __runInitializers(_this, _chatService_initializers, void 0));
            _this.commands = (__runInitializers(_this, _chatService_extraInitializers), __runInitializers(_this, _commands_initializers, void 0));
            __runInitializers(_this, _commands_extraInitializers);
            return _this;
        }
        ElementInspectorContribution_1.prototype.registerCommands = function (registry) {
            var _this = this;
            _super.prototype.registerCommands.call(this, registry);
            registry.registerCommand(ElementInspectorCommands.REVEAL, {
                execute: function () { return _this.openView({ activate: true, reveal: true }); }
            });
            registry.registerCommand(ElementInspectorCommands.COPY_SELECTOR, {
                execute: function () { return _this.copySelector(); },
                isEnabled: function () { return !!_this.inspector.state.picked; },
            });
            registry.registerCommand(ElementInspectorCommands.ASK_AGENT, {
                execute: function () { return _this.askAgentAboutElement(); },
                isEnabled: function () { return !!_this.inspector.state.picked; },
            });
            registry.registerCommand(ElementInspectorCommands.GENERATE_VARIANT, {
                execute: function () { return _this.generateVariantInRepo(); },
                isEnabled: function () { return !!_this.inspector.state.picked; },
            });
        };
        ElementInspectorContribution_1.prototype.copySelector = function () {
            return __awaiter(this, void 0, void 0, function () {
                var picked, selector, componentPath, text, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            picked = this.inspector.state.picked;
                            if (!picked) {
                                return [2 /*return*/];
                            }
                            selector = (0, qaap_element_inspector_dom_utils_1.buildElementCssSelector)(picked);
                            componentPath = (0, qaap_element_inspector_dom_utils_1.guessElementComponentPath)(picked);
                            text = componentPath && componentPath !== picked.domPath
                                ? "".concat(selector, "\n").concat(componentPath)
                                : selector;
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, this.clipboard.writeText(text)];
                        case 2:
                            _b.sent();
                            this.messages.info(nls_1.nls.localize('qaap/elementInspector/copied', 'Copied to clipboard.'));
                            return [3 /*break*/, 4];
                        case 3:
                            _a = _b.sent();
                            this.messages.warn(nls_1.nls.localize('qaap/elementInspector/copyFailed', 'Could not copy to clipboard.'));
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        ElementInspectorContribution_1.prototype.askAgentAboutElement = function () {
            return __awaiter(this, void 0, void 0, function () {
                var picked, _a, session, prompt;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            picked = this.inspector.state.picked;
                            if (!picked) {
                                return [2 /*return*/];
                            }
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, this.commands.executeCommand(ai_chat_ui_contribution_1.AI_CHAT_TOGGLE_COMMAND_ID)];
                        case 2:
                            _b.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            _a = _b.sent();
                            return [3 /*break*/, 4];
                        case 4:
                            session = this.chatService.getActiveSession();
                            if (!session) {
                                session = this.chatService.createSession();
                                this.chatService.setActiveSession(session.id);
                            }
                            prompt = (0, qaap_element_inspector_dom_utils_1.formatElementAgentPrompt)(picked);
                            return [4 /*yield*/, this.chatService.sendRequest(session.id, {
                                    text: "@".concat(coder_agent_1.CoderAgentId, " ").concat(prompt),
                                })];
                        case 5:
                            _b.sent();
                            return [4 /*yield*/, this.openView({ activate: false, reveal: true })];
                        case 6:
                            _b.sent();
                            return [2 /*return*/];
                    }
                });
            });
        };
        ElementInspectorContribution_1.prototype.generateVariantInRepo = function () {
            return __awaiter(this, void 0, void 0, function () {
                var picked, _a, session, prompt;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            picked = this.inspector.state.picked;
                            if (!picked) {
                                return [2 /*return*/];
                            }
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, this.commands.executeCommand(ai_chat_ui_contribution_1.AI_CHAT_TOGGLE_COMMAND_ID)];
                        case 2:
                            _b.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            _a = _b.sent();
                            return [3 /*break*/, 4];
                        case 4:
                            session = this.chatService.getActiveSession();
                            if (!session) {
                                session = this.chatService.createSession();
                                this.chatService.setActiveSession(session.id);
                            }
                            prompt = (0, qaap_element_inspector_dom_utils_1.formatElementGenerateVariantPrompt)(picked);
                            return [4 /*yield*/, this.chatService.sendRequest(session.id, {
                                    text: "@".concat(coder_agent_1.CoderAgentId, " ").concat(prompt),
                                })];
                        case 5:
                            _b.sent();
                            return [4 /*yield*/, this.openView({ activate: false, reveal: true })];
                        case 6:
                            _b.sent();
                            return [2 /*return*/];
                    }
                });
            });
        };
        return ElementInspectorContribution_1;
    }(_classSuper));
    __setFunctionName(_classThis, "ElementInspectorContribution");
    (function () {
        var _a;
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_a = _classSuper[Symbol.metadata]) !== null && _a !== void 0 ? _a : null) : void 0;
        _inspector_decorators = [(0, inversify_1.inject)(element_inspector_service_1.ElementInspectorService)];
        _clipboard_decorators = [(0, inversify_1.inject)(clipboard_service_1.ClipboardService)];
        _messages_decorators = [(0, inversify_1.inject)(message_service_1.MessageService)];
        _chatService_decorators = [(0, inversify_1.inject)(common_1.ChatService)];
        _commands_decorators = [(0, inversify_1.inject)(command_1.CommandRegistry)];
        __esDecorate(null, null, _inspector_decorators, { kind: "field", name: "inspector", static: false, private: false, access: { has: function (obj) { return "inspector" in obj; }, get: function (obj) { return obj.inspector; }, set: function (obj, value) { obj.inspector = value; } }, metadata: _metadata }, _inspector_initializers, _inspector_extraInitializers);
        __esDecorate(null, null, _clipboard_decorators, { kind: "field", name: "clipboard", static: false, private: false, access: { has: function (obj) { return "clipboard" in obj; }, get: function (obj) { return obj.clipboard; }, set: function (obj, value) { obj.clipboard = value; } }, metadata: _metadata }, _clipboard_initializers, _clipboard_extraInitializers);
        __esDecorate(null, null, _messages_decorators, { kind: "field", name: "messages", static: false, private: false, access: { has: function (obj) { return "messages" in obj; }, get: function (obj) { return obj.messages; }, set: function (obj, value) { obj.messages = value; } }, metadata: _metadata }, _messages_initializers, _messages_extraInitializers);
        __esDecorate(null, null, _chatService_decorators, { kind: "field", name: "chatService", static: false, private: false, access: { has: function (obj) { return "chatService" in obj; }, get: function (obj) { return obj.chatService; }, set: function (obj, value) { obj.chatService = value; } }, metadata: _metadata }, _chatService_initializers, _chatService_extraInitializers);
        __esDecorate(null, null, _commands_decorators, { kind: "field", name: "commands", static: false, private: false, access: { has: function (obj) { return "commands" in obj; }, get: function (obj) { return obj.commands; }, set: function (obj, value) { obj.commands = value; } }, metadata: _metadata }, _commands_initializers, _commands_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ElementInspectorContribution = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ElementInspectorContribution = _classThis;
}();
exports.ElementInspectorContribution = ElementInspectorContribution;
