/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { interfaces } from "inversify";
import { CommandRegistry } from '@theia/core/lib/common/command';
import * as theia from '@theia/plugin';
import { Disposable } from '@theia/core/lib/common/disposable';
import { CommandRegistryMain, CommandRegistryExt, MAIN_RPC_CONTEXT } from "../../api/plugin-api";
import { RPCProtocol } from "../../api/rpc-protocol";

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
                execute: (...args: any[]) => {
                    this.proxy.$executeCommand(command.id);
                },
                isEnabled() { return true; },
                isVisible() { return true; }
            }));
    }
    $unregisterCommand(id: string): void {
        const dis = this.disposables.get(id);
        if (dis) {
            dis.dispose();
            this.disposables.delete(id);
        }
    }
    $executeCommand<T>(id: string, args: any[]): PromiseLike<T | undefined> {
        try {
            return Promise.resolve(this.delegate.executeCommand(id, args));
        } catch (e) {
            return Promise.reject(e);
        }
    }
    $getCommands(): PromiseLike<string[]> {
        throw new Error("Method not implemented.");
    }

}
