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
import { CommandRegistry } from '@theia/core/lib/common/command';
import * as theia from '@theia/plugin';
import { Disposable } from '@theia/core/lib/common/disposable';
import { CommandRegistryMain, CommandRegistryExt, MAIN_RPC_CONTEXT } from '../../api/plugin-api';
import { RPCProtocol } from '../../api/rpc-protocol';

export class CommandRegistryMainImpl implements CommandRegistryMain {
    private proxy: CommandRegistryExt;
    private disposables = new Map<string, Disposable>();
    private delegate: CommandRegistry;
    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.COMMAND_REGISTRY_EXT);
        this.delegate = container.get(CommandRegistry);
    }

    $registerCommand(command: theia.Command): void {
        this.disposables.set(
            command.id,
            this.delegate.registerCommand(command, {
                // tslint:disable-next-line:no-any
                execute: (...args: any[]) => {
                    this.proxy.$executeCommand(command.id, ...args);
                },
                // Always enabled - a command can be executed programmatically or via the commands palette.
                isEnabled() { return true; },
                // By default, a command isn't be visible in all menus but in the commands palette only.
                // Visibility rules are defined via the `menus` contribution point.
                isVisible() { return false; }
            }));
    }
    $unregisterCommand(id: string): void {
        const dis = this.disposables.get(id);
        if (dis) {
            dis.dispose();
            this.disposables.delete(id);
        }
    }
    // tslint:disable-next-line:no-any
    $executeCommand<T>(id: string, args: any[]): PromiseLike<T | undefined> {
        try {
            return Promise.resolve(this.delegate.executeCommand(id, ...args));
        } catch (e) {
            return Promise.reject(e);
        }
    }
    $getCommands(): PromiseLike<string[]> {
        throw new Error('Method not implemented.');
    }

}
