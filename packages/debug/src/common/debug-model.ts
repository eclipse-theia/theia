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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Some entities copied and modified from https://github.com/Microsoft/vscode/blob/master/src/vs/vscode.d.ts
// Some entities copied and modified from https://github.com/Microsoft/vscode/blob/master/src/vs/workbench/parts/debug/common/debug.ts

import { Disposable } from '@theia/core';
import { DebugProtocol } from 'vscode-debugprotocol';

/**
 * The WS endpoint path to the Debug service.
 */
export const DebugPath = '/services/debug';

/**
 * DebugService symbol for DI.
 */
export const DebugService = Symbol('DebugService');

/**
 * Ties client and server providing functionality to debug applications.
 *
 * The workflow is the following. If user wants to debug an application and
 * there is no debug configuration associated with the application then
 * the list of available providers is requested to create suitable debug configuration.
 * When configuration is chosen the configuration provider is able to alter the configuration
 * by filling in missing values or by adding/changing/removing attributes. For this purpose the
 * #resolveDebugConfiguration method is invoked. At final stage the a debug session will be
 * created.
 */
export interface DebugService extends Disposable {
    /**
     * Finds and returns an array of registered debug types.
     * @returns An array of registered debug types
     */
    listDebugConfigurationProviders(): Promise<string[]>;

    /**
     * Provides initial [debug configuration](#DebugConfiguration). If more than one debug configuration provider is
     * registered for the same type, debug configurations are concatenated in arbitrary order.
     * @param debugType The registered debug type
     * @returns An array of [debug configurations](#DebugConfiguration)
     */
    provideDebugConfiguration(debugType: string): Promise<DebugConfiguration[]>;

    /**
      * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values or by adding/changing/removing attributes.
      * If more than one debug configuration provider is registered for the same type, the #resolveDebugConfiguration calls are chained
      * in arbitrary order and the initial debug configuration is piped through the chain.
      * Returning the value 'undefined' prevents the debug session from starting.
      * @param debugType The registered debug type
      * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
      * @returns The resolved debug configuration or undefined.
      */
    resolveDebugConfiguration(debugType: string, config: DebugConfiguration): Promise<DebugConfiguration | undefined>;

    /**
     * Provides a [command line](#DebugAdapterExecutable) based on [debug configuration](#DebugConfiguration)
     * to start a new debug adapter. Returning the value 'undefined' means that it is impossible
     * to construct a command line based on given debug configuration to start a debug adapter.
     * @param debugType The registered debug type
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @returns The [command line](#DebugAdapterExecutable).
     */
    provideDebugAdapterExecutable(debugType: string, config: DebugConfiguration): Promise<DebugAdapterExecutable | undefined>;

    /**
     * Starts a debug adapter.
     * Returning the value 'undefined' means the debug adapter can't be started.
     * @param executable The [command line](#DebugAdapterExecutable) to start a debug adapter.
     * @returns The identifier of the created [debug session](#DebugSession)
     */
    start(executable: DebugAdapterExecutable): Promise<string | undefined>;
}

/**
 * Contains a command line to start a debug adapter.
 */
export interface DebugAdapterExecutable {
    /**
     * The command to launch.
     */
    command: string;

    /**
     * The arguments.
     */
    args?: string[];
}

/**
 * A debug configuration provider allows to add the initial debug configurations
 * and to resolve a configuration before it is used to start a new debug session.
 * A debug configuration provider is registered into
 * [debug configuration registry](#DebugConfigurationRegistry) by its type.
 */
export interface DebugConfigurationProvider {
    /**
     * Provides initial [debug configuration](#DebugConfiguration). If more than one debug configuration provider is
     * registered for the same type, debug configurations are concatenated in arbitrary order.
     * @returns An array of [debug configurations](#DebugConfiguration).
     */
    provideDebugConfigurations(): DebugConfiguration[];

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values or by adding/changing/removing attributes.
     * If more than one debug configuration provider is registered for the same type, the #resolveDebugConfiguration calls are chained
     * in arbitrary order and the initial debug configuration is piped through the chain.
     * Returning the value 'undefined' prevents the debug session from starting.
     * @param config The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration or undefined.
     */
    resolveDebugConfiguration(config: DebugConfiguration): DebugConfiguration | undefined;

    /**
     * Provides a [command line](#DebugAdapterExecutable) based on [debug configuration](#DebugConfiguration)
     * to start a new debug adapter. Returning the value 'undefined' means that it is impossible
     * to construct a command line based on given debug configuration to start a debug adapter.
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @returns The [command line](#DebugAdapterExecutable).
     */
    provideDebugAdapterExecutable(config: DebugConfiguration): DebugAdapterExecutable | undefined;
}

/**
 * The registry containing [debug configuration providers](#DebugConfigurationProvider).
 */
export interface DebugConfigurationProviderRegistry {

    /**
     * Registers provider by its type.
     * @param debugType The debug type
     * @param provider The configuration provider
     */
    registerDebugConfigurationProvider(debugType: string, provider: DebugConfigurationProvider): void;
}

/**
 * DebugConfigurationContribution symbol for DI.
 */
export const DebugConfigurationContribution = Symbol('DebugConfigurationContribution');

/**
 * The debug configuration contribution should be implemented to register configuration providers.
 */
export interface DebugConfigurationContribution {
    /**
     * Registers debug configuration provider.
     */
    registerDebugConfigurationProvider(registry: DebugConfigurationProviderRegistry): void;
}

/**
 * Configuration for a debug session.
 */
export interface DebugConfiguration {
    /**
     * The type of the debug session.
     */
    type: string;

    /**
     * The name of the debug session.
     */
    name: string;

    /**
     * Additional debug type specific properties.
     */
    [key: string]: any;
}

/**
 * The endpoint path to the debug session.
 */
export const DebugSessionPath = '/services/debug-session';

/**
 * The debug session.
 */
export interface DebugSession extends Disposable {
    sendRequest(request: DebugProtocol.Request): void;
}
