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
import { KeybindingRegistry } from '@theia/core/lib/browser';

export class CommandRegistryMainImpl implements CommandRegistryMain {
    private proxy: CommandRegistryExt;
    private readonly commands = new Map<string, Disposable>();
    private readonly handlers = new Map<string, Disposable>();
    private delegate: CommandRegistry;
    private keyBinding: KeybindingRegistry;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.COMMAND_REGISTRY_EXT);
        this.delegate = container.get(CommandRegistry);
        this.keyBinding = container.get(KeybindingRegistry);
    }

    $registerCommand(command: theia.Command): void {
        this.commands.set(command.id, this.delegate.registerCommand(command));
    }
    $unregisterCommand(id: string): void {
        const command = this.commands.get(id);
        if (command) {
            command.dispose();
            this.commands.delete(id);
        }
    }

    $registerHandler(id: string): void {
        this.handlers.set(id, this.delegate.registerHandler(id, {
            // tslint:disable-next-line:no-any
            execute: (...args: any[]) => {
                this.proxy.$executeCommand(id, ...args);
            },
            // Always enabled - a command can be executed programmatically or via the commands palette.
            isEnabled() { return true; },
            // Visibility rules are defined via the `menus` contribution point.
            isVisible() { return true; }
        }));
    }
    $unregisterHandler(id: string): void {
        const handler = this.handlers.get(id);
        if (handler) {
            handler.dispose();
            this.handlers.delete(id);
        }
    }

    // tslint:disable-next-line:no-any
    $executeCommand<T>(id: string, ...args: any[]): PromiseLike<T | undefined> {
        try {
            return Promise.resolve(this.delegate.executeCommand(id, ...args));
        } catch (e) {
            return Promise.reject(e);
        }
    }

    $getKeyBinding(commandId: string): PromiseLike<theia.CommandKeyBinding[] | undefined> {
        try {
            const keyBindings = this.keyBinding.getKeybindingsForCommand(commandId);
            if (keyBindings) {
                // transform inner type to CommandKeyBinding
                return Promise.resolve(keyBindings.map(keyBinding => ({ id: commandId, value: keyBinding.keybinding })));
            } else {
                return Promise.resolve(undefined);
            }

        } catch (e) {
            return Promise.reject(e);
        }
    }

    $getCommands(): PromiseLike<string[]> {
        return Promise.resolve(this.delegate.commandIds);
    }

}
