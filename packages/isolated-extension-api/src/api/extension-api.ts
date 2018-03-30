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
import * as theia from 'theia';

export interface HostedExtensionManagerExt {
    loadExtension(ext: Extension): void;
    stopExtensions(): PromiseLike<void>;
}

export interface Extension {
    name: string;
    publisher: string;
    version: string;
    extPath: string;
}

/**
 * A command handler is an implementation of a command.
 *
 * A command can have multiple handlers
 * but they should be active in different contexts,
 * otherwise first active will be executed.
 */
export interface CommandHandler {
    /**
     * Execute this handler.
     */
    execute(...args: any[]): any;
    /**
     * Test whether this handler is enabled (active).
     */
    isEnabled?(...args: any[]): boolean;
    /**
     * Test whether menu items for this handler should be visible.
     */
    isVisible?(...args: any[]): boolean;
}

export interface CommandRegistryMain {
    /**
     * Register the given command and handler if present.
     *
     * Throw if a command is already registered for the given command identifier.
     */
    registerCommand(command: theia.Command): void;

    unregisterCommand(id: string): void;
    executeCommand<T>(id: string, args: any[]): PromiseLike<T>;
    getCommands(): PromiseLike<string[]>;
}

export interface CommandRegistryExt {
    executeCommand<T>(id: string): PromiseLike<T>;
}

export const EXTENSION_RPC_CONTEXT = {
    COMMAND_REGISTRY_MAIN: <ProxyIdentifier<CommandRegistryMain>>createProxyIdentifier<CommandRegistryMain>("CommandRegistryMain")
};

export const MAIN_RPC_CONTEXT = {
    HOSTED_EXTENSION_MANAGER_EXT: createProxyIdentifier<HostedExtensionManagerExt>("HostedExtensionManagerExt"),
    COMMAND_REGISTRY_EXT: createProxyIdentifier<CommandRegistryExt>("CommandRegistryExt")
};
