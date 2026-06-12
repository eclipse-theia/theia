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
exports.QaapPreviewSurfaceRegistry = void 0;
exports.findQaapMiniBrowserContentFromWidgets = findQaapMiniBrowserContentFromWidgets;
var inversify_1 = require("@theia/core/shared/inversify");
var disposable_1 = require("@theia/core/lib/common/disposable");
var mini_browser_1 = require("@theia/mini-browser/lib/browser/mini-browser");
var qaap_mini_browser_content_1 = require("./qaap-mini-browser-content");
var qaap_preview_frame_picker_1 = require("./qaap-preview-frame-picker");
var QaapPreviewSurfaceRegistry = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _pickerFactory_decorators;
    var _pickerFactory_initializers = [];
    var _pickerFactory_extraInitializers = [];
    var QaapPreviewSurfaceRegistry = _classThis = /** @class */ (function () {
        function QaapPreviewSurfaceRegistry_1() {
            this.pickerFactory = __runInitializers(this, _pickerFactory_initializers, void 0);
            this.surfaces = (__runInitializers(this, _pickerFactory_extraInitializers), []);
        }
        QaapPreviewSurfaceRegistry_1.prototype.registerEmbedded = function (frame, toDispose) {
            var picker = this.pickerFactory.create(frame, toDispose);
            return this.registerSurface(frame, picker, toDispose);
        };
        QaapPreviewSurfaceRegistry_1.prototype.registerMiniBrowserContent = function (content, toDispose) {
            var frame = content.previewFrame;
            var picker = content.getPreviewFramePicker();
            var handle = this.registerSurface(frame, picker, toDispose);
            return {
                frame: handle.frame,
                picker: handle.picker,
                isConnected: function () { return content.node.isConnected; },
            };
        };
        QaapPreviewSurfaceRegistry_1.prototype.registerSurface = function (frame, picker, toDispose) {
            var _this = this;
            var handle = {
                frame: frame,
                picker: picker,
                isConnected: function () { return frame.isConnected; },
            };
            this.surfaces.push(handle);
            toDispose.push(disposable_1.Disposable.create(function () { return _this.removeSurface(handle); }));
            return handle;
        };
        QaapPreviewSurfaceRegistry_1.prototype.hasActiveSurface = function () {
            return this.getActiveSurface() !== undefined;
        };
        QaapPreviewSurfaceRegistry_1.prototype.getActiveSurface = function () {
            var connected = this.surfaces.filter(function (surface) { return surface.isConnected(); });
            if (connected.length) {
                return connected[connected.length - 1];
            }
            return undefined;
        };
        QaapPreviewSurfaceRegistry_1.prototype.activateElementPicker = function () {
            var surface = this.getActiveSurface();
            if (!surface) {
                return {
                    started: false,
                    message: 'No preview open. Open a dev preview first, then pick an element.',
                };
            }
            surface.picker.startElementPicker();
            return {
                started: true,
                message: 'Element picker active — click an element in the preview.',
            };
        };
        QaapPreviewSurfaceRegistry_1.prototype.toggleElementInspector = function () {
            return __awaiter(this, void 0, void 0, function () {
                var surface;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            surface = this.getActiveSurface();
                            if (!surface) return [3 /*break*/, 2];
                            return [4 /*yield*/, surface.picker.openElementInspector()];
                        case 1:
                            _a.sent();
                            _a.label = 2;
                        case 2: return [2 /*return*/];
                    }
                });
            });
        };
        QaapPreviewSurfaceRegistry_1.prototype.removeSurface = function (handle) {
            var index = this.surfaces.indexOf(handle);
            if (index >= 0) {
                this.surfaces.splice(index, 1);
            }
        };
        return QaapPreviewSurfaceRegistry_1;
    }());
    __setFunctionName(_classThis, "QaapPreviewSurfaceRegistry");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _pickerFactory_decorators = [(0, inversify_1.inject)(qaap_preview_frame_picker_1.QaapPreviewFramePickerFactory)];
        __esDecorate(null, null, _pickerFactory_decorators, { kind: "field", name: "pickerFactory", static: false, private: false, access: { has: function (obj) { return "pickerFactory" in obj; }, get: function (obj) { return obj.pickerFactory; }, set: function (obj, value) { obj.pickerFactory = value; } }, metadata: _metadata }, _pickerFactory_initializers, _pickerFactory_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QaapPreviewSurfaceRegistry = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QaapPreviewSurfaceRegistry = _classThis;
}();
exports.QaapPreviewSurfaceRegistry = QaapPreviewSurfaceRegistry;
function findQaapMiniBrowserContentFromWidgets(widgets) {
    for (var _i = 0, widgets_1 = widgets; _i < widgets_1.length; _i++) {
        var widget = widgets_1[_i];
        if (!(widget instanceof mini_browser_1.MiniBrowser)) {
            continue;
        }
        var child = widget.layout.widgets[0];
        if (child instanceof qaap_mini_browser_content_1.QaapMiniBrowserContent) {
            return child;
        }
    }
    return undefined;
}
