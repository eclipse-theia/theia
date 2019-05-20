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

import * as theia from '@theia/plugin';
import { CommandRegistryExt, PLUGIN_RPC_CONTEXT as Ext, CommandRegistryMain } from '../api/plugin-api';
import { RPCProtocol } from '../api/rpc-protocol';
import { Disposable } from './types-impl';
import { KnownCommands } from './type-converters';
import { SelectionServiceExt } from './selection-provider-ext';

// tslint:disable-next-line:no-any
export type Handler = <T>(...args: any[]) => T | PromiseLike<T>;

export class CommandRegistryImpl implements CommandRegistryExt {

    private proxy: CommandRegistryMain;
    private readonly commands = new Set<string>();
    private readonly handlers = new Map<string, Handler>();

    constructor(rpc: RPCProtocol, private selectionService: SelectionServiceExt) {
        this.proxy = rpc.getProxy(Ext.COMMAND_REGISTRY_MAIN);
    }

    // tslint:disable-next-line:no-any
    registerCommand(command: theia.CommandDescription, handler?: Handler, thisArg?: any): Disposable {
        if (this.commands.has(command.id)) {
            throw new Error(`Command ${command.id} already exist`);
        }
        this.commands.add(command.id);
        this.proxy.$registerCommand(command);

        const toDispose: Disposable[] = [];
        if (handler) {
            toDispose.push(this.registerHandler(command.id, handler, thisArg));
        }
        toDispose.push(Disposable.create(() => {
            this.commands.delete(command.id);
            this.proxy.$unregisterCommand(command.id);
        }));
        return Disposable.from(...toDispose);
    }

    // tslint:disable-next-line:no-any
    registerHandler(commandId: string, handler: Handler, thisArg?: any): Disposable {
        if (this.handlers.has(commandId)) {
            throw new Error(`Command "${commandId}" already has handler`);
        }
        this.proxy.$registerHandler(commandId);
        // tslint:disable-next-line:no-any
        this.handlers.set(commandId, (...args: any[]) => handler.apply(thisArg, args));
        return Disposable.create(() => {
            this.handlers.delete(commandId);
            this.proxy.$unregisterHandler(commandId);
        });
    }

    dispose(): void {
        throw new Error('Method not implemented.');
    }

    // tslint:disable-next-line:no-any
    $executeCommand<T>(id: string, ...args: any[]): PromiseLike<T> {
        if (this.handlers.has(id)) {
            return this.executeLocalCommand(id, ...args);
        } else {
            return Promise.reject(new Error(`Command: ${id} does not exist.`));
        }
    }

    // tslint:disable:no-any
    executeCommand<T>(id: string, ...args: any[]): PromiseLike<T | undefined> {
        if (this.handlers.has(id)) {
            return this.executeLocalCommand(id, ...args);
        } else {
            return KnownCommands.map(id, args, (mappedId: string, mappedArgs: any[] | undefined) =>
                this.proxy.$executeCommand(mappedId, ...mappedArgs));
        }
    }
    // tslint:enable:no-any

    getKeyBinding(commandId: string): PromiseLike<theia.CommandKeyBinding[] | undefined> {
        return this.proxy.$getKeyBinding(commandId);
    }

    // tslint:disable-next-line:no-any
    private executeLocalCommand<T>(id: string, ...args: any[]): PromiseLike<T> {
        const handler = this.handlers.get(id);
        if (handler) {
            return Promise.resolve(this.selectionService.selection !== undefined ? handler(this.selectionService.selection) : handler(...args));
        } else {
            return Promise.reject(new Error(`Command ${id} doesn't exist`));
        }
    }

    async getCommands(filterUnderscoreCommands: boolean = false): Promise<string[]> {
        const result = await this.proxy.$getCommands();
        if (filterUnderscoreCommands) {
            return result.filter(command => command[0] !== '_');
        }
        return result;
    }
}
