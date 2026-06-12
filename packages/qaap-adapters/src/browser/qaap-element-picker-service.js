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
exports.QaapElementPickerService = void 0;
var inversify_1 = require("@theia/core/shared/inversify");
var browser_1 = require("@theia/core/lib/browser");
var disposable_1 = require("@theia/core/lib/common/disposable");
var mini_browser_1 = require("@theia/mini-browser/lib/browser/mini-browser");
var element_inspector_service_1 = require("@theia/qaap-element-inspector/lib/browser/element-inspector-service");
var element_inspector_types_1 = require("@theia/qaap-element-inspector/lib/browser/element-inspector-types");
var qaap_mini_browser_content_1 = require("./qaap-mini-browser-content");
var qaap_preview_surface_registry_1 = require("./qaap-preview-surface-registry");
var DEFAULT_PICK_TIMEOUT_MS = 120000;
var QaapElementPickerService = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _shell_decorators;
    var _shell_initializers = [];
    var _shell_extraInitializers = [];
    var _widgetManager_decorators;
    var _widgetManager_initializers = [];
    var _widgetManager_extraInitializers = [];
    var _inspector_decorators;
    var _inspector_initializers = [];
    var _inspector_extraInitializers = [];
    var _previewSurfaces_decorators;
    var _previewSurfaces_initializers = [];
    var _previewSurfaces_extraInitializers = [];
    var QaapElementPickerService = _classThis = /** @class */ (function () {
        function QaapElementPickerService_1() {
            this.shell = __runInitializers(this, _shell_initializers, void 0);
            this.widgetManager = (__runInitializers(this, _shell_extraInitializers), __runInitializers(this, _widgetManager_initializers, void 0));
            this.inspector = (__runInitializers(this, _widgetManager_extraInitializers), __runInitializers(this, _inspector_initializers, void 0));
            this.previewSurfaces = (__runInitializers(this, _inspector_extraInitializers), __runInitializers(this, _previewSurfaces_initializers, void 0));
            __runInitializers(this, _previewSurfaces_extraInitializers);
        }
        /** True when a preview surface exists (mini-browser tab or embedded transcript preview). */
        QaapElementPickerService_1.prototype.hasPreviewTab = function () {
            return this.previewSurfaces.hasActiveSurface() || this.findPreviewContent() !== undefined;
        };
        /** Activates the picker on the active embedded or mini-browser preview. */
        QaapElementPickerService_1.prototype.activatePicker = function () {
            if (this.previewSurfaces.hasActiveSurface()) {
                return this.previewSurfaces.activateElementPicker();
            }
            var content = this.findPreviewContent();
            if (!content) {
                return {
                    started: false,
                    message: 'No preview open. Open a dev preview first, then pick an element.',
                };
            }
            content.startElementPicker();
            return { started: true, message: 'Element picker active — click an element in the preview.' };
        };
        /**
         * Starts the picker and resolves when the user picks an element, cancels, or the timeout elapses.
         */
        QaapElementPickerService_1.prototype.pickElement = function () {
            return __awaiter(this, arguments, void 0, function (timeoutMs) {
                var activation;
                var _this = this;
                if (timeoutMs === void 0) { timeoutMs = DEFAULT_PICK_TIMEOUT_MS; }
                return __generator(this, function (_a) {
                    activation = this.activatePicker();
                    if (!activation.started) {
                        return [2 /*return*/, { error: activation.message }];
                    }
                    return [2 /*return*/, new Promise(function (resolve) {
                            var toDispose = new disposable_1.DisposableCollection();
                            var finish = function (result) {
                                toDispose.dispose();
                                resolve(result);
                            };
                            toDispose.push(_this.inspector.onDidPick(function (element) {
                                finish({ picked: _this.summarize(element), message: activation.message });
                            }));
                            var onCancel = function (event) {
                                if (!event.data || typeof event.data !== 'object') {
                                    return;
                                }
                                var data = event.data;
                                if (data.type === element_inspector_types_1.ELEMENT_PICKER_CANCEL_TYPE) {
                                    finish({ cancelled: true, message: 'Element pick cancelled.' });
                                }
                            };
                            window.addEventListener('message', onCancel);
                            toDispose.push({ dispose: function () { return window.removeEventListener('message', onCancel); } });
                            var timer = window.setTimeout(function () {
                                finish({ error: "Timed out after ".concat(timeoutMs, "ms waiting for an element pick.") });
                            }, timeoutMs);
                            toDispose.push({ dispose: function () { return window.clearTimeout(timer); } });
                        })];
                });
            });
        };
        QaapElementPickerService_1.prototype.findPreviewContent = function () {
            var fromActive = this.contentFromWidget(this.shell.activeWidget);
            if (fromActive) {
                return fromActive;
            }
            for (var _i = 0, _a = this.widgetManager.getWidgets(mini_browser_1.MiniBrowser.ID); _i < _a.length; _i++) {
                var widget = _a[_i];
                var content = this.contentFromWidget(widget);
                if (content) {
                    return content;
                }
            }
            return undefined;
        };
        QaapElementPickerService_1.prototype.contentFromWidget = function (widget) {
            if (!(widget instanceof mini_browser_1.MiniBrowser)) {
                return undefined;
            }
            var child = widget.layout.widgets[0];
            return child instanceof qaap_mini_browser_content_1.QaapMiniBrowserContent ? child : undefined;
        };
        QaapElementPickerService_1.prototype.summarize = function (element) {
            return {
                pickedId: element.pickedId,
                tagName: element.tagName,
                id: element.id,
                classes: element.classes,
                domPath: element.domPath,
                outerHTML: element.outerHTML,
                textPreview: element.textPreview,
                pageUrl: element.pageUrl,
                position: element.position,
            };
        };
        return QaapElementPickerService_1;
    }());
    __setFunctionName(_classThis, "QaapElementPickerService");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _shell_decorators = [(0, inversify_1.inject)(browser_1.ApplicationShell)];
        _widgetManager_decorators = [(0, inversify_1.inject)(browser_1.WidgetManager)];
        _inspector_decorators = [(0, inversify_1.inject)(element_inspector_service_1.ElementInspectorService)];
        _previewSurfaces_decorators = [(0, inversify_1.inject)(qaap_preview_surface_registry_1.QaapPreviewSurfaceRegistry)];
        __esDecorate(null, null, _shell_decorators, { kind: "field", name: "shell", static: false, private: false, access: { has: function (obj) { return "shell" in obj; }, get: function (obj) { return obj.shell; }, set: function (obj, value) { obj.shell = value; } }, metadata: _metadata }, _shell_initializers, _shell_extraInitializers);
        __esDecorate(null, null, _widgetManager_decorators, { kind: "field", name: "widgetManager", static: false, private: false, access: { has: function (obj) { return "widgetManager" in obj; }, get: function (obj) { return obj.widgetManager; }, set: function (obj, value) { obj.widgetManager = value; } }, metadata: _metadata }, _widgetManager_initializers, _widgetManager_extraInitializers);
        __esDecorate(null, null, _inspector_decorators, { kind: "field", name: "inspector", static: false, private: false, access: { has: function (obj) { return "inspector" in obj; }, get: function (obj) { return obj.inspector; }, set: function (obj, value) { obj.inspector = value; } }, metadata: _metadata }, _inspector_initializers, _inspector_extraInitializers);
        __esDecorate(null, null, _previewSurfaces_decorators, { kind: "field", name: "previewSurfaces", static: false, private: false, access: { has: function (obj) { return "previewSurfaces" in obj; }, get: function (obj) { return obj.previewSurfaces; }, set: function (obj, value) { obj.previewSurfaces = value; } }, metadata: _metadata }, _previewSurfaces_initializers, _previewSurfaces_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QaapElementPickerService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QaapElementPickerService = _classThis;
}();
exports.QaapElementPickerService = QaapElementPickerService;
