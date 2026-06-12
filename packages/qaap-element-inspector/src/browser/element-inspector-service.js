"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
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
exports.ElementInspectorService = void 0;
var inversify_1 = require("@theia/core/shared/inversify");
var event_1 = require("@theia/core/lib/common/event");
var element_inspector_types_1 = require("./element-inspector-types");
var HISTORY_LIMIT = 10;
/**
 * Shared state between the mini-browser element picker and the inspector widget.
 *
 * Knows about the iframe `Window` that owns the currently-picked node so that the inspector
 * UI can `postMessage` style mutations straight into the resident bridge running inside it.
 */
var ElementInspectorService = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var ElementInspectorService = _classThis = /** @class */ (function () {
        function ElementInspectorService_1() {
            this.onDidPickEmitter = new event_1.Emitter();
            this.onDidChangeStateEmitter = new event_1.Emitter();
            this._state = { history: [] };
        }
        Object.defineProperty(ElementInspectorService_1.prototype, "state", {
            get: function () {
                return this._state;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(ElementInspectorService_1.prototype, "onDidPick", {
            get: function () {
                return this.onDidPickEmitter.event;
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(ElementInspectorService_1.prototype, "onDidChangeState", {
            get: function () {
                return this.onDidChangeStateEmitter.event;
            },
            enumerable: false,
            configurable: true
        });
        /** Associates the picked element with the iframe `Window` that produced it. */
        ElementInspectorService_1.prototype.bind = function (target) {
            this.boundWindow = target;
        };
        ElementInspectorService_1.prototype.pick = function (element) {
            var history = __spreadArray([element], this._state.history.filter(function (item) { return item.pickedId !== element.pickedId; }), true).slice(0, HISTORY_LIMIT);
            this._state = { picked: element, history: history };
            this.onDidPickEmitter.fire(element);
            this.onDidChangeStateEmitter.fire(this._state);
        };
        /** Applies a fresh snapshot coming from the iframe bridge after a mutation. */
        ElementInspectorService_1.prototype.refreshed = function (element) {
            var current = this._state.picked;
            if (!current || current.pickedId !== element.pickedId) {
                return;
            }
            var history = this._state.history.map(function (item) { return item.pickedId === element.pickedId ? element : item; });
            this._state = { picked: element, history: history };
            this.onDidChangeStateEmitter.fire(this._state);
        };
        /** Sends a style mutation to the iframe bridge for the currently-picked element. */
        ElementInspectorService_1.prototype.updateStyle = function (property, value, important) {
            if (important === void 0) { important = false; }
            var picked = this._state.picked;
            if (!picked || !this.boundWindow)
                return;
            this.boundWindow.postMessage({
                type: element_inspector_types_1.ELEMENT_UPDATE_STYLE_TYPE,
                id: picked.pickedId,
                prop: property,
                value: value,
                important: important
            }, '*');
        };
        /** Sends a `textContent` mutation to the iframe bridge. */
        ElementInspectorService_1.prototype.updateText = function (text) {
            var picked = this._state.picked;
            if (!picked || !this.boundWindow)
                return;
            this.boundWindow.postMessage({
                type: element_inspector_types_1.ELEMENT_UPDATE_TEXT_TYPE,
                id: picked.pickedId,
                text: text
            }, '*');
        };
        /** Requests a fresh snapshot for the currently-picked element. */
        ElementInspectorService_1.prototype.requestRefresh = function () {
            var picked = this._state.picked;
            if (!picked || !this.boundWindow)
                return;
            this.boundWindow.postMessage({
                type: element_inspector_types_1.ELEMENT_REFRESH_REQUEST_TYPE,
                id: picked.pickedId
            }, '*');
        };
        ElementInspectorService_1.prototype.clear = function () {
            if (!this._state.picked && this._state.history.length === 0) {
                return;
            }
            this._state = { history: [] };
            this.boundWindow = undefined;
            this.onDidChangeStateEmitter.fire(this._state);
        };
        return ElementInspectorService_1;
    }());
    __setFunctionName(_classThis, "ElementInspectorService");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ElementInspectorService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ElementInspectorService = _classThis;
}();
exports.ElementInspectorService = ElementInspectorService;
