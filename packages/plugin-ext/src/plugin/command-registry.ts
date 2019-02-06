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
import { Command } from '../api/model';
import { ObjectIdentifier } from '../common/object-identifier';

// tslint:disable-next-line:no-any
export type Handler = <T>(...args: any[]) => T | PromiseLike<T>;

export class CommandRegistryImpl implements CommandRegistryExt {

    private proxy: CommandRegistryMain;
    private readonly commands = new Set<string>();
    private readonly handlers = new Map<string, Handler>();
    private converter: CommandsConverter;
    private cache = new Map<number, theia.Command>();
    private delegatingCommandId: string;

    // tslint:disable-next-line:no-any
    private static EMPTY_HANDLER(...args: any[]): Promise<any> { return Promise.resolve(undefined); }

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.COMMAND_REGISTRY_MAIN);

        // register internal VS Code commands
        this.registerCommand({ id: 'vscode.previewHtml' }, CommandRegistryImpl.EMPTY_HANDLER);
    }

    getConverter(): CommandsConverter {
        if (this.converter) {
            return this.converter;
        } else {
            this.delegatingCommandId = `_internal_command_delegation_${Date.now()}`;
            const command: theia.Command = {
                id: this.delegatingCommandId
            };
            this.registerCommand(command, this.executeConvertedCommand);
            this.converter = new CommandsConverter(this.delegatingCommandId, this.cache);
            return this.converter;
        }
    }

    // tslint:disable-next-line:no-any
    registerCommand(command: theia.Command, handler?: Handler, thisArg?: any): Disposable {
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
            return Promise.reject(`Command: ${id} does not exist.`);
        }
    }

    // tslint:disable-next-line:no-any
    executeCommand<T>(id: string, ...args: any[]): PromiseLike<T | undefined> {
        if (this.handlers.has(id)) {
            return this.executeLocalCommand(id, ...args);
        } else {
            return this.proxy.$executeCommand(id, ...args);
        }
    }

    getKeyBinding(commandId: string): PromiseLike<theia.CommandKeyBinding[] | undefined> {
        return this.proxy.$getKeyBinding(commandId);
    }

    // tslint:disable-next-line:no-any
    private executeLocalCommand<T>(id: string, ...args: any[]): PromiseLike<T> {
        const handler = this.handlers.get(id);
        if (handler) {
            const result = id === this.delegatingCommandId ?
                handler(this, ...args)
                : handler.apply(undefined, args);
            return Promise.resolve(result);
        } else {
            return Promise.reject(new Error(`Command ${id} doesn't exist`));
        }
    }

    // tslint:disable-next-line:no-any
    executeConvertedCommand(commands: CommandRegistryImpl, ...args: any[]): PromiseLike<any> {
        const actualCmd = commands.cache.get(args[0]);
        if (!actualCmd) {
            return Promise.resolve(undefined);
        }
        return commands.executeCommand(actualCmd.command ? actualCmd.command : actualCmd.id, ...(actualCmd.arguments || []));
    }

    async getCommands(filterUnderscoreCommands: boolean = false): Promise<string[]> {
        const result = await this.proxy.$getCommands();
        if (filterUnderscoreCommands) {
            return result.filter(command => command[0] !== '_');
        }
        return result;
    }
}

/** Converter between internal and api commands. */
export class CommandsConverter {
    private readonly delegatingCommandId: string;
    private cacheId = 0;
    private cache: Map<number, theia.Command>;

    constructor(id: string, cache: Map<number, theia.Command>) {
        this.cache = cache;
        this.delegatingCommandId = id;
    }

    toInternal(command: theia.Command | undefined): Command | undefined {
        if (!command) {
            return undefined;
        }

        let title;
        if (command.title) {
            title = command.title;
        } else if (command.label) {
            title = command.label;
        } else {
            return undefined;
        }

        const result: Command = {
            id: command.command ? command.command : command.id,
            title: title
        };

        if (command.command && !CommandsConverter.isFalsyOrEmpty(command.arguments)) {
            const id = this.cacheId++;
            ObjectIdentifier.mixin(result, id);
            this.cache.set(id, command);

            result.id = this.delegatingCommandId;
            result.arguments = [id];
        }

        if (command.tooltip) {
            result.tooltip = command.tooltip;
        }

        return result;
    }

    fromInternal(command: Command | undefined): theia.Command | undefined {
        if (!command) {
            return undefined;
        }

        const id = ObjectIdentifier.of(command);
        if (typeof id === 'number') {
            return this.cache.get(id);
        } else {
            return {
                id: command.id,
                label: command.title,
                command: command.id,
                title: command.title,
                arguments: command.arguments
            };
        }
    }

    /**
     * @returns `false` if the provided object is an array and not empty.
     */
    // tslint:disable-next-line:no-any
    private static isFalsyOrEmpty(obj: any): boolean {
        // tslint:disable-next-line:no-any
        return !Array.isArray(obj) || (<Array<any>>obj).length === 0;
    }
}
