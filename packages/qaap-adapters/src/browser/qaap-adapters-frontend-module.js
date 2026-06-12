"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
require("../../src/browser/style/qaap-mini-browser-content.css");
require("../../src/browser/style/qaap-agent-preview-chrome.css");
var common_1 = require("@theia/ai-core/lib/common");
var inversify_1 = require("@theia/core/shared/inversify");
var command_1 = require("@theia/core/lib/common/command");
var browser_1 = require("@theia/core/lib/browser");
var mini_browser_open_hook_1 = require("@theia/mini-browser/lib/browser/mini-browser-open-hook");
var mini_browser_open_handler_1 = require("@theia/mini-browser/lib/browser/mini-browser-open-handler");
var monaco_quick_input_layout_1 = require("@theia/monaco/lib/browser/monaco-quick-input-layout");
var mini_browser_content_1 = require("@theia/mini-browser/lib/browser/mini-browser-content");
var qaap_mini_browser_content_1 = require("./qaap-mini-browser-content");
var qaap_mini_browser_open_handler_1 = require("./qaap-mini-browser-open-handler");
var default_qaap_mini_browser_lifecycle_1 = require("./default-qaap-mini-browser-lifecycle");
var default_qaap_monaco_quick_input_adapter_1 = require("./default-qaap-monaco-quick-input-adapter");
var qaap_mini_browser_lifecycle_1 = require("./qaap-mini-browser-lifecycle");
var qaap_mini_browser_open_hook_bridge_1 = require("./qaap-mini-browser-open-hook-bridge");
var qaap_monaco_quick_input_adapter_1 = require("./qaap-monaco-quick-input-adapter");
var qaap_monaco_quick_input_layout_bridge_1 = require("./qaap-monaco-quick-input-layout-bridge");
var qaap_mobile_quick_input_contribution_1 = require("./qaap-mobile-quick-input-contribution");
var qaap_element_picker_command_contribution_1 = require("./qaap-element-picker-command-contribution");
var qaap_element_picker_service_1 = require("./qaap-element-picker-service");
var qaap_element_picker_tool_provider_1 = require("./qaap-element-picker-tool-provider");
var qaap_preview_frame_picker_1 = require("./qaap-preview-frame-picker");
var qaap_preview_surface_registry_1 = require("./qaap-preview-surface-registry");
exports.default = new inversify_1.ContainerModule(function (bind, _unbind, isBound, rebind) {
    bind(default_qaap_mini_browser_lifecycle_1.DefaultQaapMiniBrowserLifecycle).toSelf().inSingletonScope();
    bind(qaap_mini_browser_lifecycle_1.QaapMiniBrowserLifecycle).toService(default_qaap_mini_browser_lifecycle_1.DefaultQaapMiniBrowserLifecycle);
    bind(default_qaap_monaco_quick_input_adapter_1.DefaultQaapMonacoQuickInputAdapter).toSelf().inSingletonScope();
    bind(qaap_monaco_quick_input_adapter_1.QaapMonacoQuickInputAdapter).toService(default_qaap_monaco_quick_input_adapter_1.DefaultQaapMonacoQuickInputAdapter);
    bind(qaap_mini_browser_open_hook_bridge_1.QaapMiniBrowserOpenHookBridge).toSelf().inSingletonScope();
    bind(qaap_monaco_quick_input_layout_bridge_1.QaapMonacoQuickInputLayoutBridge).toSelf().inSingletonScope();
    bind(qaap_mobile_quick_input_contribution_1.QaapMobileQuickInputContribution).toSelf().inSingletonScope();
    bind(browser_1.FrontendApplicationContribution).toService(qaap_mobile_quick_input_contribution_1.QaapMobileQuickInputContribution);
    if (!isBound(mini_browser_open_hook_1.MiniBrowserOpenHook)) {
        bind(mini_browser_open_hook_1.DefaultMiniBrowserOpenHook).toSelf().inSingletonScope();
        bind(mini_browser_open_hook_1.MiniBrowserOpenHook).toService(mini_browser_open_hook_1.DefaultMiniBrowserOpenHook);
    }
    rebind(mini_browser_open_hook_1.MiniBrowserOpenHook).to(qaap_mini_browser_open_hook_bridge_1.QaapMiniBrowserOpenHookBridge).inSingletonScope();
    if (isBound(monaco_quick_input_layout_1.MonacoQuickInputLayout)) {
        rebind(monaco_quick_input_layout_1.MonacoQuickInputLayout).to(qaap_monaco_quick_input_layout_bridge_1.QaapMonacoQuickInputLayoutBridge).inSingletonScope();
    }
    bind(qaap_mini_browser_content_1.QaapMiniBrowserContent).toSelf();
    rebind(mini_browser_content_1.MiniBrowserContent).to(qaap_mini_browser_content_1.QaapMiniBrowserContent);
    bind(qaap_mini_browser_open_handler_1.QaapMiniBrowserOpenHandler).toSelf().inSingletonScope();
    rebind(mini_browser_open_handler_1.MiniBrowserOpenHandler).toService(qaap_mini_browser_open_handler_1.QaapMiniBrowserOpenHandler);
    bind(qaap_preview_frame_picker_1.QaapPreviewFramePickerFactory).toSelf().inSingletonScope();
    bind(qaap_preview_surface_registry_1.QaapPreviewSurfaceRegistry).toSelf().inSingletonScope();
    bind(qaap_element_picker_service_1.QaapElementPickerService).toSelf().inSingletonScope();
    bind(qaap_element_picker_command_contribution_1.QaapElementPickerCommandContribution).toSelf().inSingletonScope();
    bind(command_1.CommandContribution).toService(qaap_element_picker_command_contribution_1.QaapElementPickerCommandContribution);
    (0, common_1.bindToolProvider)(qaap_element_picker_tool_provider_1.QaapPickElementTool, bind);
});
