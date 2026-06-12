"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultQaapMonacoQuickInputAdapter = void 0;
var inversify_1 = require("@theia/core/shared/inversify");
var mobile_layout_state_1 = require("@theia/core/lib/browser/shell/mobile-layout-state");
var DefaultQaapMonacoQuickInputAdapter = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var DefaultQaapMonacoQuickInputAdapter = _classThis = /** @class */ (function () {
        function DefaultQaapMonacoQuickInputAdapter_1() {
        }
        DefaultQaapMonacoQuickInputAdapter_1.prototype.synchronize = function (shell, container, defaultSync) {
            var _this = this;
            document.body.appendChild(container);
            var mobile = (0, mobile_layout_state_1.matchesMobileOneColumnLayout)()
                || shell.node.classList.contains(mobile_layout_state_1.MOBILE_ONE_COLUMN_LAYOUT_CLASS);
            if (mobile) {
                this.stabilizeMobileLayout(container);
                queueMicrotask(function () {
                    _this.stabilizeMobileLayout(container);
                    requestAnimationFrame(function () { return _this.stabilizeMobileLayout(container); });
                });
            }
            else {
                defaultSync();
            }
        };
        DefaultQaapMonacoQuickInputAdapter_1.prototype.stabilizeMobileLayout = function (container) {
            this.clearMobileInlineStyles(container);
        };
        DefaultQaapMonacoQuickInputAdapter_1.prototype.clearMobileInlineStyles = function (container) {
            container.style.removeProperty('top');
            container.style.removeProperty('left');
            container.style.removeProperty('width');
            var inner = container.querySelector('.quick-input-widget');
            if (inner) {
                inner.style.removeProperty('top');
                inner.style.removeProperty('left');
                inner.style.removeProperty('width');
                inner.style.removeProperty('transform');
            }
        };
        return DefaultQaapMonacoQuickInputAdapter_1;
    }());
    __setFunctionName(_classThis, "DefaultQaapMonacoQuickInputAdapter");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        DefaultQaapMonacoQuickInputAdapter = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return DefaultQaapMonacoQuickInputAdapter = _classThis;
}();
exports.DefaultQaapMonacoQuickInputAdapter = DefaultQaapMonacoQuickInputAdapter;
