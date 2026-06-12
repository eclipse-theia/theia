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
exports.QaapMobileQuickInputContribution = void 0;
var inversify_1 = require("@theia/core/shared/inversify");
var shell_1 = require("@theia/core/lib/browser/shell");
var disposable_1 = require("@theia/core/lib/common/disposable");
var mobile_layout_state_1 = require("@theia/core/lib/browser/shell/mobile-layout-state");
var monaco_quick_input_service_1 = require("@theia/monaco/lib/browser/monaco-quick-input-service");
var qaap_monaco_quick_input_adapter_1 = require("./qaap-monaco-quick-input-adapter");
/**
 * Mobile Quick Input: transient blur when the OS keyboard opens must not close the widget;
 * taps outside must dismiss. No programmatic refocus (that loops the keyboard on iOS/Android).
 */
var QaapMobileQuickInputContribution = function () {
    var _classDecorators = [(0, inversify_1.injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _quickInput_decorators;
    var _quickInput_initializers = [];
    var _quickInput_extraInitializers = [];
    var _shell_decorators;
    var _shell_initializers = [];
    var _shell_extraInitializers = [];
    var _quickInputAdapter_decorators;
    var _quickInputAdapter_initializers = [];
    var _quickInputAdapter_extraInitializers = [];
    var QaapMobileQuickInputContribution = _classThis = /** @class */ (function () {
        function QaapMobileQuickInputContribution_1() {
            this.quickInput = __runInitializers(this, _quickInput_initializers, void 0);
            this.shell = (__runInitializers(this, _quickInput_extraInitializers), __runInitializers(this, _shell_initializers, void 0));
            this.quickInputAdapter = (__runInitializers(this, _shell_extraInitializers), __runInitializers(this, _quickInputAdapter_initializers, void 0));
            this.sessionDispose = (__runInitializers(this, _quickInputAdapter_extraInitializers), new disposable_1.DisposableCollection());
            this.quickInputSessionOpen = false;
            this.dismissRequested = false;
            this.layoutStabilizeRaf = 0;
        }
        QaapMobileQuickInputContribution_1.prototype.onStart = function () {
            var _this = this;
            this.patchControllerIgnoreFocusOut();
            this.quickInput.onShow(function () { return _this.onQuickInputShow(); });
            this.quickInput.onHide(function () { return _this.onQuickInputHide(); });
        };
        QaapMobileQuickInputContribution_1.prototype.onQuickInputShow = function () {
            if (!this.isMobileQuickInputContext()) {
                return;
            }
            this.quickInputSessionOpen = true;
            this.dismissRequested = false;
            this.sessionDispose.dispose();
            this.sessionDispose = new disposable_1.DisposableCollection();
            this.applyMobileQuickInputFocusOut();
            this.ensureBackdrop();
            this.installSessionListeners();
        };
        QaapMobileQuickInputContribution_1.prototype.onQuickInputHide = function () {
            this.quickInputSessionOpen = false;
            this.dismissRequested = false;
            this.removeBackdrop();
            this.sessionDispose.dispose();
            this.sessionDispose = new disposable_1.DisposableCollection();
        };
        QaapMobileQuickInputContribution_1.prototype.installSessionListeners = function () {
            var _this = this;
            var container = document.getElementById('quick-input-container');
            if (!container) {
                return;
            }
            this.installLayoutStabilizer(container);
            var onOutsidePointer = function (e) { return _this.onOutsidePointer(e); };
            document.addEventListener('pointerdown', onOutsidePointer, true);
            this.sessionDispose.push(disposable_1.Disposable.create(function () { return document.removeEventListener('pointerdown', onOutsidePointer, true); }));
            this.sessionDispose.push(disposable_1.Disposable.create(function () {
                var _a;
                if (_this.layoutStabilizeRaf) {
                    cancelAnimationFrame(_this.layoutStabilizeRaf);
                    _this.layoutStabilizeRaf = 0;
                }
                (_a = _this.layoutObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
                _this.layoutObserver = undefined;
            }));
        };
        QaapMobileQuickInputContribution_1.prototype.onOutsidePointer = function (event) {
            if (!this.quickInputSessionOpen) {
                return;
            }
            var container = document.getElementById('quick-input-container');
            if (!container) {
                return;
            }
            var target = event.target;
            if (target instanceof Node && container.contains(target)) {
                this.dismissRequested = false;
                return;
            }
            this.requestDismiss();
        };
        QaapMobileQuickInputContribution_1.prototype.requestDismiss = function () {
            if (!this.quickInputSessionOpen) {
                return;
            }
            this.dismissRequested = true;
            this.quickInput.hide();
        };
        QaapMobileQuickInputContribution_1.prototype.ensureBackdrop = function () {
            var _this = this;
            this.removeBackdrop();
            var backdrop = document.createElement('div');
            backdrop.className = 'theia-mobile-quick-input-backdrop';
            backdrop.setAttribute('aria-hidden', 'true');
            var dismiss = function () { return _this.requestDismiss(); };
            backdrop.addEventListener('pointerdown', dismiss);
            backdrop.addEventListener('click', dismiss);
            var container = document.getElementById('quick-input-container');
            if (container === null || container === void 0 ? void 0 : container.parentElement) {
                container.parentElement.insertBefore(backdrop, container);
            }
            else {
                document.body.appendChild(backdrop);
            }
            this.backdrop = backdrop;
            requestAnimationFrame(function () { return backdrop.classList.add('theia-mod-visible'); });
        };
        QaapMobileQuickInputContribution_1.prototype.removeBackdrop = function () {
            var _a;
            if ((_a = this.backdrop) === null || _a === void 0 ? void 0 : _a.parentElement) {
                this.backdrop.parentElement.removeChild(this.backdrop);
            }
            this.backdrop = undefined;
        };
        /**
         * Monaco `QuickInputController#updateLayout` runs on every window resize (keyboard) and
         * re-applies desktop geometry. Clear it on the next frame without refocusing the filter.
         */
        QaapMobileQuickInputContribution_1.prototype.installLayoutStabilizer = function (container) {
            var _this = this;
            var scheduleStabilize = function () {
                if (!_this.quickInputSessionOpen || !_this.isMobileQuickInputContext()) {
                    return;
                }
                if (_this.layoutStabilizeRaf) {
                    cancelAnimationFrame(_this.layoutStabilizeRaf);
                }
                _this.layoutStabilizeRaf = requestAnimationFrame(function () {
                    _this.layoutStabilizeRaf = 0;
                    _this.quickInputAdapter.stabilizeMobileLayout(container);
                });
            };
            scheduleStabilize();
            this.layoutObserver = new MutationObserver(scheduleStabilize);
            this.layoutObserver.observe(container, { attributes: true, attributeFilter: ['style'] });
            var inner = container.querySelector('.quick-input-widget');
            if (inner) {
                this.layoutObserver.observe(inner, { attributes: true, attributeFilter: ['style'] });
            }
            var onResize = function () { return scheduleStabilize(); };
            window.addEventListener('resize', onResize);
            var vv = window.visualViewport;
            if (vv) {
                vv.addEventListener('resize', onResize);
                this.sessionDispose.push(disposable_1.Disposable.create(function () { return vv.removeEventListener('resize', onResize); }));
            }
            this.sessionDispose.push(disposable_1.Disposable.create(function () { return window.removeEventListener('resize', onResize); }));
        };
        QaapMobileQuickInputContribution_1.prototype.patchControllerIgnoreFocusOut = function () {
            var _this = this;
            var host = this.quickInput.controller;
            var original = host.options.ignoreFocusOut;
            host.options.ignoreFocusOut = function () {
                if (!_this.isMobileQuickInputContext()) {
                    return original();
                }
                if (_this.dismissRequested) {
                    return false;
                }
                return _this.quickInputSessionOpen;
            };
        };
        QaapMobileQuickInputContribution_1.prototype.applyMobileQuickInputFocusOut = function () {
            var _a, _b;
            if (!this.isMobileQuickInputContext()) {
                return;
            }
            var ui = (_b = (_a = this.quickInput.controller).getUI) === null || _b === void 0 ? void 0 : _b.call(_a);
            if (ui) {
                ui.ignoreFocusOut = true;
            }
        };
        QaapMobileQuickInputContribution_1.prototype.isMobileQuickInputContext = function () {
            return (0, mobile_layout_state_1.matchesMobileOneColumnLayout)()
                || this.shell.node.classList.contains(mobile_layout_state_1.MOBILE_ONE_COLUMN_LAYOUT_CLASS);
        };
        return QaapMobileQuickInputContribution_1;
    }());
    __setFunctionName(_classThis, "QaapMobileQuickInputContribution");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _quickInput_decorators = [(0, inversify_1.inject)(monaco_quick_input_service_1.MonacoQuickInputImplementation)];
        _shell_decorators = [(0, inversify_1.inject)(shell_1.ApplicationShell)];
        _quickInputAdapter_decorators = [(0, inversify_1.inject)(qaap_monaco_quick_input_adapter_1.QaapMonacoQuickInputAdapter)];
        __esDecorate(null, null, _quickInput_decorators, { kind: "field", name: "quickInput", static: false, private: false, access: { has: function (obj) { return "quickInput" in obj; }, get: function (obj) { return obj.quickInput; }, set: function (obj, value) { obj.quickInput = value; } }, metadata: _metadata }, _quickInput_initializers, _quickInput_extraInitializers);
        __esDecorate(null, null, _shell_decorators, { kind: "field", name: "shell", static: false, private: false, access: { has: function (obj) { return "shell" in obj; }, get: function (obj) { return obj.shell; }, set: function (obj, value) { obj.shell = value; } }, metadata: _metadata }, _shell_initializers, _shell_extraInitializers);
        __esDecorate(null, null, _quickInputAdapter_decorators, { kind: "field", name: "quickInputAdapter", static: false, private: false, access: { has: function (obj) { return "quickInputAdapter" in obj; }, get: function (obj) { return obj.quickInputAdapter; }, set: function (obj, value) { obj.quickInputAdapter = value; } }, metadata: _metadata }, _quickInputAdapter_initializers, _quickInputAdapter_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QaapMobileQuickInputContribution = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QaapMobileQuickInputContribution = _classThis;
}();
exports.QaapMobileQuickInputContribution = QaapMobileQuickInputContribution;
