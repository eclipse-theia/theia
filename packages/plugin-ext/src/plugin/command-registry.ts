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
    private commands = new Map<string, Handler>();

    private readonly converter: CommandsConverter;

    // tslint:disable-next-line:no-any
    private static EMPTY_HANDLER(...args: any[]): Promise<any> { return Promise.resolve(undefined); }

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.COMMAND_REGISTRY_MAIN);
        this.converter = new CommandsConverter(this);

        // register internal VS Code commands
        this.registerHandler('vscode.previewHtml', CommandRegistryImpl.EMPTY_HANDLER);
    }

    getConverter(): CommandsConverter {
        return this.converter;
    }

    registerCommand(command: theia.Command, handler?: Handler): Disposable {
        if (this.commands.has(command.id)) {
            throw new Error(`Command ${command.id} already exist`);
        }
        if (handler) {
            this.commands.set(command.id, handler);
        }
        this.proxy.$registerCommand(command);

        return Disposable.create(() => {
            this.commands.delete(command.id);
            this.proxy.$unregisterCommand(command.id);
        });

    }

    registerHandler(commandId: string, handler: Handler): Disposable {
        if (this.commands.has(commandId)) {
            throw new Error(`Command ${commandId} already has handler`);
        }
        this.commands.set(commandId, handler);
        return Disposable.create(() => {
            this.commands.delete(commandId);
            this.proxy.$unregisterCommand(commandId);
        });
    }

    dispose(): void {
        throw new Error('Method not implemented.');
    }

    // tslint:disable-next-line:no-any
    $executeCommand<T>(id: string, args: any[]): PromiseLike<T> {
        if (this.commands.has(id)) {
            return this.executeLocalCommand(id, args);
        } else {
            return Promise.reject(`Command: ${id} does not exist.`);
        }
    }

    // tslint:disable-next-line:no-any
    executeCommand<T>(id: string, args: any[]): PromiseLike<T | undefined> {
        if (this.commands.has(id)) {
            return this.executeLocalCommand(id, args);
        } else {
            return this.proxy.$executeCommand(id, args);
        }
    }

    // tslint:disable-next-line:no-any
    private executeLocalCommand<T>(id: string, args: any[]): PromiseLike<T> {
        const handler = this.commands.get(id);
        if (handler) {
            return Promise.resolve(handler(args));
        } else {
            return Promise.reject(new Error(`Command ${id} doesn't exist`));
        }
    }
}

/** Converter between internal and api commands. */
export class CommandsConverter {

    private readonly delegatingCommandId: string;

    private cacheId = 0;
    private cache = new Map<number, theia.Command>();

    constructor(private readonly commands: CommandRegistryImpl) {
        this.delegatingCommandId = `_internal_command_delegation_${Date.now()}`;
        this.commands.registerHandler(this.delegatingCommandId, this.executeConvertedCommand);
    }

    toInternal(command: theia.Command | undefined): Command | undefined {
        if (!command || !command.label) {
            return undefined;
        }

        const result: Command = {
            id: command.id,
            title: command.label
        };

        if (command.id && !CommandsConverter.isFalsyOrEmpty(command.arguments)) {
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
                arguments: command.arguments
            };
        }
    }

    // tslint:disable-next-line:no-any
    private executeConvertedCommand(...args: any[]): PromiseLike<any> {
        const actualCmd = this.cache.get(args[0]);
        if (!actualCmd) {
            return Promise.resolve(undefined);
        }
        return this.commands.executeCommand(actualCmd.id, actualCmd.arguments || []);
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
