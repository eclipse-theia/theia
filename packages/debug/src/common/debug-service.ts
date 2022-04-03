// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Connection } from '@theia/core';
import { ApplicationError } from '@theia/core/lib/common/application-error';
import { IJSONSchema, IJSONSchemaSnippet } from '@theia/core/lib/common/json-schema';
import { CommandIdVariables } from '@theia/variable-resolver/lib/common/variable-types';
import { DebugConfiguration } from './debug-configuration';

export interface DebuggerDescription {
    type: string
    label: string
}

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
export interface DebugService {
    /**
     * Finds and returns an array of registered debug types.
     * @returns An array of registered debug types
     */
    debugTypes(): Promise<string[]>;

    getDebuggersForLanguage(language: string): Promise<DebuggerDescription[]>;

    /**
     * Provide debugger contributed variables
     * see "variables" at https://code.visualstudio.com/api/references/contribution-points#contributes.debuggers
     */
    provideDebuggerVariables(debugType: string): Promise<CommandIdVariables>;

    /**
     * Provides the schema attributes.
     * @param debugType The registered debug type
     * @returns An JSON Schema describing the configuration attributes for the given debug type
     */
    getSchemaAttributes(debugType: string): Promise<IJSONSchema[]>;

    getConfigurationSnippets(): Promise<IJSONSchemaSnippet[]>;

    /**
     * Provides initial [debug configuration](#DebugConfiguration).
     * @param debugType The registered debug type
     * @returns An array of [debug configurations](#DebugConfiguration)
     */
    provideDebugConfigurations(debugType: string, workspaceFolderUri: string | undefined): Promise<DebugConfiguration[]>;

    /**
     * @returns A Record of debug configuration provider types and a corresponding dynamic debug configurations array
     */
    provideDynamicDebugConfigurations?(): Promise<Record<string, DebugConfiguration[]>>;

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values
     * or by adding/changing/removing attributes before variable substitution.
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration, undefined or null.
     */
    resolveDebugConfiguration(
        config: DebugConfiguration,
        workspaceFolderUri: string | undefined
    ): Promise<DebugConfiguration | undefined | null>;

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values
     * or by adding/changing/removing attributes with substituted variables.
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration, undefined or null.
     */
    resolveDebugConfigurationWithSubstitutedVariables(
        config: DebugConfiguration,
        workspaceFolderUri: string | undefined
    ): Promise<DebugConfiguration | undefined | null>;

    /**
     * Creates a new [debug adapter session](#DebugAdapterSession).
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @param workspaceFolderUri The workspace folder for this sessions or undefined when folderless
     * @returns The identifier of the created [debug adapter session](#DebugAdapterSession).
     */
    createDebugSession(config: DebugConfiguration, workspaceFolderUri: string | undefined): Promise<string>;

    /**
     * Stop a running session for the given session id.
     */
    terminateDebugSession(sessionId: string): Promise<void>;
}

/**
 * The endpoint path to the debug adapter session.
 */
export const DebugAdapterPath = '/services/debug-adapter';

export namespace DebugError {
    export const NotFound = ApplicationError.declare(-41000, (type: string) => ({
        message: `'${type}' debugger type is not supported.`,
        data: { type }
    }));
}

/**
 * A closeable channel to send messages over with error/close handling
 */
export interface Channel {
    send(content: string): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onMessage(cb: (data: any) => void): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError(cb: (reason: any) => void): void;
    onClose(cb: (code: number, reason: string) => void): void;
    close(): void;
}

/**
 * @internal
 */
export class ConnectionAsChannel implements Channel {
    constructor(
        protected connection: Connection<string>
    ) { }
    send(content: string): void {
        this.connection.sendMessage(content);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onMessage(cb: (data: any) => void): void {
        this.connection.onMessage(cb);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError(cb: (reason: any) => void): void {
        this.connection.onError(cb);
    }
    onClose(cb: (code: number, reason: string) => void): void {
        this.connection.onClose(() => cb(-1, ''));
    }
    close(): void {
        this.connection.close();
    }
}
