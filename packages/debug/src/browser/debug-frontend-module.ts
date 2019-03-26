/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { ContainerModule, interfaces } from 'inversify';
import { DebugConfigurationManager } from './debug-configuration-manager';
import { DebugWidget } from './view/debug-widget';
import { DebugPath, DebugService } from '../common/debug-service';
import { WidgetFactory, WebSocketConnectionProvider, FrontendApplicationContribution, bindViewContribution, KeybindingContext, PreferenceScope } from '@theia/core/lib/browser';
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
import { DebugViewOptions } from './view/debug-view-model';
import { DebugSessionWidget, DebugSessionWidgetFactory } from './view/debug-session-widget';
import { InDebugModeContext, BreakpointWidgetInputFocusContext, BreakpointWidgetInputStrictFocusContext } from './debug-keybinding-contexts';
import { DebugEditorModelFactory, DebugEditorModel } from './editor/debug-editor-model';
import './debug-monaco-contribution';
import { bindDebugPreferences } from './debug-preferences';
import { DebugSchemaUpdater } from './debug-schema-updater';
import { DebugCallStackItemTypeKey } from './debug-call-stack-item-type-key';
import { LaunchProviderProvider, LaunchPreferenceProvider } from './abstract-launch-preference-provider';
import { WorkspaceLaunchProvider } from './workspace-launch-provider';
import { UserLaunchProvider } from './user-launch-provider';
import { FoldersLaunchProvider } from './folders-launch-provider';

export default new ContainerModule((bind: interfaces.Bind) => {
    bind(DebugCallStackItemTypeKey).toDynamicValue(({ container }) =>
        container.get(ContextKeyService).createKey('callStackItemType', undefined)
    ).inSingletonScope();

    bindContributionProvider(bind, DebugSessionContribution);
    bind(DebugSessionFactory).to(DefaultDebugSessionFactory).inSingletonScope();
    bind(DebugSessionManager).toSelf().inSingletonScope();

    bind(BreakpointManager).toSelf().inSingletonScope();
    bind(DebugEditorModelFactory).toDynamicValue(({ container }) => <DebugEditorModelFactory>(editor =>
        DebugEditorModel.createModel(container, editor)
    )).inSingletonScope();
    bind(DebugEditorService).toSelf().inSingletonScope();

    bind(DebugSessionWidgetFactory).toDynamicValue(({ container }) =>
        (options: DebugViewOptions) => DebugSessionWidget.createWidget(container, options)
    ).inSingletonScope();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: DebugWidget.ID,
        createWidget: () => DebugWidget.createWidget(container)
    })).inSingletonScope();
    DebugConsoleContribution.bindContribution(bind);

    bind(DebugSchemaUpdater).toSelf().inSingletonScope();
    bind(DebugConfigurationManager).toSelf().inSingletonScope();

    bind(DebugService).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, DebugPath)).inSingletonScope();
    bind(DebugResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(DebugResourceResolver);

    bind(KeybindingContext).to(InDebugModeContext).inSingletonScope();
    bind(KeybindingContext).to(BreakpointWidgetInputFocusContext).inSingletonScope();
    bind(KeybindingContext).to(BreakpointWidgetInputStrictFocusContext).inSingletonScope();
    bindViewContribution(bind, DebugFrontendApplicationContribution);
    bind(FrontendApplicationContribution).toService(DebugFrontendApplicationContribution);

    bind(DebugSessionContributionRegistryImpl).toSelf().inSingletonScope();
    bind(DebugSessionContributionRegistry).toService(DebugSessionContributionRegistryImpl);

    bind(LaunchPreferenceProvider).to(UserLaunchProvider).inSingletonScope().whenTargetNamed(PreferenceScope.User);
    bind(LaunchPreferenceProvider).to(WorkspaceLaunchProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Workspace);
    bind(LaunchPreferenceProvider).to(FoldersLaunchProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Folder);
    bind(LaunchProviderProvider).toFactory(ctx => (scope: PreferenceScope) =>
        ctx.container.getNamed(LaunchPreferenceProvider, scope));

    bindDebugPreferences(bind);
});
