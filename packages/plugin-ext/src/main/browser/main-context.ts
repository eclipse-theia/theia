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
import { interfaces } from '@theia/core/shared/inversify';
import { CommandRegistryMainImpl } from './command-registry-main';
import { PreferenceRegistryMainImpl } from './preference-registry-main';
import { QuickOpenMainImpl } from './quick-open-main';
import { RPCProtocol } from '../../common/rpc-protocol';
import { PLUGIN_RPC_CONTEXT, LanguagesMainFactory, OutputChannelRegistryFactory, MAIN_RPC_CONTEXT } from '../../common/plugin-api-rpc';
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
import { EditorModelService } from './text-editor-model-service';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { MainFileSystemEventService } from './main-file-system-event-service';
import { LabelServiceMainImpl } from './label-service-main';
import { TimelineMainImpl } from './timeline-main';
import { AuthenticationMainImpl } from './authentication-main';
import { ThemingMainImpl } from './theming-main';
import { CommentsMainImp } from './comments/comments-main';
import { CustomEditorsMainImpl } from './custom-editors/custom-editors-main';
import { SecretsMainImpl } from './secrets-main';
import { WebviewViewsMainImpl } from './webview-views/webview-views-main';
import { MonacoLanguages } from '@theia/monaco/lib/browser/monaco-languages';
import { UntitledResourceResolver } from '@theia/core/lib/common/resource';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { TabsMainImpl } from './tabs/tabs-main';
import { NotebooksMainImpl } from './notebooks/notebooks-main';
import { LocalizationMainImpl } from './localization-main';
import { NotebookRenderersMainImpl } from './notebooks/notebook-renderers-main';
import { NotebookEditorsMainImpl } from './notebooks/notebook-editors-main';
import { NotebookDocumentsMainImpl } from './notebooks/notebook-documents-main';
import { NotebookKernelsMainImpl } from './notebooks/notebook-kernels-main';
import { NotebooksAndEditorsMain } from './notebooks/notebook-documents-and-editors-main';
import { TestingMainImpl } from './test-main';
import { UriMainImpl } from './uri-main';
import { LoggerMainImpl } from './logger-main';
import { McpServerDefinitionRegistryMainImpl } from './lm-main';

export function setUpPluginApi(rpc: RPCProtocol, container: interfaces.Container): void {
    const loggerMain = new LoggerMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.LOGGER_MAIN, loggerMain);

    const authenticationMain = new AuthenticationMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.AUTHENTICATION_MAIN, authenticationMain);

    const commandRegistryMain = new CommandRegistryMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.COMMAND_REGISTRY_MAIN, commandRegistryMain);

    const quickOpenMain = new QuickOpenMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.QUICK_OPEN_MAIN, quickOpenMain);

    const workspaceMain = new WorkspaceMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.WORKSPACE_MAIN, workspaceMain);

    const dialogsMain = new DialogsMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.DIALOGS_MAIN, dialogsMain);

    const messageRegistryMain = new MessageRegistryMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.MESSAGE_REGISTRY_MAIN, messageRegistryMain);

    const preferenceRegistryMain = new PreferenceRegistryMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.PREFERENCE_REGISTRY_MAIN, preferenceRegistryMain);

    const tabsMain = new TabsMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.TABS_MAIN, tabsMain);

    const editorsAndDocuments = new EditorsAndDocumentsMain(rpc, container, tabsMain);

    const notebookDocumentsMain = new NotebookDocumentsMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.NOTEBOOK_DOCUMENTS_MAIN, notebookDocumentsMain);

    const modelService = container.get(EditorModelService);
    const openerService = container.get<OpenerService>(OpenerService);
    const shell = container.get(ApplicationShell);
    const untitledResourceResolver = container.get(UntitledResourceResolver);
    const languageService = container.get(MonacoLanguages);
    const documentsMain = new DocumentsMainImpl(editorsAndDocuments, notebookDocumentsMain, modelService, rpc,
        openerService, shell, untitledResourceResolver, languageService);
    rpc.set(PLUGIN_RPC_CONTEXT.DOCUMENTS_MAIN, documentsMain);

    rpc.set(PLUGIN_RPC_CONTEXT.NOTEBOOKS_MAIN, new NotebooksMainImpl(rpc, container, commandRegistryMain));
    rpc.set(PLUGIN_RPC_CONTEXT.NOTEBOOK_RENDERERS_MAIN, new NotebookRenderersMainImpl(rpc, container));
    const notebookEditorsMain = new NotebookEditorsMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.NOTEBOOK_EDITORS_MAIN, notebookEditorsMain);
    rpc.set(PLUGIN_RPC_CONTEXT.NOTEBOOK_DOCUMENTS_AND_EDITORS_MAIN, new NotebooksAndEditorsMain(rpc, container, tabsMain, notebookDocumentsMain, notebookEditorsMain));
    rpc.set(PLUGIN_RPC_CONTEXT.NOTEBOOK_KERNELS_MAIN, new NotebookKernelsMainImpl(rpc, container));

    const editorsMain = new TextEditorsMainImpl(editorsAndDocuments, documentsMain, rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.TEXT_EDITORS_MAIN, editorsMain);

    // start listening only after all clients are subscribed to events
    editorsAndDocuments.listen();

    const statusBarMessageRegistryMain = new StatusBarMessageRegistryMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.STATUS_BAR_MESSAGE_REGISTRY_MAIN, statusBarMessageRegistryMain);

    const envMain = new EnvMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.ENV_MAIN, envMain);

    const notificationMain = new NotificationMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.NOTIFICATION_MAIN, notificationMain);

    const testingMain = new TestingMainImpl(rpc, container, commandRegistryMain);
    rpc.set(PLUGIN_RPC_CONTEXT.TESTING_MAIN, testingMain);

    const terminalMain = new TerminalServiceMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.TERMINAL_MAIN, terminalMain);

    const treeViewsMain = new TreeViewsMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.TREE_VIEWS_MAIN, treeViewsMain);

    const outputChannelRegistryFactory: OutputChannelRegistryFactory = container.get(OutputChannelRegistryFactory);
    const outputChannelRegistryMain = outputChannelRegistryFactory();
    rpc.set(PLUGIN_RPC_CONTEXT.OUTPUT_CHANNEL_REGISTRY_MAIN, outputChannelRegistryMain);

    const languagesMainFactory: LanguagesMainFactory = container.get(LanguagesMainFactory);
    const languagesMain = languagesMainFactory(rpc);
    rpc.set(PLUGIN_RPC_CONTEXT.LANGUAGES_MAIN, languagesMain);

    const webviewsMain = new WebviewsMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.WEBVIEWS_MAIN, webviewsMain);

    const customEditorsMain = new CustomEditorsMainImpl(rpc, container, webviewsMain);
    rpc.set(PLUGIN_RPC_CONTEXT.CUSTOM_EDITORS_MAIN, customEditorsMain);

    const webviewViewsMain = new WebviewViewsMainImpl(rpc, container, webviewsMain);
    rpc.set(PLUGIN_RPC_CONTEXT.WEBVIEW_VIEWS_MAIN, webviewViewsMain);

    const storageMain = new StorageMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.STORAGE_MAIN, storageMain);

    const connectionMain = new ConnectionImpl(rpc.getProxy(MAIN_RPC_CONTEXT.CONNECTION_EXT));
    rpc.set(PLUGIN_RPC_CONTEXT.CONNECTION_MAIN, connectionMain);

    const tasksMain = new TasksMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.TASKS_MAIN, tasksMain);

    const debugMain = new DebugMainImpl(rpc, connectionMain, container);
    rpc.set(PLUGIN_RPC_CONTEXT.DEBUG_MAIN, debugMain);

    const fs = new FileSystemMainImpl(rpc, container);
    const fsEventService = new MainFileSystemEventService(rpc, container);
    const disposeFS = fs.dispose.bind(fs);
    fs.dispose = () => {
        fsEventService.dispose();
        disposeFS();
    };

    rpc.set(PLUGIN_RPC_CONTEXT.FILE_SYSTEM_MAIN, fs);

    const scmMain = new ScmMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.SCM_MAIN, scmMain);

    const secretsMain = new SecretsMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.SECRETS_MAIN, secretsMain);

    const decorationsMain = new DecorationsMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.DECORATIONS_MAIN, decorationsMain);

    const windowMain = new WindowStateMain(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.WINDOW_MAIN, windowMain);

    const clipboardMain = new ClipboardMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.CLIPBOARD_MAIN, clipboardMain);

    const labelServiceMain = new LabelServiceMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.LABEL_SERVICE_MAIN, labelServiceMain);

    const timelineMain = new TimelineMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.TIMELINE_MAIN, timelineMain);

    const themingMain = new ThemingMainImpl(rpc, container.get(ThemeService));
    rpc.set(PLUGIN_RPC_CONTEXT.THEMING_MAIN, themingMain);

    const commentsMain = new CommentsMainImp(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.COMMENTS_MAIN, commentsMain);

    const localizationMain = new LocalizationMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.LOCALIZATION_MAIN, localizationMain);

    const uriMain = new UriMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.URI_MAIN, uriMain);

    const mcpServerDefinitionRegistryMain = new McpServerDefinitionRegistryMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.MCP_SERVER_DEFINITION_REGISTRY_MAIN, mcpServerDefinitionRegistryMain);
}
