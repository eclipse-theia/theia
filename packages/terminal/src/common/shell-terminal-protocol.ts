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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { RpcProxy } from '@theia/core';
import { IBaseTerminalServer, IBaseTerminalServerOptions } from './base-terminal-protocol';
import { OS } from '@theia/core/lib/common/os';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering/markdown-string';

export const IShellTerminalServer = Symbol('IShellTerminalServer');

export interface IShellTerminalServer extends IBaseTerminalServer {
    hasChildProcesses(processId: number | undefined): Promise<boolean>;
    getEnvVarCollectionDescriptionsByExtension(id: number): Promise<Map<string, (string | MarkdownString | undefined)[]>>;
    getEnvVarCollections(): Promise<[string, string, boolean, SerializableEnvironmentVariableCollection][]>;

    restorePersisted(jsonValue: string): void;
    /**
     * Sets an extension's environment variable collection.
     */
    setCollection(extensionIdentifier: string, rootUri: string, persistent: boolean,
        collection: SerializableEnvironmentVariableCollection, description: string | MarkdownString | undefined): void;
    /**
     * Deletes an extension's environment variable collection.
     */
    deleteCollection(extensionIdentifier: string): void;
}

export const shellTerminalPath = '/services/shell-terminal';

export type ShellTerminalOSPreferences<T> = {
    [key in OS.Type]: T
};

export interface IShellTerminalPreferences {
    shell: ShellTerminalOSPreferences<string | undefined>,
    shellArgs: ShellTerminalOSPreferences<string[]>
};

export interface IShellTerminalServerOptions extends IBaseTerminalServerOptions {
    shell?: string,
    args?: string[] | string,
    rootURI?: string,
    cols?: number,
    rows?: number,
    env?: { [key: string]: string | null },
    strictEnv?: boolean,
    isPseudo?: boolean,
}

export const ShellTerminalServerProxy = Symbol('ShellTerminalServerProxy');
export type ShellTerminalServerProxy = RpcProxy<IShellTerminalServer>;

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.49.0/src/vs/workbench/contrib/terminal/common/environmentVariable.ts

export const NO_ROOT_URI = '<none>';

export interface EnvironmentVariableCollection {
    readonly variableMutators: ReadonlyMap<string, EnvironmentVariableMutator>;
    readonly description: string | MarkdownString | undefined;
}

export interface EnvironmentVariableCollectionWithPersistence extends EnvironmentVariableCollection {
    readonly persistent: boolean;
}

export enum EnvironmentVariableMutatorType {
    Replace = 1,
    Append = 2,
    Prepend = 3
}

export interface EnvironmentVariableMutatorOptions {
    applyAtProcessCreation?: boolean;
}

export interface EnvironmentVariableMutator {
    readonly value: string;
    readonly type: EnvironmentVariableMutatorType;
    readonly options: EnvironmentVariableMutatorOptions;
}

export interface SerializableEnvironmentVariableCollection {
    readonly description: string | MarkdownString | undefined;
    readonly mutators: [string, EnvironmentVariableMutator][]
};

