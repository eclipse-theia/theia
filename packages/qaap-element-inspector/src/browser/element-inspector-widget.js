"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElementInspectorWidget = void 0;
var React = require("react");
var inversify_1 = require("@theia/core/shared/inversify");
var react_widget_1 = require("@theia/core/lib/browser/widgets/react-widget");
var browser_1 = require("@theia/core/lib/browser");
var command_1 = require("@theia/core/lib/common/command");
var nls_1 = require("@theia/core/lib/common/nls");
var element_inspector_service_1 = require("./element-inspector-service");
var element_inspector_panel_1 = require("./element-inspector-panel");
var element_inspector_contribution_1 = require("./element-inspector-contribution");
var ElementInspectorWidget = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _classSuper = react_widget_1.ReactWidget;
    var _instanceExtraInitializers = [];
    var _service_decorators;
    var _service_initializers = [];
    var _service_extraInitializers = [];
    var _commands_decorators;
    var _commands_initializers = [];
    var _commands_extraInitializers = [];
    var _init_decorators;
    var ElementInspectorWidget = _classThis = /** @class */ (function (_super) {
        __extends(ElementInspectorWidget_1, _super);
        function ElementInspectorWidget_1() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.service = (__runInitializers(_this, _instanceExtraInitializers), __runInitializers(_this, _service_initializers, void 0));
            _this.commands = (__runInitializers(_this, _service_extraInitializers), __runInitializers(_this, _commands_initializers, void 0));
            __runInitializers(_this, _commands_extraInitializers);
            return _this;
        }
        ElementInspectorWidget_1.prototype.init = function () {
            var _this = this;
            this.id = ElementInspectorWidget.ID;
            this.title.label = ElementInspectorWidget.LABEL;
            this.title.caption = ElementInspectorWidget.LABEL;
            this.title.iconClass = (0, browser_1.codicon)('inspect');
            this.title.closable = true;
            this.addClass('theia-mini-browser-inspector');
            this.toDispose.push(this.service.onDidChangeState(function () { return _this.update(); }));
            this.update();
        };
        ElementInspectorWidget_1.prototype.onActivateRequest = function (msg) {
            _super.prototype.onActivateRequest.call(this, msg);
            this.node.focus();
        };
        ElementInspectorWidget_1.prototype.render = function () {
            var _this = this;
            return (<element_inspector_panel_1.ElementInspectorPanel service={this.service} onCopySelector={function () { return _this.runCommand(element_inspector_contribution_1.ELEMENT_INSPECTOR_COPY_SELECTOR_COMMAND_ID); }} onAskAgent={function () { return _this.runCommand(element_inspector_contribution_1.ELEMENT_INSPECTOR_ASK_AGENT_COMMAND_ID); }} onGenerateVariant={function () { return _this.runCommand(element_inspector_contribution_1.ELEMENT_INSPECTOR_GENERATE_VARIANT_COMMAND_ID); }}/>);
        };
        ElementInspectorWidget_1.prototype.runCommand = function (commandId) {
            if (this.commands.isEnabled(commandId)) {
                void this.commands.executeCommand(commandId).catch(function () { return undefined; });
            }
        };
        return ElementInspectorWidget_1;
    }(_classSuper));
    __setFunctionName(_classThis, "ElementInspectorWidget");
    (function () {
        var _a;
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_a = _classSuper[Symbol.metadata]) !== null && _a !== void 0 ? _a : null) : void 0;
        _service_decorators = [(0, inversify_1.inject)(element_inspector_service_1.ElementInspectorService)];
        _commands_decorators = [(0, inversify_1.inject)(command_1.CommandRegistry)];
        _init_decorators = [(0, inversify_1.postConstruct)()];
        __esDecorate(_classThis, null, _init_decorators, { kind: "method", name: "init", static: false, private: false, access: { has: function (obj) { return "init" in obj; }, get: function (obj) { return obj.init; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, null, _service_decorators, { kind: "field", name: "service", static: false, private: false, access: { has: function (obj) { return "service" in obj; }, get: function (obj) { return obj.service; }, set: function (obj, value) { obj.service = value; } }, metadata: _metadata }, _service_initializers, _service_extraInitializers);
        __esDecorate(null, null, _commands_decorators, { kind: "field", name: "commands", static: false, private: false, access: { has: function (obj) { return "commands" in obj; }, get: function (obj) { return obj.commands; }, set: function (obj, value) { obj.commands = value; } }, metadata: _metadata }, _commands_initializers, _commands_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ElementInspectorWidget = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
    })();
    _classThis.ID = 'theia-mini-browser:element-inspector';
    _classThis.LABEL = nls_1.nls.localize('theia/mini-browser/elementInspector', 'Element Inspector');
    (function () {
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ElementInspectorWidget = _classThis;
}();
exports.ElementInspectorWidget = ElementInspectorWidget;
