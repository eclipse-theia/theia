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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Some entities copied and modified from https://github.com/Microsoft/vscode/blob/master/src/vs/vscode.d.ts
// Some entities copied and modified from https://github.com/Microsoft/vscode/blob/master/src/vs/workbench/parts/debug/common/debug.ts

import { Disposable } from "@theia/core";
import * as stream from 'stream';
import { DebugConfiguration, DebugSessionState } from "../common/debug-common";

/**
 * DebugAdapterSession symbol for DI.
 */
export const DebugAdapterSession = Symbol('DebugAdapterSession');

/**
 * The debug adapter session.
 */
export interface DebugAdapterSession {
    id: string;
    executable: DebugAdapterExecutable;
    configuration: DebugConfiguration;
    state: DebugSessionState;

    start(): Promise<void>
    stop(): Promise<void>
}

/**
 * DebugAdapterSessionFactory symbol for DI.
 */
export const DebugAdapterSessionFactory = Symbol("DebugAdapterSessionFactory");

/**
 * The [debug session](#DebugSession) factory.
 */
export interface DebugAdapterSessionFactory {
    get(sessionId: string, debugConfiguration: DebugConfiguration, executable: DebugAdapterExecutable): DebugAdapterSession;
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
 * DebugAdapterFactory symbol for DI.
 */
export const DebugAdapterFactory = Symbol('DebugAdapterFactory');

/**
 * Factory to start debug adapter.
 */
export interface DebugAdapterFactory {
    start(executable: DebugAdapterExecutable): CommunicationProvider;
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
     * The [debug session](#DebugSession) factory.
     */
    debugAdapterSessionFactory?: DebugAdapterSessionFactory;

    /**
     * Provides initial [debug configuration](#DebugConfiguration).
     * @returns An array of [debug configurations](#DebugConfiguration).
     */
    provideDebugConfigurations: DebugConfiguration[];

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
