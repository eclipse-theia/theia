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
import { DebugConfigurationManager } from './debug-configuration-manager';
import { DebugWidget } from './view/debug-widget';
import { DebugPath, DebugService } from '../common/debug-service';
import {
    WidgetFactory, WebSocketConnectionProvider, FrontendApplicationContribution,
    bindViewContribution
} from '@theia/core/lib/browser';
import { DebugSessionManager } from './debug-session-manager';
import { DebugResourceResolver } from './debug-resource';
import {
    DebugSessionContribution,
    DebugSessionFactory,
    DefaultDebugSessionFactory,
    DebugSessionContributionRegistry,
    DebugSessionContributionRegistryImpl
} from './debug-session-contribution';
import { bindContributionProvider, ResourceResolver } from '@theia/core';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DebugFrontendApplicationContribution } from './debug-frontend-application-contribution';
import { DebugConsoleContribution } from './console/debug-console-contribution';
import { BreakpointManager } from './breakpoint/breakpoint-manager';
import { DebugEditorService } from './editor/debug-editor-service';
import { DebugEditorModelFactory, DebugEditorModel } from './editor/debug-editor-model';
import { bindDebugPreferences } from './debug-preferences';
import { DebugSchemaUpdater } from './debug-schema-updater';
import { DebugCallStackItemTypeKey } from './debug-call-stack-item-type-key';
import { bindLaunchPreferences } from './preferences/launch-preferences';
import { DebugPrefixConfiguration } from './debug-prefix-configuration';
import { CommandContribution } from '@theia/core/lib/common/command';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { DebugWatchManager } from './debug-watch-manager';
import { DebugBreakpointWidget } from './editor/debug-breakpoint-widget';
import { DebugInlineValueDecorator } from './editor/debug-inline-value-decorator';
import { JsonSchemaContribution } from '@theia/core/lib/browser/json-schema-store';
import { TabBarDecorator } from '@theia/core/lib/browser/shell/tab-bar-decorator';
import { DebugTabBarDecorator } from './debug-tab-bar-decorator';
import { DebugContribution } from './debug-contribution';
import { QuickAccessContribution } from '@theia/core/lib/browser/quick-input/quick-access';
import { DebugViewModel } from './view/debug-view-model';
import { DebugToolBar } from './view/debug-toolbar-widget';
import { DebugSessionWidget } from './view/debug-session-widget';
import { bindDisassemblyView } from './disassembly-view/disassembly-view-contribution';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { ICodeEditorService } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/codeEditorService';

export default new ContainerModule((bind: interfaces.Bind) => {
    bindContributionProvider(bind, DebugContribution);

    bind(DebugCallStackItemTypeKey).toDynamicValue(({ container }) =>
        container.get<ContextKeyService>(ContextKeyService).createKey('callStackItemType', undefined)
    ).inSingletonScope();

    bindContributionProvider(bind, DebugSessionContribution);
    bind(DebugSessionFactory).to(DefaultDebugSessionFactory).inSingletonScope();
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
});
