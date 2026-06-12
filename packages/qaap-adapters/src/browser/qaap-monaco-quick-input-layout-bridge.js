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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QaapMonacoQuickInputLayoutBridge = void 0;
var inversify_1 = require("@theia/core/shared/inversify");
var monaco_quick_input_layout_1 = require("@theia/monaco/lib/browser/monaco-quick-input-layout");
var qaap_monaco_quick_input_adapter_1 = require("./qaap-monaco-quick-input-adapter");
var QaapMonacoQuickInputLayoutBridge = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _classSuper = monaco_quick_input_layout_1.DefaultMonacoQuickInputLayout;
    var _adapter_decorators;
    var _adapter_initializers = [];
    var _adapter_extraInitializers = [];
    var QaapMonacoQuickInputLayoutBridge = _classThis = /** @class */ (function (_super) {
        __extends(QaapMonacoQuickInputLayoutBridge_1, _super);
        function QaapMonacoQuickInputLayoutBridge_1() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.adapter = __runInitializers(_this, _adapter_initializers, void 0);
            __runInitializers(_this, _adapter_extraInitializers);
            return _this;
        }
        QaapMonacoQuickInputLayoutBridge_1.prototype.synchronize = function (shell, container) {
            var _this = this;
            this.adapter.synchronize(shell, container, function () { return _super.prototype.synchronize.call(_this, shell, container); });
        };
        return QaapMonacoQuickInputLayoutBridge_1;
    }(_classSuper));
    __setFunctionName(_classThis, "QaapMonacoQuickInputLayoutBridge");
    (function () {
        var _a;
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_a = _classSuper[Symbol.metadata]) !== null && _a !== void 0 ? _a : null) : void 0;
        _adapter_decorators = [(0, inversify_1.inject)(qaap_monaco_quick_input_adapter_1.QaapMonacoQuickInputAdapter)];
        __esDecorate(null, null, _adapter_decorators, { kind: "field", name: "adapter", static: false, private: false, access: { has: function (obj) { return "adapter" in obj; }, get: function (obj) { return obj.adapter; }, set: function (obj, value) { obj.adapter = value; } }, metadata: _metadata }, _adapter_initializers, _adapter_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QaapMonacoQuickInputLayoutBridge = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QaapMonacoQuickInputLayoutBridge = _classThis;
}();
exports.QaapMonacoQuickInputLayoutBridge = QaapMonacoQuickInputLayoutBridge;
