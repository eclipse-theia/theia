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
import { interfaces } from 'inversify';
import { CommandRegistryMainImpl } from './command-registry-main';
import { PreferenceRegistryMainImpl } from './preference-registry-main';
import { QuickOpenMainImpl } from './quick-open-main';
import { RPCProtocol } from '../../api/rpc-protocol';
import { PLUGIN_RPC_CONTEXT } from '../../api/plugin-api';
import { MessageRegistryMainImpl } from './message-registry-main';
import { WindowStateMain } from './window-state-main';
import { WorkspaceMainImpl } from './workspace-main';
import { StatusBarMessageRegistryMainImpl } from './status-bar-message-registry-main';
import { EnvMainImpl } from './env-main';
import { EditorsAndDocumentsMain } from './editors-and-documents-main';
import { OutputChannelRegistryMainImpl } from './output-channel-registry-main';
import { TerminalServiceMainImpl } from './terminal-main';
import { LanguagesMainImpl } from './languages-main';
import { DialogsMainImpl } from './dialogs-main';
import { TreeViewsMainImpl } from './view/tree-views-main';
import { NotificationMainImpl } from './notification-main';
import { ConnectionMainImpl } from './connection-main';
import { WebviewsMainImpl } from './webviews-main';
import { TasksMainImpl } from './tasks-main';
import { LanguagesContributionMainImpl } from './languages-contribution-main';
import { DebugMainImpl } from './debug/debug-main';

export function setUpPluginApi(rpc: RPCProtocol, container: interfaces.Container): void {
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

    /* tslint:disable */
    new WindowStateMain(rpc);
    new EditorsAndDocumentsMain(rpc, container);
    /* tslint:enable */

    const statusBarMessageRegistryMain = new StatusBarMessageRegistryMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.STATUS_BAR_MESSAGE_REGISTRY_MAIN, statusBarMessageRegistryMain);

    const envMain = new EnvMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.ENV_MAIN, envMain);

    const notificationMain = new NotificationMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.NOTIFICATION_MAIN, notificationMain);

    const terminalMain = new TerminalServiceMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.TERMINAL_MAIN, terminalMain);

    const treeViewsMain = new TreeViewsMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.TREE_VIEWS_MAIN, treeViewsMain);

    const outputChannelRegistryMain = new OutputChannelRegistryMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.OUTPUT_CHANNEL_REGISTRY_MAIN, outputChannelRegistryMain);

    const languagesMain = new LanguagesMainImpl(rpc);
    rpc.set(PLUGIN_RPC_CONTEXT.LANGUAGES_MAIN, languagesMain);

    const webviewsMain = new WebviewsMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.WEBVIEWS_MAIN, webviewsMain);

    const pluginConnection = new ConnectionMainImpl(rpc);
    rpc.set(PLUGIN_RPC_CONTEXT.CONNECTION_MAIN, pluginConnection);

    const tasksMain = new TasksMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.TASKS_MAIN, tasksMain);

    const languagesContribution = new LanguagesContributionMainImpl(rpc, container, pluginConnection);
    rpc.set(PLUGIN_RPC_CONTEXT.LANGUAGES_CONTRIBUTION_MAIN, languagesContribution);

    const connectionMain = new ConnectionMainImpl(rpc);
    rpc.set(PLUGIN_RPC_CONTEXT.CONNECTION_MAIN, connectionMain);

    const debugMain = new DebugMainImpl(rpc, connectionMain, container);
    rpc.set(PLUGIN_RPC_CONTEXT.DEBUG_MAIN, debugMain);
}
