"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensurePreviewInspectorPanelRoot = exports.QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS = void 0;
exports.mountEmbeddedElementInspector = mountEmbeddedElementInspector;
var React = require("react");
var client_1 = require("react-dom/client");
var disposable_1 = require("@theia/core/lib/common/disposable");
var element_inspector_panel_1 = require("./element-inspector-panel");
var element_inspector_contribution_1 = require("./element-inspector-contribution");
var preview_inspector_panel_root_1 = require("./preview-inspector-panel-root");
var preview_inspector_panel_root_2 = require("./preview-inspector-panel-root");
Object.defineProperty(exports, "QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS", { enumerable: true, get: function () { return preview_inspector_panel_root_2.QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS; } });
Object.defineProperty(exports, "ensurePreviewInspectorPanelRoot", { enumerable: true, get: function () { return preview_inspector_panel_root_2.ensurePreviewInspectorPanelRoot; } });
function mountEmbeddedElementInspector(container, service, commands, toDispose) {
    if (toDispose === void 0) { toDispose = new disposable_1.DisposableCollection(); }
    container.classList.add('theia-mini-browser-inspector', 'qaap-preview-inline-inspector');
    container.hidden = true;
    container.setAttribute('role', 'complementary');
    container.setAttribute('aria-label', 'Element Inspector');
    var panelRoot = (0, preview_inspector_panel_root_1.ensurePreviewInspectorPanelRoot)(container);
    var root;
    var render = function () {
        if (!root) {
            return;
        }
        root.render(<element_inspector_panel_1.ElementInspectorPanel service={service} onCopySelector={function () { return runCommand(commands, element_inspector_contribution_1.ELEMENT_INSPECTOR_COPY_SELECTOR_COMMAND_ID); }} onAskAgent={function () { return runCommand(commands, element_inspector_contribution_1.ELEMENT_INSPECTOR_ASK_AGENT_COMMAND_ID); }} onGenerateVariant={function () { return runCommand(commands, element_inspector_contribution_1.ELEMENT_INSPECTOR_GENERATE_VARIANT_COMMAND_ID); }}/>);
    };
    root = (0, client_1.createRoot)(panelRoot);
    toDispose.push(disposable_1.Disposable.create(function () {
        root === null || root === void 0 ? void 0 : root.unmount();
        root = undefined;
    }));
    var open = false;
    var boundButton;
    var syncButtonState = function (button) {
        if (button) {
            boundButton = button;
        }
        boundButton === null || boundButton === void 0 ? void 0 : boundButton.classList.toggle('theia-mini-browser-workbench-button--active', open);
        boundButton === null || boundButton === void 0 ? void 0 : boundButton.setAttribute('aria-pressed', open ? 'true' : 'false');
    };
    var host = {
        show: function () {
            var _a;
            open = true;
            container.hidden = false;
            container.classList.add('qaap-preview-inline-inspector--open');
            (_a = container.closest('.qaap-preview-split')) === null || _a === void 0 ? void 0 : _a.classList.add('qaap-preview-split--inspector-open');
            render();
            syncButtonState();
        },
        hide: function () {
            var _a;
            open = false;
            container.hidden = true;
            container.classList.remove('qaap-preview-inline-inspector--open');
            (_a = container.closest('.qaap-preview-split')) === null || _a === void 0 ? void 0 : _a.classList.remove('qaap-preview-split--inspector-open');
            syncButtonState();
        },
        toggle: function () {
            if (open) {
                host.hide();
            }
            else {
                host.show();
            }
            return open;
        },
        isOpen: function () { return open; },
        syncButtonState: syncButtonState,
        dispose: function () {
            root === null || root === void 0 ? void 0 : root.unmount();
            root = undefined;
        },
    };
    toDispose.push(service.onDidChangeState(function () { return render(); }));
    toDispose.push(host);
    render();
    return host;
}
function runCommand(commands, commandId) {
    if (commands.isEnabled(commandId)) {
        void commands.executeCommand(commandId).catch(function () { return undefined; });
    }
}
