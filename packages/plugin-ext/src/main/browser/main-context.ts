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

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { CommandRegistryMainImpl } from './command-registry-main';
import { PreferenceRegistryMainImpl } from './preference-registry-main';
import { QuickOpenMainImpl } from './quick-open-main';
import { ProxyIdentifier, RPCProtocol, RPCProxy } from '../../common/rpc-protocol';
import { PLUGIN_RPC_CONTEXT } from '../../common/plugin-api-rpc';
import { MessageRegistryMainImpl } from './message-registry-main';
import { WindowStateMain } from './window-state-main';
import { WorkspaceMainImpl } from './workspace-main';
import { StatusBarMessageRegistryMainImpl } from './status-bar-message-registry-main';
import { EnvMainImpl } from './env-main';
import { EditorsAndDocumentsMain } from './editors-and-documents-main';
import { TerminalServiceMainImpl } from './terminal-main';
import { DialogsMainImpl } from './dialogs-main';
import { TreeViewsMainImpl } from './view/tree-views-main';
import { NotificationMainImpl } from './notification-main';
import { ConnectionImpl } from '../../common/connection';
import { WebviewsMainImpl } from './webviews-main';
import { TasksMainImpl } from './tasks-main';
import { StorageMainImpl } from './plugin-storage';
import { DebugMainImpl } from './debug/debug-main';
import { FileSystemMainImpl } from './file-system-main-impl';
import { ScmMainImpl } from './scm-main';
import { DecorationsMainImpl } from './decorations/decorations-main';
import { ClipboardMainImpl } from './clipboard-main';
import { DocumentsMainImpl } from './documents-main';
import { TextEditorsMainImpl } from './text-editors-main';
import { LabelServiceMainImpl } from './label-service-main';
import { TimelineMainImpl } from './timeline-main';
import { AuthenticationMainImpl } from './authentication-main';
import { ThemingMainImpl } from './theming-main';
import { CommentsMainImp } from './comments/comments-main';
import { CustomEditorsMainImpl } from './custom-editors/custom-editors-main';
import { SecretsMainImpl } from './secrets-main';
import { WebviewViewsMainImpl } from './webview-views/webview-views-main';
import { TabsMainImpl } from './tabs/tabs-main';
import { NotebooksMainImpl } from './notebooks/notebooks-main';
import { LocalizationMainImpl } from './localization-main';
import { NotebookRenderersMainImpl } from './notebooks/notebook-renderers-main';
import { NotebookEditorsMainImpl } from './notebooks/notebook-editors-main';
import { NotebookDocumentsMainImpl } from './notebooks/notebook-documents-main';
import { NotebookKernelsMainImpl } from './notebooks/notebook-kernels-main';
import { NotebooksAndEditorsMain } from './notebooks/notebook-documents-and-editors-main';
import { TestingMainImpl } from './test-main';
import { LanguagesMainImpl } from './languages-main';
import { OutputChannelRegistryMainImpl } from './output-channel-registry-main';

const pluginApiModule = new ContainerModule(bind => {
    bind(AuthenticationMainImpl).toSelf();
    bind(CommandRegistryMainImpl).toSelf();
    bind(QuickOpenMainImpl).toSelf();
    bind(WorkspaceMainImpl).toSelf();
    bind(DialogsMainImpl).toSelf();
    bind(MessageRegistryMainImpl).toSelf();
    bind(PreferenceRegistryMainImpl).toSelf();
    bind(NotebookDocumentsMainImpl).toSelf();
    bind(DocumentsMainImpl).toSelf();
    bind(NotebooksMainImpl).toSelf();
    bind(NotebookRenderersMainImpl).toSelf();
    bind(NotebookEditorsMainImpl).toSelf();
    bind(NotebooksAndEditorsMain).toSelf();
    bind(NotebookKernelsMainImpl).toSelf();
    bind(TextEditorsMainImpl).toSelf();
    bind(StatusBarMessageRegistryMainImpl).toSelf();
    bind(EnvMainImpl).toSelf();
    bind(NotificationMainImpl).toSelf();
    bind(TestingMainImpl).toSelf();
    bind(TerminalServiceMainImpl).toSelf();
    bind(TreeViewsMainImpl).toSelf();
    bind(OutputChannelRegistryMainImpl).toSelf();
    bind(LanguagesMainImpl).toSelf();
    bind(WebviewsMainImpl).toSelf();
    bind(CustomEditorsMainImpl).toSelf();
    bind(WebviewViewsMainImpl).toSelf();
    bind(StorageMainImpl).toSelf();
    bind(ConnectionImpl).toSelf();
    bind(TasksMainImpl).toSelf();
    bind(DebugMainImpl).toSelf();
    bind(FileSystemMainImpl).toSelf();
    bind(ScmMainImpl).toSelf();
    bind(SecretsMainImpl).toSelf();
    bind(DecorationsMainImpl).toSelf();
    bind(WindowStateMain).toSelf();
    bind(ClipboardMainImpl).toSelf();
    bind(LabelServiceMainImpl).toSelf();
    bind(TimelineMainImpl).toSelf();
    bind(ThemingMainImpl).toSelf();
    bind(CommentsMainImp).toSelf();
    bind(TabsMainImpl).toSelf();
    bind(LocalizationMainImpl).toSelf();
});

export function setUpPluginApi(rpc: RPCProtocol, container: interfaces.Container): void {
    const pluginApi = container.createChild();
    pluginApi.options.defaultScope = 'Singleton';
    pluginApi.bind(RPCProtocol).toConstantValue(rpc);
    pluginApi.bind(RPCProxy)
        .toDynamicValue(ctx => {
            const name = ctx.currentRequest.target.getNamedTag()?.value;
            if (!name) {
                throw new Error('RPCProxy needs a name to be injected')
            }
            return rpc.getProxy(new ProxyIdentifier(false, name));
        })
        .inRequestScope();
    pluginApi.load(pluginApiModule);

    rpc.set(PLUGIN_RPC_CONTEXT.AUTHENTICATION_MAIN, pluginApi.get(AuthenticationMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.COMMAND_REGISTRY_MAIN, pluginApi.get(CommandRegistryMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.QUICK_OPEN_MAIN, pluginApi.get(QuickOpenMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.WORKSPACE_MAIN, pluginApi.get(WorkspaceMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.DIALOGS_MAIN, pluginApi.get(DialogsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.MESSAGE_REGISTRY_MAIN, pluginApi.get(MessageRegistryMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.PREFERENCE_REGISTRY_MAIN, pluginApi.get(PreferenceRegistryMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.NOTEBOOK_DOCUMENTS_MAIN, pluginApi.get(NotebookDocumentsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.DOCUMENTS_MAIN, pluginApi.get(DocumentsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.NOTEBOOKS_MAIN, pluginApi.get(NotebooksMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.NOTEBOOK_RENDERERS_MAIN, pluginApi.get(NotebookRenderersMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.NOTEBOOK_EDITORS_MAIN, pluginApi.get(NotebookEditorsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.NOTEBOOK_DOCUMENTS_AND_EDITORS_MAIN, pluginApi.get(NotebooksAndEditorsMain));
    rpc.set(PLUGIN_RPC_CONTEXT.NOTEBOOK_KERNELS_MAIN, pluginApi.get(NotebookKernelsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.TEXT_EDITORS_MAIN, pluginApi.get(TextEditorsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.STATUS_BAR_MESSAGE_REGISTRY_MAIN, pluginApi.get(StatusBarMessageRegistryMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.ENV_MAIN, pluginApi.get(EnvMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.NOTIFICATION_MAIN, pluginApi.get(NotificationMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.TESTING_MAIN, pluginApi.get(TestingMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.TERMINAL_MAIN, pluginApi.get(TerminalServiceMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.TREE_VIEWS_MAIN, pluginApi.get(TreeViewsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.OUTPUT_CHANNEL_REGISTRY_MAIN, pluginApi.get(OutputChannelRegistryMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.LANGUAGES_MAIN, pluginApi.get(LanguagesMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.WEBVIEWS_MAIN, pluginApi.get(WebviewsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.CUSTOM_EDITORS_MAIN, pluginApi.get(CustomEditorsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.WEBVIEW_VIEWS_MAIN, pluginApi.get(WebviewViewsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.STORAGE_MAIN, pluginApi.get(StorageMainImpl));
    // const connectionMain = new ConnectionImpl(rpc.getProxy(MAIN_RPC_CONTEXT.CONNECTION_EXT));
    rpc.set(PLUGIN_RPC_CONTEXT.CONNECTION_MAIN, pluginApi.get(ConnectionImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.TASKS_MAIN, pluginApi.get(TasksMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.DEBUG_MAIN, pluginApi.get(DebugMainImpl));
    // const fs = new FileSystemMainImpl(rpc, container);
    // const fsEventService = new MainFileSystemEventService(rpc, container);
    // const disposeFS = fs.dispose.bind(fs);
    // fs.dispose = () => {
    //     fsEventService.dispose();
    //     disposeFS();
    // };
    rpc.set(PLUGIN_RPC_CONTEXT.FILE_SYSTEM_MAIN, pluginApi.get(FileSystemMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.SCM_MAIN, pluginApi.get(ScmMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.SECRETS_MAIN, pluginApi.get(SecretsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.DECORATIONS_MAIN, pluginApi.get(DecorationsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.WINDOW_MAIN, pluginApi.get(WindowStateMain));
    rpc.set(PLUGIN_RPC_CONTEXT.CLIPBOARD_MAIN, pluginApi.get(ClipboardMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.LABEL_SERVICE_MAIN, pluginApi.get(LabelServiceMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.TIMELINE_MAIN, pluginApi.get(TimelineMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.THEMING_MAIN, pluginApi.get(ThemingMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.COMMENTS_MAIN, pluginApi.get(CommentsMainImp));
    rpc.set(PLUGIN_RPC_CONTEXT.TABS_MAIN, pluginApi.get(TabsMainImpl));
    rpc.set(PLUGIN_RPC_CONTEXT.LOCALIZATION_MAIN, pluginApi.get(LocalizationMainImpl));

    // start listening only after all clients are subscribed to events
    pluginApi.get(EditorsAndDocumentsMain).listen();
}
