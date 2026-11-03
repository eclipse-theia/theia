// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/index.css';

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { DebugConfigurationManager } from './debug-configuration-manager.js';
import { DebugWidget } from './view/debug-widget.js';
import { DebugPath, DebugService } from '../common/debug-service.js';
import {
    WidgetFactory, WebSocketConnectionProvider, FrontendApplicationContribution,
    bindViewContribution,
    OpenHandler
} from '@theia/core/lib/browser';
import { DebugSessionManager } from './debug-session-manager.js';
import { DebugResourceResolver } from './debug-resource.js';
import {
    DebugSessionContribution,
    DebugSessionFactory,
    DefaultDebugSessionFactory,
    DebugSessionContributionRegistry,
    DebugSessionContributionRegistryImpl
} from './debug-session-contribution.js';
import { bindRootContributionProvider, nls, ResourceResolver } from '@theia/core';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DebugFrontendApplicationContribution } from './debug-frontend-application-contribution.js';
import { DebugConsoleContribution } from './console/debug-console-contribution.js';
import { BreakpointManager } from './breakpoint/breakpoint-manager.js';
import { DebugEditorService } from './editor/debug-editor-service.js';
import { DebugEditorModelFactory, DebugEditorModel } from './editor/debug-editor-model.js';
import { bindDebugPreferences } from '../common/debug-preferences.js';
import { DebugSchemaUpdater } from './debug-schema-updater.js';
import { DebugCallStackItemTypeKey } from './debug-call-stack-item-type-key.js';
import { bindLaunchPreferences } from '../common/launch-preferences.js';
import { DebugPrefixConfiguration } from './debug-prefix-configuration.js';
import { CommandContribution } from '@theia/core/lib/common/command';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { DebugWatchManager } from './debug-watch-manager.js';
import { DebugExpressionProvider } from './editor/debug-expression-provider.js';
import { DebugBreakpointWidget } from './editor/debug-breakpoint-widget.js';
import { DebugInlineValueDecorator } from './editor/debug-inline-value-decorator.js';
import { JsonSchemaContribution } from '@theia/core/lib/browser/json-schema-store';
import { TabBarDecorator } from '@theia/core/lib/browser/shell/tab-bar-decorator';
import { DebugTabBarDecorator } from './debug-tab-bar-decorator.js';
import { DebugContribution } from './debug-contribution.js';
import { QuickAccessContribution } from '@theia/core/lib/browser/quick-input/quick-access';
import { DebugViewModel } from './view/debug-view-model.js';
import { DebugToolBar } from './view/debug-toolbar-widget.js';
import { DebugSessionWidget } from './view/debug-session-widget.js';
import { bindDisassemblyView } from './disassembly-view/disassembly-view-contribution.js';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices.js';
import { ICodeEditorService } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/codeEditorService.js';
import { DebugSessionConfigurationLabelProvider } from './debug-session-configuration-label-provider.js';
import { AddOrEditDataBreakpointAddress } from './breakpoint/debug-data-breakpoint-actions.js';
import { WorkspaceRestrictionContribution, WorkspaceRestriction } from '@theia/workspace/lib/browser/workspace-trust-service';
import { DebugBreakpointOpener } from './model/debug-breakpoint-opener.js';

export default new ContainerModule((bind: interfaces.Bind) => {
    bindRootContributionProvider(bind, DebugContribution);

    bind(DebugCallStackItemTypeKey).toDynamicValue(({ container }) =>
        container.get<ContextKeyService>(ContextKeyService).createKey('callStackItemType', undefined)
    ).inSingletonScope();

    bindRootContributionProvider(bind, DebugSessionContribution);
    bind(DebugSessionFactory).toDynamicValue(ctx => new DefaultDebugSessionFactory(ctx.container)).inSingletonScope();
    bind(DebugSessionManager).toSelf().inSingletonScope();

    bind(BreakpointManager).toSelf().inSingletonScope();
    bind(DebugEditorModelFactory).toDynamicValue(({ container }) => <DebugEditorModelFactory>(editor =>
        DebugEditorModel.createModel(container, editor)
    )).inSingletonScope();
    bind(DebugEditorService).toSelf().inSingletonScope().onActivation((context, service) => {
        StandaloneServices.get(ICodeEditorService).registerDecorationType('Debug breakpoint placeholder', DebugBreakpointWidget.PLACEHOLDER_DECORATION, {});
        return service;
    });

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: DebugWidget.ID,
        createWidget: () => DebugWidget.createWidget(container)
    })).inSingletonScope();
    DebugConsoleContribution.bindContribution(bind);

    bind(DebugSchemaUpdater).toSelf().inSingletonScope();
    bind(JsonSchemaContribution).toService(DebugSchemaUpdater);
    bind(DebugConfigurationManager).toSelf().inSingletonScope();

    bind(DebugInlineValueDecorator).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(DebugInlineValueDecorator);

    bind(DebugService).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, DebugPath)).inSingletonScope();
    bind(DebugResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(DebugResourceResolver);

    bindViewContribution(bind, DebugFrontendApplicationContribution);
    bind(FrontendApplicationContribution).toService(DebugFrontendApplicationContribution);
    bind(TabBarToolbarContribution).toService(DebugFrontendApplicationContribution);
    bind(ColorContribution).toService(DebugFrontendApplicationContribution);

    bind(DebugSessionContributionRegistryImpl).toSelf().inSingletonScope();
    bind(DebugSessionContributionRegistry).toService(DebugSessionContributionRegistryImpl);

    bind(DebugPrefixConfiguration).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, QuickAccessContribution]) {
        bind(identifier).toService(DebugPrefixConfiguration);
    }

    bindDebugPreferences(bind);
    bindLaunchPreferences(bind);

    bind(DebugWatchManager).toSelf().inSingletonScope();
    bind(DebugExpressionProvider).toSelf().inSingletonScope();

    bind(DebugTabBarDecorator).toSelf().inSingletonScope();
    bind(TabBarDecorator).toService(DebugTabBarDecorator);

    bind(DebugViewModel).toSelf().inSingletonScope();
    bind(DebugToolBar).toSelf().inSingletonScope();
    for (const subwidget of DebugSessionWidget.subwidgets) {
        bind(WidgetFactory).toDynamicValue(({ container }) => ({
            id: subwidget.FACTORY_ID,
            createWidget: () => subwidget.createWidget(container),
        }));
    }
    bindDisassemblyView(bind);

    bind(DebugSessionConfigurationLabelProvider).toSelf().inSingletonScope();
    bind(AddOrEditDataBreakpointAddress).toSelf().inSingletonScope();
    bind(DebugBreakpointOpener).toSelf().inSingletonScope();
    bind(OpenHandler).toService(DebugBreakpointOpener);

    bind(WorkspaceRestrictionContribution).toConstantValue({
        getRestrictions(): WorkspaceRestriction[] {
            return [{
                label: nls.localize('theia/debug/debugRestricted', 'Debugging is disabled in Restricted Mode')
            }];
        }
    });
});
