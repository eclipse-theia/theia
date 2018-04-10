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
import { CommandRegistryExt, PLUGIN_RPC_CONTEXT as Ext, CommandRegistryMain } from '../api/plugin-api';
import { RPCProtocol } from '../api/rpc-protocol';
import * as theia from '@theia/plugin';
import { Disposable } from './types-impl';

export type Handler = <T>(...args: any[]) => T | PromiseLike<T>;

export class CommandRegistryImpl implements CommandRegistryExt {

    private proxy: CommandRegistryMain;
    private commands = new Map<string, Handler>();

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.COMMAND_REGISTRY_MAIN);
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
            this.proxy.$unregisterCommand(command.id);
        });

    }

    registerHandler(commandId: string, handler: Handler): Disposable {
        if (this.commands.has(commandId)) {
            throw new Error(`Command ${commandId} already has handler`);
        }
        this.commands.set(commandId, handler);
        return Disposable.create(() => {
            this.proxy.$unregisterCommand(commandId);
        });
    }

    dispose(): void {
        throw new Error("Method not implemented.");
    }

    $executeCommand<T>(id: string, ...args: any[]): PromiseLike<T> {
        if (this.commands.has(id)) {
            return this.executeLocalCommand(id, args);
        } else {
            return Promise.reject(`Command: ${id} does not exist.`);
        }
    }

    executeCommand<T>(id: string, ...args: any[]): PromiseLike<T | undefined> {
        if (this.commands.has(id)) {
            return this.executeLocalCommand(id, args);
        } else {
            return this.proxy.$executeCommand(id, args);
        }
    }

    private executeLocalCommand<T>(id: string, ...args: any[]): PromiseLike<T> {
        const handler = this.commands.get(id);
        if (handler) {
            return Promise.resolve(handler(args));
        } else {
            return Promise.reject(new Error(`Command ${id} doesn't exist`));
        }
    }
}
