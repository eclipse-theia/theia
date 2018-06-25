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
import { WorkspaceMain } from './workspace-main';
import { StatusBarMessageRegistryMainImpl } from './status-bar-message-registry-main';
import { EnvMainImpl } from './env-main';
import { EditorsAndDocumentsMain } from './editors-and-documents-main';
import { OutputChannelRegistryMainImpl } from "./output-channel-registry-main";
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TerminalServiceMainImpl } from './terminal-main';

export function setUpPluginApi(rpc: RPCProtocol, container: interfaces.Container): void {
    const commandRegistryMain = new CommandRegistryMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.COMMAND_REGISTRY_MAIN, commandRegistryMain);

    const quickOpenMain = new QuickOpenMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.QUICK_OPEN_MAIN, quickOpenMain);

    const messageRegistryMain = new MessageRegistryMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.MESSAGE_REGISTRY_MAIN, messageRegistryMain);

    const preferenceRegistryMain = new PreferenceRegistryMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.PREFERENCE_REGISTRY_MAIN, preferenceRegistryMain);

    /* tslint:disable */
    new WindowStateMain(rpc);
    new WorkspaceMain(rpc, container.get(WorkspaceService));
    new EditorsAndDocumentsMain(rpc, container);
    /* tslint:enable */

    const statusBarMessageRegistryMain = new StatusBarMessageRegistryMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.STATUS_BAR_MESSAGE_REGISTRY_MAIN, statusBarMessageRegistryMain);

    const envMain = new EnvMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.ENV_MAIN, envMain);

    const terminalMain = new TerminalServiceMainImpl(container, rpc);
    rpc.set(PLUGIN_RPC_CONTEXT.TERMINAL_MAIN, terminalMain);

    const outputChannelRegistryMain = new OutputChannelRegistryMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.OUTPUT_CHANNEL_REGISTRY_MAIN, outputChannelRegistryMain);
}
