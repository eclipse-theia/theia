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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Channel, Disposable, Emitter, Event } from '@theia/core';
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
export interface DebugService extends Disposable {
    onDidChangeDebuggers?: Event<void>;

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
    provideDynamicDebugConfigurations?(folder?: string): Promise<Record<string, DebugConfiguration[]>>;

    /**
     * Provides a dynamic debug configuration matching the name and the provider debug type
     */
    fetchDynamicDebugConfiguration(name: string, type: string, folder?: string): Promise<DebugConfiguration | undefined>;

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

    /**
     * Event handle to indicate when one or more dynamic debug configuration providers
     * have been registered or unregistered.
     */
    onDidChangeDebugConfigurationProviders: Event<void>;
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
 * A closeable channel to send debug protocol messages over with error/close handling
 */
export interface DebugChannel {
    send(content: string): void;
    onMessage(cb: (message: string) => void): void;
    onError(cb: (reason: unknown) => void): void;
    onClose(cb: (code: number, reason: string) => void): void;
    close(): void;
}

/**
 * A {@link DebugChannel} wrapper implementation that sends and receives messages to/from an underlying {@link Channel}.
 */
export class ForwardingDebugChannel implements DebugChannel {
    private onMessageEmitter = new Emitter<string>();

    constructor(private readonly underlyingChannel: Channel) {
        this.underlyingChannel.onMessage(msg => this.onMessageEmitter.fire(msg().readString()));
    }

    send(content: string): void {
        this.underlyingChannel.getWriteBuffer().writeString(content).commit();
    }

    onMessage(cb: (message: string) => void): void {
        this.onMessageEmitter.event(cb);
    }
    onError(cb: (reason: unknown) => void): void {
        this.underlyingChannel.onError(cb);
    }
    onClose(cb: (code: number, reason: string) => void): void {
        this.underlyingChannel.onClose(event => cb(event.code ?? -1, event.reason));
    }

    close(): void {
        this.underlyingChannel.close();
        this.onMessageEmitter.dispose();
    }

}
