// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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

import { Event, serviceIdentifier, servicePath } from '@theia/core';

export interface TerminalProcessInfo {
    executable: string
    arguments: string[]
}

export interface IBaseTerminalServerOptions { }

export const TERMINAL_ENVIRONMENT_STORE_PATH = servicePath<TerminalEnvironmentStore>('/services/terminal-environment-store');
export const TerminalEnvironmentStore = serviceIdentifier<TerminalEnvironmentStore>('TerminalEnvironmentVariableStore');
/**
 * Store environment variables.
 */
export interface TerminalEnvironmentStore {
    getEnvironmentVariables(): Promise<string | undefined>;
    saveEnvironmentVariables(data: string): Promise<void>;
}

/**
 * Agglomerate of events from potentially multiple servers.
 */
export const TerminalWatcher = serviceIdentifier<TerminalWatcher>('TerminalWatcher');
export interface TerminalWatcher extends IBaseTerminalEvents { }

export interface IBaseTerminalEvents {
    onTerminalExitChanged: Event<IBaseTerminalExitEvent>;
    onTerminalError: Event<IBaseTerminalErrorEvent>;
}

export interface IBaseTerminalServer extends IBaseTerminalEvents {
    create(options?: IBaseTerminalServerOptions): Promise<number>;
    getProcessId(id: number): Promise<number>;
    getProcessInfo(id: number): Promise<TerminalProcessInfo>;
    getCwdURI(id: number): Promise<string>;
    resize(id: number, cols: number, rows: number): Promise<void>;
    attach(id: number): Promise<number>;
    attachAttempted(id: number): Promise<void>;
    close(id: number): Promise<void>;
    getDefaultShell(): Promise<string>;

    /**
     * Gets a single collection constructed by merging all environment variable collections into
     * one.
     */
    readonly collections: ReadonlyMap<string, EnvironmentVariableCollection>;
    /**
     * Gets a single collection constructed by merging all environment variable collections into
     * one.
     */
    readonly mergedCollection: MergedEnvironmentVariableCollection;
    /**
     * Sets an extension's environment variable collection.
     */
    setCollection(extensionIdentifier: string, persistent: boolean, collection: SerializableEnvironmentVariableCollection): void;
    /**
     * Deletes an extension's environment variable collection.
     */
    deleteCollection(extensionIdentifier: string): void;
}
export namespace IBaseTerminalServer {
    export function validateId(id?: number): boolean {
        return typeof id === 'number' && id !== -1;
    }
}

export interface IBaseTerminalExitEvent {
    terminalId: number;

    // Exactly one of code and signal will be set.
    code?: number;
    signal?: string;
}

export interface IBaseTerminalErrorEvent {
    terminalId: number;
    error: Error
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.49.0/src/vs/workbench/contrib/terminal/common/environmentVariable.ts

export const ENVIRONMENT_VARIABLE_COLLECTIONS_KEY = 'terminal.integrated.environmentVariableCollections';

export interface EnvironmentVariableCollection {
    readonly map: ReadonlyMap<string, EnvironmentVariableMutator>;
}

export interface EnvironmentVariableCollectionWithPersistence extends EnvironmentVariableCollection {
    readonly persistent: boolean;
}

export enum EnvironmentVariableMutatorType {
    Replace = 1,
    Append = 2,
    Prepend = 3
}

export interface EnvironmentVariableMutator {
    readonly value: string;
    readonly type: EnvironmentVariableMutatorType;
}

export interface ExtensionOwnedEnvironmentVariableMutator extends EnvironmentVariableMutator {
    readonly extensionIdentifier: string;
}

/**
 * Represents an environment variable collection that results from merging several collections
 * together.
 */
export interface MergedEnvironmentVariableCollection {
    readonly map: ReadonlyMap<string, ExtensionOwnedEnvironmentVariableMutator[]>;

    /**
     * Applies this collection to a process environment.
     */
    applyToProcessEnvironment(env: { [key: string]: string | null }): void;
}

export interface SerializableExtensionEnvironmentVariableCollection {
    extensionIdentifier: string,
    collection: SerializableEnvironmentVariableCollection
}

export type SerializableEnvironmentVariableCollection = [string, EnvironmentVariableMutator][];
