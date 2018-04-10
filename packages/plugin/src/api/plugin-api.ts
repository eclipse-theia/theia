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
import { createProxyIdentifier, ProxyIdentifier } from './rpc-protocol';
import * as theia from '@theia/plugin';

export interface HostedPluginManagerExt {
    $loadPlugin(ext: Plugin): void;
    $stopPlugin(): PromiseLike<void>;
}

export interface Plugin {
    name: string;
    publisher: string;
    version: string;
    pluginPath: string;
}

export interface CommandRegistryMain {
    $registerCommand(command: theia.Command): void;

    $unregisterCommand(id: string): void;
    $executeCommand<T>(id: string, args: any[]): PromiseLike<T | undefined>;
    $getCommands(): PromiseLike<string[]>;
}

export interface CommandRegistryExt {
    $executeCommand<T>(id: string, ...ars: any[]): PromiseLike<T>;
}

export const PLUGIN_RPC_CONTEXT = {
    COMMAND_REGISTRY_MAIN: <ProxyIdentifier<CommandRegistryMain>>createProxyIdentifier<CommandRegistryMain>("CommandRegistryMain")
};

export const MAIN_RPC_CONTEXT = {
    HOSTED_PLUGIN_MANAGER_EXT: createProxyIdentifier<HostedPluginManagerExt>("HostedPluginManagerExt"),
    COMMAND_REGISTRY_EXT: createProxyIdentifier<CommandRegistryExt>("CommandRegistryExt")
};
