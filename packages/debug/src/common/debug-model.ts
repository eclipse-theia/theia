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
import * as stream from 'stream';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';

/**
 * The WS endpoint path to the Debug service.
 */
export const DebugPath = '/services/debug';

/**
 * DebugService symbol for DI.
 */
export const DebugService = Symbol('DebugService');

/**
 * This service provides functionality to configure and to start a new debug adapter session.
 * The workflow is the following. If user wants to debug an application and
 * there is no debug configuration associated with the application then
 * the list of available providers is requested to create suitable debug configuration.
 * When configuration is chosen it is possible to alter the configuration
 * by filling in missing values or by adding/changing/removing attributes. For this purpose the
 * #resolveDebugConfiguration method is invoked. After that the debug adapter session will be started.
 */
export interface DebugService extends Disposable {
    /**
     * Finds and returns an array of registered debug types.
     * @returns An array of registered debug types
     */
    debugTypes(): Promise<string[]>;

    /**
     * Provides initial [debug configuration](#DebugConfiguration).
     * @param debugType The registered debug type
     * @returns An array of [debug configurations](#DebugConfiguration)
     */
    provideDebugConfigurations(debugType: string): Promise<DebugConfiguration[]>;

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values
     * or by adding/changing/removing attributes.
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration.
     */
    resolveDebugConfiguration(config: DebugConfiguration): Promise<DebugConfiguration>;

    /**
     * Starts a new [debug adapter session](#DebugAdapterSession).
     * Returning the value 'undefined' means the debug adapter session can't be started.
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @returns The identifier of the created [debug adapter session](#DebugAdapterSession).
     */
    start(config: DebugConfiguration): Promise<string>;
}

/**
 * Debug adapter executable.
 */
export interface DebugAdapterExecutable {
    /**
     * Parameters to instantiate the debug adapter. In case of launching adapter
     * the parameters contain a command and arguments. For instance:
     * {"program" : "COMMAND_TO_LAUNCH_DEBUG_ADAPTER", args : [ { "arg1", "arg2" } ] }
     */
    [key: string]: any;
}

/**
 * Provides some way we can communicate with the running debug adapter. In general there is
 * no obligation as of how to launch/initialize local or remote debug adapter
 * process/server, it can be done separately and it is not required that this interface covers the
 * procedure, however it is also not disallowed.
 */
export interface CommunicationProvider extends Disposable {
    output: stream.Readable;
    input: stream.Writable;
}

/**
 * DebugAdapterContribution symbol for DI.
 */
export const DebugAdapterContribution = Symbol('DebugAdapterContribution');

/**
 * A contribution point for debug adapters.
 */
export interface DebugAdapterContribution {
    /**
     * The debug type.
     */
    readonly debugType: string;

    /**
     * Provides initial [debug configuration](#DebugConfiguration).
     * @returns An array of [debug configurations](#DebugConfiguration).
     */
    provideDebugConfigurations(): DebugConfiguration[];

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values
     * or by adding/changing/removing attributes.
     * @param config The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration or undefined.
     */
    resolveDebugConfiguration(config: DebugConfiguration): DebugConfiguration;

    /**
     * Provides a [debug adapter executable](#DebugAdapterExecutable)
     * based on [debug configuration](#DebugConfiguration) to launch a new debug adapter.
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @returns The [debug adapter executable](#DebugAdapterExecutable).
     */
    provideDebugAdapterExecutable(config: DebugConfiguration): DebugAdapterExecutable;
}

/**
 * Configuration for a debug adapter session.
 */
export interface DebugConfiguration {
    /**
     * The type of the debug adapter session.
     */
    type: string;

    /**
     * The name of the debug adapter session.
     */
    name: string;

    /**
     * Additional debug type specific properties.
     */
    [key: string]: any;
}

/**
 * The endpoint path to the debug adapter session.
 */
export const DebugAdapterPath = '/services/debug-adapter';

/**
 * The debug session state.
 */
export interface DebugSessionState {
    /**
     * Indicates if debug session is connected to the debug adapter.
     */
    readonly isConnected: boolean | undefined;

    /**
     * The debug session breakpoints.
     */
    readonly breakpoints: DebugProtocol.Breakpoint[];

    /**
     * Indicates if all threads are continued.
     */
    readonly allThreadsContinued: boolean | undefined;

    /**
     * Indicates if all threads are stopped.
     */
    readonly allThreadsStopped: boolean | undefined;

    /**
     * Stopped threads.
     */
    readonly stoppedThreads: number[];
}
