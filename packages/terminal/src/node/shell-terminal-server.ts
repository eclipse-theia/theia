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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { EnvironmentUtils } from '@theia/core/lib/node/environment-utils';
import { BaseTerminalServer } from './base-terminal-server';
import { ShellProcessFactory, getRootPath } from './shell-process';
import { ProcessManager, TerminalProcess } from '@theia/process/lib/node';
import { isWindows } from '@theia/core/lib/common/os';
import * as cp from 'child_process';
import {
    EnvironmentVariableCollectionWithPersistence, EnvironmentVariableMutatorType, NO_ROOT_URI, SerializableEnvironmentVariableCollection,
    IShellTerminalServer, IShellTerminalServerOptions
}
    from '../common/shell-terminal-protocol';
import { URI } from '@theia/core';
import { MultiKeyMap } from '@theia/core/lib/common/collections';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering/markdown-string';

interface SerializedExtensionEnvironmentVariableCollection {
    extensionIdentifier: string,
    rootUri: string,
    collection: SerializableEnvironmentVariableCollection,
}

@injectable()
export class ShellTerminalServer extends BaseTerminalServer implements IShellTerminalServer {
    @inject(EnvironmentUtils) protected environmentUtils: EnvironmentUtils;

    readonly collections: MultiKeyMap<string, EnvironmentVariableCollectionWithPersistence> = new MultiKeyMap(2);

    constructor(
        @inject(ShellProcessFactory) protected readonly shellFactory: ShellProcessFactory,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(ILogger) @named('terminal') logger: ILogger) {
        super(processManager, logger);
    }

    async create(options: IShellTerminalServerOptions): Promise<number> {
        try {
            if (options.strictEnv !== true) {
                options.env = this.environmentUtils.mergeProcessEnv(options.env);
                this.applyToProcessEnvironment(URI.fromFilePath(getRootPath(options.rootURI)), options.env);
            }
            const term = this.shellFactory(options);
            this.postCreate(term);
            return term.id;
        } catch (error) {
            this.logger.error('Error while creating terminal', error);
            return -1;
        }
    }

    // copied and modified from https://github.com/microsoft/vscode/blob/4636be2b71c87bfb0bfe3c94278b447a5efcc1f1/src/vs/workbench/contrib/debug/node/terminals.ts#L32-L75
    private spawnAsPromised(command: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            let stdout = '';
            const child = cp.spawn(command, args, {
                shell: true
            });
            if (child.pid) {
                child.stdout.on('data', (data: Buffer) => {
                    stdout += data.toString();
                });
            }
            child.on('error', err => {
                reject(err);
            });
            child.on('close', code => {
                resolve(stdout);
            });
        });
    }

    public hasChildProcesses(processId: number | undefined): Promise<boolean> {
        if (processId) {
            // if shell has at least one child process, assume that shell is busy
            if (isWindows) {
                return this.spawnAsPromised('wmic', ['process', 'get', 'ParentProcessId']).then(stdout => {
                    const pids = stdout.split('\r\n');
                    return pids.some(p => parseInt(p) === processId);
                }, error => true);
            } else {
                return this.spawnAsPromised('/usr/bin/pgrep', ['-lP', String(processId)]).then(stdout => {
                    const r = stdout.trim();
                    if (r.length === 0 || r.indexOf(' tmux') >= 0) { // ignore 'tmux';
                        return false;
                    } else {
                        return true;
                    }
                }, error => true);
            }
        }
        // fall back to safe side
        return Promise.resolve(true);
    }

    applyToProcessEnvironment(cwdUri: URI, env: { [key: string]: string | null }): void {
        let lowerToActualVariableNames: {
            [lowerKey: string]: string | undefined
        } | undefined;
        if (isWindows) {
            lowerToActualVariableNames = {};
            Object.keys(env).forEach(e => lowerToActualVariableNames![e.toLowerCase()] = e);
        }
        this.collections.forEach((mutators, [extensionIdentifier, rootUri]) => {
            if (rootUri === NO_ROOT_URI || this.matchesRootUri(cwdUri, rootUri)) {
                mutators.variableMutators.forEach((mutator, variable) => {
                    const actualVariable = isWindows ? lowerToActualVariableNames![variable.toLowerCase()] || variable : variable;
                    switch (mutator.type) {
                        case EnvironmentVariableMutatorType.Append:
                            env[actualVariable] = (env[actualVariable] || '') + mutator.value;
                            break;
                        case EnvironmentVariableMutatorType.Prepend:
                            env[actualVariable] = mutator.value + (env[actualVariable] || '');
                            break;
                        case EnvironmentVariableMutatorType.Replace:
                            env[actualVariable] = mutator.value;
                            break;
                    }
                });
            }
        });
    }

    matchesRootUri(cwdUri: URI, rootUri: string): boolean {
        return new URI(rootUri).isEqualOrParent(cwdUri);
    }

    /*---------------------------------------------------------------------------------------------
  *  Copyright (c) Microsoft Corporation. All rights reserved.
  *  Licensed under the MIT License. See License.txt in the project root for license information.
  *--------------------------------------------------------------------------------------------*/
    // some code copied and modified from https://github.com/microsoft/vscode/blob/1.49.0/src/vs/workbench/contrib/terminal/common/environmentVariableService.ts

    setCollection(extensionIdentifier: string, baseUri: string, persistent: boolean,
        collection: SerializableEnvironmentVariableCollection): void {
        this.doSetCollection(extensionIdentifier, baseUri, persistent, collection);
        this.updateCollections();
    }

    private doSetCollection(extensionIdentifier: string, baseUri: string, persistent: boolean,
        collection: SerializableEnvironmentVariableCollection): void {
        this.collections.set([extensionIdentifier, baseUri], {
            persistent: persistent,
            description: collection.description,
            variableMutators: new Map(collection.mutators)
        });
    }

    restorePersisted(jsonValue: string): void {
        const collectionsJson: SerializedExtensionEnvironmentVariableCollection[] = JSON.parse(jsonValue);
        collectionsJson.forEach(c => this.doSetCollection(c.extensionIdentifier, c.rootUri ?? NO_ROOT_URI, true, c.collection));

    }

    deleteCollection(extensionIdentifier: string): void {
        this.collections.delete([extensionIdentifier]);
        this.updateCollections();
    }

    private updateCollections(): void {
        this.persistCollections();
    }

    protected persistCollections(): void {
        const collectionsJson: SerializedExtensionEnvironmentVariableCollection[] = [];
        this.collections.forEach((collection, [extensionIdentifier, rootUri]) => {
            if (collection.persistent) {
                collectionsJson.push({
                    extensionIdentifier,
                    rootUri,
                    collection: {
                        description: collection.description,
                        mutators: [...this.collections.get([extensionIdentifier, rootUri])!.variableMutators.entries()]
                    },
                });
            }
        });
        if (this.client) {
            const stringifiedJson = JSON.stringify(collectionsJson);
            this.client.storeTerminalEnvVariables(stringifiedJson);
        }
    }

    async getEnvVarCollectionDescriptionsByExtension(id: number): Promise<Map<string, (string | MarkdownString | undefined)[]>> {
        const terminal = this.processManager.get(id);
        if (!(terminal instanceof TerminalProcess)) {
            throw new Error(`terminal "${id}" does not exist`);
        }
        const result = new Map<string, (string | MarkdownString | undefined)[]>();
        this.collections.forEach((value, key) => {
            const prev = result.get(key[0]) || [];
            prev.push(value.description);
            result.set(key[0], prev);
        });
        return result;
    }

    async getEnvVarCollections(): Promise<[string, string, boolean, SerializableEnvironmentVariableCollection][]> {
        const result: [string, string, boolean, SerializableEnvironmentVariableCollection][] = [];

        this.collections.forEach((value, [extensionIdentifier, rootUri]) => {
            result.push([extensionIdentifier, rootUri, value.persistent, { description: value.description, mutators: [...value.variableMutators.entries()] }]);
        });

        return result;
    }
}
