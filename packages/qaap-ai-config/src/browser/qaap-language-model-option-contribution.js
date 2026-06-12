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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QaapLanguageModelOptionContribution = void 0;
var React = require("@theia/core/shared/react");
var inversify_1 = require("@theia/core/shared/inversify");
var core_1 = require("@theia/core");
var common_1 = require("@theia/qaap-ai-nvidia/lib/common");
var common_2 = require("@theia/qaap-ai-openrouter/lib/common");
var QaapLanguageModelOptionContribution = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var QaapLanguageModelOptionContribution = _classThis = /** @class */ (function () {
        function QaapLanguageModelOptionContribution_1() {
        }
        QaapLanguageModelOptionContribution_1.prototype.decorateLanguageModelOption = function (model) {
            if (!(0, common_1.isFreeNvidiaModelId)(model.id) && !(0, common_2.isFreeOpenRouterModelId)(model.id)) {
                return undefined;
            }
            var badgeLabel = core_1.nls.localize('theia/qaap/ai/core/languageModelRenderer/freeModelBadge', 'Free');
            var title = core_1.nls.localize('theia/qaap/ai/core/languageModelRenderer/freeModelTooltip', 'Free-tier model — NVIDIA NIM (build.nvidia.com) or OpenRouter (slug ending with `:free`). Usable at no cost with a free provider account.');
            return {
                labelSuffix: "  \uD83C\uDD93 ".concat(badgeLabel),
                title: title,
                inlineBadge: <span className="ai-model-free-badge" title={title}>🆓 {badgeLabel}</span>
            };
        };
        return QaapLanguageModelOptionContribution_1;
    }());
    __setFunctionName(_classThis, "QaapLanguageModelOptionContribution");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QaapLanguageModelOptionContribution = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QaapLanguageModelOptionContribution = _classThis;
}();
exports.QaapLanguageModelOptionContribution = QaapLanguageModelOptionContribution;
