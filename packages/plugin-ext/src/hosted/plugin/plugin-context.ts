/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as theia from '@theia/plugin';
import { CommandRegistryImpl } from './command-registry';
import { Emitter } from '@theia/core/lib/common/event';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { QuickOpenExtImpl } from './quick-open';
import { MAIN_RPC_CONTEXT, Plugin } from '../../api/plugin-api';
import { RPCProtocol } from '../../api/rpc-protocol';
import { getPluginId } from '../../common/plugin-protocol';
import { Disposable } from '../../common/types-impl';

export function createAPI(rpc: RPCProtocol): typeof theia {
    const commandRegistryExt = rpc.set(MAIN_RPC_CONTEXT.COMMAND_REGISTRY_EXT, new CommandRegistryImpl(rpc));
    const quickOpenExt = rpc.set(MAIN_RPC_CONTEXT.QUICK_OPEN_EXT, new QuickOpenExtImpl(rpc));

    const commands: typeof theia.commands = {
        registerCommand(command: theia.Command, handler?: <T>(...args: any[]) => T | Thenable<T>): Disposable {
            return commandRegistryExt.registerCommand(command, handler);
        },
        executeCommand<T>(commandId: string, ...args: any[]): PromiseLike<T | undefined> {
            return commandRegistryExt.executeCommand<T>(commandId, args);
        },
        registerTextEditorCommand(command: theia.Command, callback: (textEditor: theia.TextEditor, edit: theia.TextEditorEdit, ...arg: any[]) => void): Disposable {
            throw new Error("Function registerTextEditorCommand is not implemented");
        },
        registerHandler(commandId: string, handler: (...args: any[]) => any): Disposable {
            return commandRegistryExt.registerHandler(commandId, handler);
        }
    };

    const window: typeof theia.window = {
        showQuickPick(items: any, options: theia.QuickPickOptions, token?: theia.CancellationToken): any {
            return quickOpenExt.showQuickPick(items, options, token);
        }
    };

    return <typeof theia>{
        commands,
        window,
        // Types
        Disposable: Disposable,
        EventEmitter: Emitter,
        CancellationTokenSource: CancellationTokenSource
    };

}

export function startPlugin(plugin: Plugin, pluginMain: any, plugins: Map<string, () => void>): void {
    if (typeof pluginMain[plugin.lifecycle.startMethod] === 'function') {
        pluginMain[plugin.lifecycle.startMethod].apply(global, []);
    } else {
        console.log('there is no doStart method on plugin');
    }

    if (typeof pluginMain[plugin.lifecycle.stopMethod] === 'function') {
        const pluginId = getPluginId(plugin.model);
        plugins.set(pluginId, pluginMain[plugin.lifecycle.stopMethod]);
    }
}
