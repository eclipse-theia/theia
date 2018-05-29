/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { createProxyIdentifier, ProxyIdentifier } from './rpc-protocol';
import * as theia from '@theia/plugin';
import { PluginLifecycle, PluginModel, PluginMetadata } from '../common/plugin-protocol';

export interface HostedPluginManagerExt {
    $initialize(contextPath: string, pluginMedata: PluginMetadata): void;
    $loadPlugin(contextPath: string, plugin: Plugin): void;
    $stopPlugin(contextPath: string): PromiseLike<void>;
}

export interface Plugin {
    pluginPath: string;
    model: PluginModel;
    lifecycle: PluginLifecycle;
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

export interface AutoFocus {
    autoFocusFirstEntry?: boolean;
    // TODO
}

export interface PickOptions {
    placeHolder?: string;
    autoFocus?: AutoFocus;
    matchOnDescription?: boolean;
    matchOnDetail?: boolean;
    ignoreFocusLost?: boolean;
    quickNavigationConfiguration?: {}; // TODO
    contextKey?: string;
    canSelectMany?: boolean;
}

export interface PickOpenItem {
    handle: number;
    id?: string;
    label: string;
    description?: string;
    detail?: string;
    picked?: boolean;
}

export interface MessageRegistryMain {
    $showInformationMessage(message: string,
        optionsOrFirstItem: theia.MessageOptions | string | theia.MessageItem,
        items: string[] | theia.MessageItem[]): PromiseLike<string | theia.MessageItem | undefined>;
    $showWarningMessage(message: string,
        optionsOrFirstItem: theia.MessageOptions | string | theia.MessageItem,
        items: string[] | theia.MessageItem[]): PromiseLike<string | theia.MessageItem | undefined>;
    $showErrorMessage(message: string,
        optionsOrFirstItem: theia.MessageOptions | string | theia.MessageItem,
        items: string[] | theia.MessageItem[]): PromiseLike<string | theia.MessageItem | undefined>;
}

export interface StatusBarMessageRegistryMain {
    $setMessage(text: string,
                priority: number,
                alignment: theia.StatusBarAlignment,
                color: string | undefined,
                tooltip: string | undefined,
                command: string | undefined): PromiseLike<string>;
    $dispose(id: string): void;
}

export interface QuickOpenExt {
    $onItemSelected(handle: number): void;
    $validateInput(input: string): PromiseLike<string> | undefined;
}

export interface QuickOpenMain {
    $show(options: PickOptions): PromiseLike<number | number[]>;
    $setItems(items: PickOpenItem[]): PromiseLike<any>;
    $setError(error: Error): PromiseLike<any>;
    $input(options: theia.InputBoxOptions, validateInput: boolean): PromiseLike<string>;
}

export interface WindowStateExt {
    $onWindowStateChanged(focus: boolean): void;
}

export const PLUGIN_RPC_CONTEXT = {
    COMMAND_REGISTRY_MAIN: <ProxyIdentifier<CommandRegistryMain>>createProxyIdentifier<CommandRegistryMain>('CommandRegistryMain'),
    QUICK_OPEN_MAIN: createProxyIdentifier<QuickOpenMain>('QuickOpenMain'),
    MESSAGE_REGISTRY_MAIN: <ProxyIdentifier<MessageRegistryMain>>createProxyIdentifier<MessageRegistryMain>('MessageRegistryMain'),
    STATUS_BAR_MESSAGE_REGISTRY_MAIN: <ProxyIdentifier<StatusBarMessageRegistryMain>>createProxyIdentifier<StatusBarMessageRegistryMain>('StatusBarMessageRegistryMain')
};

export const MAIN_RPC_CONTEXT = {
    HOSTED_PLUGIN_MANAGER_EXT: createProxyIdentifier<HostedPluginManagerExt>('HostedPluginManagerExt'),
    COMMAND_REGISTRY_EXT: createProxyIdentifier<CommandRegistryExt>('CommandRegistryExt'),
    QUICK_OPEN_EXT: createProxyIdentifier<QuickOpenExt>('QuickOpenExt'),
    WINDOW_STATE_EXT: createProxyIdentifier<WindowStateExt>('WindowStateExt')
};
