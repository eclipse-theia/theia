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
import { CommandRegistryExt, EXTENSION_RPC_CONTEXT as Ext, CommandRegistryMain } from '../api/extension-api';
import { RPCProtocol } from '../api/rpc-protocol';
import * as theia from 'theia';
import { Disposable } from './types-impl';

export type Handler = <T>(...args: any[]) => T | PromiseLike<T>;

export class CommandRegistryImpl implements CommandRegistryExt {

    private proxy: CommandRegistryMain;
    private commands = new Map<string, Handler>();

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.COMMAND_REGISTRY_MAIN);
    }
    registerCommand(command: theia.Command, handler: Handler): Disposable {
        if (this.commands.has(command.id)) {
            throw new Error(`Command ${command.id} already exist`);
        }
        this.commands.set(command.id, handler);
        this.proxy.registerCommand(command);

        return Disposable.create(() => {
            this.proxy.unregisterCommand(command.id);
        });

    }

    dispose(): void {
        throw new Error("Method not implemented.");
    }

    executeCommand<T>(id: string): PromiseLike<T> {
        const handler = this.commands.get(id);
        if (handler) {
            return Promise.resolve(handler());
        } else {
            return Promise.reject(new Error(`Command ${id} doesn't exist`));
        }
    }

}
