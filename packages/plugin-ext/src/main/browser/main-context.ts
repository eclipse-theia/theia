/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { interfaces } from 'inversify';
import { CommandRegistryMainImpl } from './command-registry-main';
import { PreferenceRegistryMainImpl } from './preference-registry-main';
import { QuickOpenMainImpl } from './quick-open-main';
import { RPCProtocol } from '../../api/rpc-protocol';
import { PLUGIN_RPC_CONTEXT } from '../../api/plugin-api';
import { MessageRegistryMainImpl } from './message-registry-main';
import { WindowStateMain } from './window-state-main';
import { StatusBarMessageRegistryMainImpl } from './status-bar-message-registry-main';
import { EnvMainImpl } from './env-main';
import { EditorsAndDocumentsMain } from './editors-and-documents-main';
import {OutputChannelRegistryMainImpl} from "./output-channel-registry-main";

export function setUpPluginApi(rpc: RPCProtocol, container: interfaces.Container): void {
    const commandRegistryMain = new CommandRegistryMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.COMMAND_REGISTRY_MAIN, commandRegistryMain);

    const quickOpenMain = new QuickOpenMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.QUICK_OPEN_MAIN, quickOpenMain);

    const messageRegistryMain = new MessageRegistryMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.MESSAGE_REGISTRY_MAIN, messageRegistryMain);

    const preferenceRegistryMain = new PreferenceRegistryMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.PREFERENCE_REGISTRY_MAIN, preferenceRegistryMain);

    // tslint:disable-next-line:no-unused-variable
    // @ts-ignore
    const windowStateMain = new WindowStateMain(rpc);

    /* tslint:disable */
    new EditorsAndDocumentsMain(rpc, container);
    /* tslint:enable */

    const statusBarMessageRegistryMain = new StatusBarMessageRegistryMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.STATUS_BAR_MESSAGE_REGISTRY_MAIN, statusBarMessageRegistryMain);

    const envMain = new EnvMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.ENV_MAIN, envMain);

    const outputChannelRegistryMain = new OutputChannelRegistryMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.OUTPUT_CHANNEL_REGISTRY_MAIN, outputChannelRegistryMain);
}
