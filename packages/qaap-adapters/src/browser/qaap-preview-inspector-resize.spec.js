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
Object.defineProperty(exports, "__esModule", { value: true });
var jsdom_1 = require("@theia/core/lib/browser/test/jsdom");
var disableJSDOM = (0, jsdom_1.enableJSDOM)();
var chai_1 = require("chai");
var disposable_1 = require("@theia/core/lib/common/disposable");
var preview_inspector_panel_root_1 = require("@theia/qaap-element-inspector/lib/browser/preview-inspector-panel-root");
var qaap_preview_inspector_panel_size_1 = require("./qaap-preview-inspector-panel-size");
var qaap_preview_inspector_resize_wiring_1 = require("./qaap-preview-inspector-resize-wiring");
disableJSDOM();
describe('qaap-preview-inspector-resize', function () {
    before(function () {
        disableJSDOM = (0, jsdom_1.enableJSDOM)();
        if (typeof window.matchMedia !== 'function') {
            window.matchMedia = function () { return ({
                matches: false,
                media: '',
                onchange: null,
                addListener: function () { return undefined; },
                removeListener: function () { return undefined; },
                addEventListener: function () { return undefined; },
                removeEventListener: function () { return undefined; },
                dispatchEvent: function () { return false; },
            }); };
        }
        if (!HTMLElement.prototype.setPointerCapture) {
            HTMLElement.prototype.setPointerCapture = function () { return undefined; };
            HTMLElement.prototype.releasePointerCapture = function () { return undefined; };
        }
        if (typeof PointerEvent === 'undefined') {
            var PointerEventPolyfill = /** @class */ (function (_super) {
                __extends(PointerEventPolyfill, _super);
                function PointerEventPolyfill(type, init) {
                    if (init === void 0) { init = {}; }
                    var _a;
                    var _this = _super.call(this, type, init) || this;
                    _this.pointerId = (_a = init.pointerId) !== null && _a !== void 0 ? _a : 0;
                    return _this;
                }
                return PointerEventPolyfill;
            }(MouseEvent));
            globalThis.PointerEvent =
                PointerEventPolyfill;
        }
    });
    after(function () {
        disableJSDOM();
    });
    function createSplit() {
        var split = document.createElement('div');
        split.className = 'qaap-preview-split';
        var frameSlot = document.createElement('div');
        frameSlot.className = 'qaap-preview-frame-slot';
        var inspectorSlot = document.createElement('aside');
        inspectorSlot.className = 'qaap-preview-inspector-slot';
        split.append(frameSlot, inspectorSlot);
        document.body.append(split);
        Object.defineProperty(split, 'clientWidth', { value: 1000, configurable: true });
        Object.defineProperty(split, 'clientHeight', { value: 800, configurable: true });
        return { split: split, frameSlot: frameSlot, inspectorSlot: inspectorSlot };
    }
    it('places resize handle on the split between frame and inspector', function () {
        var _a = createSplit(), split = _a.split, frameSlot = _a.frameSlot, inspectorSlot = _a.inspectorSlot;
        var toDispose = new disposable_1.DisposableCollection();
        (0, qaap_preview_inspector_resize_wiring_1.wirePreviewInspectorResize)(split, inspectorSlot, toDispose);
        var handle = split.querySelector(":scope > .".concat(qaap_preview_inspector_resize_wiring_1.QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE));
        (0, chai_1.expect)(handle).to.exist;
        (0, chai_1.expect)(split.children.length).to.equal(3);
        (0, chai_1.expect)(split.children[0]).to.equal(frameSlot);
        (0, chai_1.expect)(split.children[1]).to.equal(handle);
        (0, chai_1.expect)(split.children[2]).to.equal(inspectorSlot);
        toDispose.dispose();
    });
    it('keeps resize handle after panel root is ensured (React mount target)', function () {
        var _a = createSplit(), split = _a.split, inspectorSlot = _a.inspectorSlot;
        var toDispose = new disposable_1.DisposableCollection();
        (0, qaap_preview_inspector_resize_wiring_1.wirePreviewInspectorResize)(split, inspectorSlot, toDispose);
        var panelRoot = (0, preview_inspector_panel_root_1.ensurePreviewInspectorPanelRoot)(inspectorSlot);
        panelRoot.innerHTML = '<div class="theia-mini-browser-inspector__root">panel</div>';
        (0, chai_1.expect)(split.querySelector(":scope > .".concat(qaap_preview_inspector_resize_wiring_1.QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE))).to.exist;
        (0, chai_1.expect)(inspectorSlot.querySelector(":scope > .".concat(preview_inspector_panel_root_1.QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS))).to.equal(panelRoot);
        toDispose.dispose();
    });
    it('updates inspector width while dragging the split handle horizontally', function () {
        var _a = createSplit(), split = _a.split, inspectorSlot = _a.inspectorSlot;
        (0, qaap_preview_inspector_panel_size_1.applyPreviewInspectorPanelSize)(inspectorSlot, split);
        var toDispose = new disposable_1.DisposableCollection();
        (0, qaap_preview_inspector_resize_wiring_1.wirePreviewInspectorResize)(split, inspectorSlot, toDispose);
        var handle = split.querySelector(":scope > .".concat(qaap_preview_inspector_resize_wiring_1.QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE));
        var startWidth = 320;
        Object.defineProperty(inspectorSlot, 'getBoundingClientRect', {
            configurable: true,
            value: function () { return ({
                width: startWidth,
                height: 400,
                top: 0,
                left: 0,
                right: startWidth,
                bottom: 400,
                x: 0,
                y: 0,
                toJSON: function () { return ({}); },
            }); },
        });
        handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 100, button: 0, pointerId: 1 }));
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 460, clientY: 100, pointerId: 1 }));
        window.dispatchEvent(new PointerEvent('pointerup', { clientX: 460, clientY: 100, pointerId: 1 }));
        var widthPx = Number.parseInt(inspectorSlot.style.width, 10);
        (0, chai_1.expect)(widthPx).to.equal(startWidth + 40);
        toDispose.dispose();
    });
    it('does not register duplicate resize handles', function () {
        var _a = createSplit(), split = _a.split, inspectorSlot = _a.inspectorSlot;
        var toDispose = new disposable_1.DisposableCollection();
        (0, qaap_preview_inspector_resize_wiring_1.wirePreviewInspectorResize)(split, inspectorSlot, toDispose);
        (0, qaap_preview_inspector_resize_wiring_1.wirePreviewInspectorResize)(split, inspectorSlot, toDispose);
        (0, chai_1.expect)(split.querySelectorAll(":scope > .".concat(qaap_preview_inspector_resize_wiring_1.QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE)).length).to.equal(1);
        toDispose.dispose();
    });
});
