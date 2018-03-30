/*
 * Copyright (C) 2015-2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */
import { CommandRegistryExt, MAIN_RPC_CONTEXT, CommandRegistryMain } from '../api/extension-api';
import { interfaces } from "inversify";
import { CommandRegistry } from '@theia/core/lib/common/command';
import * as theia from 'theia';
import { Disposable } from '@theia/core/lib/common/disposable';
import { RPCProtocol } from '../api/rpc-protocol';

export class CommandRegistryMainImpl implements CommandRegistryMain {
    private proxy: CommandRegistryExt;
    private disposables = new Map<string, Disposable>();
    private delegate: CommandRegistry;
    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.COMMAND_REGISTRY_EXT);
        this.delegate = container.get(CommandRegistry);
    }

    registerCommand(command: theia.Command): void {
        this.disposables.set(
            command.id,
            this.delegate.registerCommand(command, {
                execute: (...args: any[]) => {
                    this.proxy.executeCommand(command.id);
                },
                isEnabled() { return true; },
                isVisible() { return true; }
            }));
    }
    unregisterCommand(id: string): void {
        const dis = this.disposables.get(id);
        if (dis) {
            dis.dispose();
            this.disposables.delete(id);
        }
    }
    executeCommand<T>(id: string, args: any[]): PromiseLike<T> {
        throw new Error("Method not implemented.");
    }
    getCommands(): PromiseLike<string[]> {
        throw new Error("Method not implemented.");
    }

}
