/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { interfaces } from 'inversify';
import { CommandRegistryMainImpl } from './command-registry-main';
import { QuickOpenMainImpl } from './quick-open-main';
import { RPCProtocol } from '../../api/rpc-protocol';
import { PLUGIN_RPC_CONTEXT } from '../../api/plugin-api';
import { MessageRegistryMainImpl } from './message-registry-main';
import { WindowStateMain } from './window-state-main';

export function setUpPluginApi(rpc: RPCProtocol, container: interfaces.Container): void {
    const commandRegistryMain = new CommandRegistryMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.COMMAND_REGISTRY_MAIN, commandRegistryMain);

    const quickOpenMain = new QuickOpenMainImpl(rpc, container);
    rpc.set(PLUGIN_RPC_CONTEXT.QUICK_OPEN_MAIN, quickOpenMain);

    const messageRegistryMain = new MessageRegistryMainImpl(container);
    rpc.set(PLUGIN_RPC_CONTEXT.MESSAGE_REGISTRY_MAIN, messageRegistryMain);

    // tslint:disable-next-line:no-unused-variable
    // @ts-ignore
    const windowStateMain = new WindowStateMain(rpc);
}
