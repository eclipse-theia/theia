"use strict";
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
Object.defineProperty(exports, "__esModule", { value: true });
require("../../src/browser/style/element-inspector.css");
var inversify_1 = require("@theia/core/shared/inversify");
var widget_manager_1 = require("@theia/core/lib/browser/widget-manager");
var view_contribution_1 = require("@theia/core/lib/browser/shell/view-contribution");
var element_inspector_service_1 = require("./element-inspector-service");
var element_inspector_widget_1 = require("./element-inspector-widget");
var element_inspector_contribution_1 = require("./element-inspector-contribution");
exports.default = new inversify_1.ContainerModule(function (bind) {
    bind(element_inspector_service_1.ElementInspectorService).toSelf().inSingletonScope();
    bind(element_inspector_widget_1.ElementInspectorWidget).toSelf();
    bind(widget_manager_1.WidgetFactory).toDynamicValue(function (_a) {
        var container = _a.container;
        return ({
            id: element_inspector_widget_1.ElementInspectorWidget.ID,
            createWidget: function () { return container.get(element_inspector_widget_1.ElementInspectorWidget); }
        });
    }).inSingletonScope();
    (0, view_contribution_1.bindViewContribution)(bind, element_inspector_contribution_1.ElementInspectorContribution);
});
