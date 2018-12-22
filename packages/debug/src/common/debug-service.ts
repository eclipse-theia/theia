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

// tslint:disable:no-any

import { Disposable } from '@theia/core';
import { ApplicationError } from '@theia/core/lib/common/application-error';
import { IJSONSchema, IJSONSchemaSnippet } from '@theia/core/lib/common/json-schema';
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
export interface DebugService extends Disposable {
    /**
     * Finds and returns an array of registered debug types.
     * @returns An array of registered debug types
     */
    debugTypes(): Promise<string[]>;

    getDebuggersForLanguage(language: string): Promise<DebuggerDescription[]>;

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
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values
     * or by adding/changing/removing attributes.
     * @param debugConfiguration The [debug configuration](#DebugConfiguration) to resolve.
     * @returns The resolved debug configuration.
     */
    resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri: string | undefined): Promise<DebugConfiguration>;

    /**
     * Creates a new [debug adapter session](#DebugAdapterSession).
     * @param config The resolved [debug configuration](#DebugConfiguration).
     * @returns The identifier of the created [debug adapter session](#DebugAdapterSession).
     */
    createDebugSession(config: DebugConfiguration): Promise<string>;

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
