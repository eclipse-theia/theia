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

import '../../../src/main/style/status-bar.css';

import { ContainerModule } from 'inversify';
import { FrontendApplicationContribution, FrontendApplication, WidgetFactory, bindViewContribution } from '@theia/core/lib/browser';
import { MaybePromise, CommandContribution, ResourceResolver, bindContributionProvider } from '@theia/core/lib/common';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';
import { HostedPluginSupport } from '../../hosted/browser/hosted-plugin';
import { HostedPluginWatcher } from '../../hosted/browser/hosted-plugin-watcher';
import { OpenUriCommandHandler } from './commands';
import { PluginApiFrontendContribution } from './plugin-frontend-contribution';
import { HostedPluginServer, hostedServicePath, PluginServer, pluginServerJsonRpcPath } from '../../common/plugin-protocol';
import { ModalNotification } from './dialogs/modal-notification';
import { PluginWidget } from './plugin-ext-widget';
import { PluginFrontendViewContribution } from './plugin-frontend-view-contribution';

import '../../../src/main/browser/style/index.css';
import { PluginExtDeployCommandService } from './plugin-ext-deploy-command';
import { TextEditorService, TextEditorServiceImpl } from './text-editor-service';
import { EditorModelService, EditorModelServiceImpl } from './text-editor-model-service';
import { UntitledResourceResolver } from './editor/untitled-resource';
import { MenusContributionPointHandler } from './menus/menus-contribution-handler';
import { PluginContributionHandler } from './plugin-contribution-handler';
import { ViewRegistry } from './view/view-registry';
import { TextContentResourceResolver } from './workspace-main';
import { MainPluginApiProvider } from '../../common/plugin-ext-api-contribution';
import { PluginPathsService, pluginPathsServicePath } from '../common/plugin-paths-protocol';
import { KeybindingsContributionPointHandler } from './keybindings/keybindings-contribution-handler';
import { LanguageClientProvider } from '@theia/languages/lib/browser/language-client-provider';
import { LanguageClientProviderImpl } from './language-provider/plugin-language-client-provider';
import { LanguageClientContributionProviderImpl } from './language-provider/language-client-contribution-provider-impl';
import { LanguageClientContributionProvider } from './language-provider/language-client-contribution-provider';
import { StoragePathService } from './storage-path-service';
import { DebugSessionContributionRegistry } from '@theia/debug/lib/browser/debug-session-contribution';
import { PluginDebugSessionContributionRegistry } from './debug/plugin-debug-session-contribution-registry';
import { PluginDebugService } from './debug/plugin-debug-service';
import { DebugService } from '@theia/debug/lib/common/debug-service';
import { PluginSharedStyle } from './plugin-shared-style';
import { FSResourceResolver } from './file-system-main';
import { SelectionProviderCommandContribution } from './selection-provider-command';
import { ViewColumnService } from './view-column-service';
import { TreeViewActions } from './view/tree-view-actions';
import { TreeViewContextKeyService } from './view/tree-view-context-key-service';

export default new ContainerModule((bind, unbind, isBound, rebind) => {

    bind(ModalNotification).toSelf().inSingletonScope();

    bind(HostedPluginSupport).toSelf().inSingletonScope();
    bind(HostedPluginWatcher).toSelf().inSingletonScope();
    bind(SelectionProviderCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SelectionProviderCommandContribution);

    bind(OpenUriCommandHandler).toSelf().inSingletonScope();
    bind(PluginApiFrontendContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(PluginApiFrontendContribution);

    bind(TextEditorService).to(TextEditorServiceImpl).inSingletonScope();
    bind(EditorModelService).to(EditorModelServiceImpl).inSingletonScope();

    bind(UntitledResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(UntitledResourceResolver);

    bind(FrontendApplicationContribution).toDynamicValue(ctx => ({
        onStart(app: FrontendApplication): MaybePromise<void> {
            ctx.container.get(HostedPluginSupport).checkAndLoadPlugin(ctx.container);
        }
    }));
    bind(HostedPluginServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const hostedWatcher = ctx.container.get(HostedPluginWatcher);
        return connection.createProxy<HostedPluginServer>(hostedServicePath, hostedWatcher.getHostedPluginClient());
    }).inSingletonScope();

    bind(PluginPathsService).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<PluginPathsService>(pluginPathsServicePath);
    }).inSingletonScope();
    bind(StoragePathService).toSelf().inSingletonScope();

    bindViewContribution(bind, PluginFrontendViewContribution);

    bind(PluginWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: PluginFrontendViewContribution.PLUGINS_WIDGET_FACTORY_ID,
        createWidget: () => ctx.container.get(PluginWidget)
    }));

    bind(PluginExtDeployCommandService).toSelf().inSingletonScope();
    bind(PluginServer).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<PluginServer>(pluginServerJsonRpcPath);
    }).inSingletonScope();

    bind(TreeViewActions).toSelf().inSingletonScope();
    bind(TreeViewContextKeyService).toSelf().inSingletonScope();

    bind(PluginSharedStyle).toSelf().inSingletonScope();
    bind(ViewRegistry).toSelf().inSingletonScope();
    bind(MenusContributionPointHandler).toSelf().inSingletonScope();

    bind(KeybindingsContributionPointHandler).toSelf().inSingletonScope();

    bind(PluginContributionHandler).toSelf().inSingletonScope();

    bind(TextContentResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(TextContentResourceResolver);
    bind(FSResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(FSResourceResolver);
    bindContributionProvider(bind, MainPluginApiProvider);

    bind(LanguageClientContributionProviderImpl).toSelf().inSingletonScope();
    bind(LanguageClientContributionProvider).toService(LanguageClientContributionProviderImpl);
    bind(LanguageClientProviderImpl).toSelf().inSingletonScope();
    rebind(LanguageClientProvider).toService(LanguageClientProviderImpl);

    bind(PluginDebugService).toSelf().inSingletonScope();
    rebind(DebugService).toService(PluginDebugService);
    bind(PluginDebugSessionContributionRegistry).toSelf().inSingletonScope();
    rebind(DebugSessionContributionRegistry).toService(PluginDebugSessionContributionRegistry);

    bind(ViewColumnService).toSelf().inSingletonScope();
});
