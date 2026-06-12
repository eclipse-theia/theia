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
exports.QaapTasksBackgroundPromptContribution = void 0;
var inversify_1 = require("@theia/core/shared/inversify");
var common_1 = require("@theia/ai-core/lib/common");
var qaap_tasks_background_prompt_template_1 = require("../common/qaap-tasks-background-prompt-template");
/**
 * Registers the Qaap "tasks background" global context as a built-in, user-editable prompt
 * fragment. It is standalone (not attached to an agent's variant set) so it surfaces in
 * AI Configuration → Prompt Fragments under its own id, where the user can edit or reset it.
 *
 * The QAIQ bridge ({@link QaapQaiqChatAgentContribution}) resolves this fragment at invoke time
 * and prepends it — together with the workspace `project-info` artifact — to the prompt it sends
 * to the cloud agent runner.
 */
var QaapTasksBackgroundPromptContribution = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _promptService_decorators;
    var _promptService_initializers = [];
    var _promptService_extraInitializers = [];
    var QaapTasksBackgroundPromptContribution = _classThis = /** @class */ (function () {
        function QaapTasksBackgroundPromptContribution_1() {
            this.promptService = __runInitializers(this, _promptService_initializers, void 0);
            __runInitializers(this, _promptService_extraInitializers);
        }
        QaapTasksBackgroundPromptContribution_1.prototype.onStart = function () {
            this.promptService.addBuiltInPromptFragment((0, qaap_tasks_background_prompt_template_1.getQaapTasksBackgroundContextFragment)());
        };
        return QaapTasksBackgroundPromptContribution_1;
    }());
    __setFunctionName(_classThis, "QaapTasksBackgroundPromptContribution");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _promptService_decorators = [(0, inversify_1.inject)(common_1.PromptService)];
        __esDecorate(null, null, _promptService_decorators, { kind: "field", name: "promptService", static: false, private: false, access: { has: function (obj) { return "promptService" in obj; }, get: function (obj) { return obj.promptService; }, set: function (obj, value) { obj.promptService = value; } }, metadata: _metadata }, _promptService_initializers, _promptService_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QaapTasksBackgroundPromptContribution = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QaapTasksBackgroundPromptContribution = _classThis;
}();
exports.QaapTasksBackgroundPromptContribution = QaapTasksBackgroundPromptContribution;
