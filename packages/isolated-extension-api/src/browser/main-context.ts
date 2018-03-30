/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */
import { interfaces } from 'inversify';
import { RPCProtocol } from '../api/rpc-protocol';
import { CommandRegistryMainImpl } from './command-registry-main';
import { EXTENSION_RPC_CONTEXT } from '../api/extension-api';

export function setUpExtensionApi(rpc: RPCProtocol, container: interfaces.Container): void {
    const commandRegistryMain = new CommandRegistryMainImpl(rpc, container);
    rpc.set(EXTENSION_RPC_CONTEXT.COMMAND_REGISTRY_MAIN, commandRegistryMain);
}
