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

import { Disposable } from '@theia/core';
import { DebugProtocol } from 'vscode-debugprotocol';
import { DebugConfiguration } from "./debug-model";

/**
 * The WS endpoint path to the Debug service.
 */
export const DebugPath = '/services/debug';

/**
 * DebugServer symbol for DI.
 */
export const DebugServer = Symbol('DebugServer');

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
export interface DebugServer extends Disposable {
    /**
     * Finds and returns an array of registered debugger types.
     * @return An array of registered debugger types
     */
    listDebugConfigurationProviders(): string[];

    /**
     * Provides initial [debug configuration](#DebugConfiguration). If more than one debug configuration provider is
     * registered for the same type, debug configurations are concatenated in arbitrary order.
     * @param debuggerType The registered debugger type
     * @return An array of [debug configurations](#DebugConfiguration)
     */
    provideDebugConfiguration(debuggerType: string): DebugConfiguration[];

    /**
      * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values or by adding/changing/removing attributes.
      * If more than one debug configuration provider is registered for the same type, the #resolveDebugConfiguration calls are chained
      * in arbitrary order and the initial debug configuration is piped through the chain.
      * Returning the value 'undefined' prevents the debug session from starting.
      * @param debuggerType The registered debugger type
      * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
      * @return The resolved debug configuration or undefined.
      */
    resolveDebugConfiguration(debuggerType: string, config: DebugConfiguration): DebugConfiguration | undefined;

    /**
     * Creates a [debug session](#DebugSession) based on resolved configuration.
     * Creation doesn't imply starting a debugger itself but it is rather implementation specific.
     * Returning the value 'undefined' means the session can't be created.
     * @param debuggerType The debugger type
     * @param config The [debug configuration](#DebugConfiguration) to create session based on
     * @return The identifier of the created [debug session](#DebugSession)
     */
    createDebugSession(debuggerType: string, config: DebugConfiguration): string | undefined;

    /**
     * Sends initialize request to the given [debug session](#DebugSession).
     * Returning the value 'undefined' means the session with the given identifier isn't found.
     * @param sessionId The session identifier
     * @param initializeRequest The initialize request
     */
    initializeRequest(sessionId: string, initializeRequest: DebugProtocol.InitializeRequest): DebugProtocol.InitializeResponse | undefined;
}

/**
 * DebugConfigurationProvider symbol for DI.
 */
export const DebugConfigurationProvider = Symbol('DebugConfigurationProvider');

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
     * @return An array of [debug configurations](#DebugConfiguration).
     */
    provideDebugConfigurations(): DebugConfiguration[];

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values or by adding/changing/removing attributes.
     * If more than one debug configuration provider is registered for the same type, the #resolveDebugConfiguration calls are chained
     * in arbitrary order and the initial debug configuration is piped through the chain.
     * Returning the value 'undefined' prevents the debug session from starting.
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @return The resolved debug configuration or undefined.
     */
    resolveDebugConfiguration(config: DebugConfiguration): DebugConfiguration | undefined;
}

/**
 * DebugConfigurationRegistry symbol for DI.
 */
export const DebugConfigurationRegistry = Symbol('DebugConfigurationRegistry');

/**
 * The registry containing [debug configuration providers](#DebugConfigurationProvider).
 */
export interface DebugConfigurationRegistry {

    /**
     * Registers provider by its type.
     * @param debuggerType The debugger type
     * @param provider The configuration provider
     */
    registerDebugConfigurationProvider(debuggerType: string, provider: DebugConfigurationProvider): void;
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
    registerDebugConfigurationProvider(registry: DebugConfigurationRegistry): void;
}

/**
 * The registry containing [debug session factories](#DebugSessionFactory).
 */
export interface DebugSessionFactoryRegistry {
    /**
     * Registers factory by its type.
     * @param debuggerType The debugger type
     * @param factory The debug session factory
     */
    registerDebugSessionFactory(debuggerType: string, factory: DebugSessionFactory): void;
}

/**
 * DebugSessionFactoryContribution symbol for DI.
 */
export const DebugSessionFactoryContribution = Symbol('DebugSessionFactoryContribution');

/**
 * The debug session factory contribution should be implemented to register session factories.
 */
export interface DebugSessionFactoryContribution {
    /**
     * Registers debug session factory.
     */
    registerDebugSessionFactory(registry: DebugSessionFactoryRegistry): void;
}

/**
 * DebugSessionFactory symbol for DI.
 */
export const DebugSessionFactory = Symbol('DebugSessionFactory');

/**
 * Debug session instantiator. It is used to create session once
 * debug configuration is resolved. A debug session factory is registered into
 * [debug session factory registry](#DebugSessionFactoryRegistry) by its type.
 */
export interface DebugSessionFactory {
    /**
     * Creates a [debug session](#DebugSession) based on configuration.
     * Creation doesn't imply starting a debugger itself but it is rather implementation specific.
     * Returning the value 'undefined' means the session can't be created.
     * @param config The [debug configuration](#DebugConfiguration) to create session based on
     * @return The debug session
     */
    create(config: DebugConfiguration): DebugSession | undefined;
}

/**
 * The debug session.
 */
export interface DebugSession extends Disposable {
    initializeRequest(initializeRequest: DebugProtocol.InitializeRequest): DebugProtocol.InitializeResponse;
}
