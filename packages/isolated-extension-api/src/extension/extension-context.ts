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
import { MAIN_RPC_CONTEXT } from '../api/extension-api';
import { RPCProtocol } from '../api/rpc-protocol';
import * as theia from 'theia';
import { CommandRegistryImpl } from './comand-registry';
import { Disposable } from './types-impl';

export function createAPI(rpc: RPCProtocol): typeof theia {
    const commandRegistryExt = rpc.set(MAIN_RPC_CONTEXT.COMMAND_REGISTRY_EXT, new CommandRegistryImpl(rpc));

    const commands: typeof theia.commands = {
        registerCommand(command: theia.Command, callback: <T>(...args: any[]) => T | Thenable<T>): Disposable {
            return commandRegistryExt.registerCommand(command, callback);
        }
    };
    return <typeof theia>{
        commands,
        Disposable: Disposable
    };

}
