/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger, DisposableCollection, isWindows } from '@theia/core/lib/common';
import {
    IBaseTerminalServer,
    IBaseTerminalServerOptions,
    IBaseTerminalClient,
    TerminalProcessInfo,
    EnvironmentVariableCollection,
    MergedEnvironmentVariableCollection,
    SerializableEnvironmentVariableCollection,
    EnvironmentVariableMutator,
    ExtensionOwnedEnvironmentVariableMutator,
    EnvironmentVariableMutatorType,
    EnvironmentVariableCollectionWithPersistence,
    SerializableExtensionEnvironmentVariableCollection
} from '../common/base-terminal-protocol';
import { TerminalProcess, ProcessManager } from '@theia/process/lib/node';
import { ShellProcess } from './shell-process';

@injectable()
export abstract class BaseTerminalServer implements IBaseTerminalServer {
    protected client: IBaseTerminalClient | undefined = undefined;
    protected terminalToDispose = new Map<number, DisposableCollection>();

    readonly collections: Map<string, EnvironmentVariableCollectionWithPersistence> = new Map();
    mergedCollection: MergedEnvironmentVariableCollection;

    constructor(
        @inject(ProcessManager) protected readonly processManager: ProcessManager,
        @inject(ILogger) @named('terminal') protected readonly logger: ILogger
    ) {
        processManager.onDelete(id => {
            const toDispose = this.terminalToDispose.get(id);
            if (toDispose !== undefined) {
                toDispose.dispose();
                this.terminalToDispose.delete(id);
            }
        });
        this.mergedCollection = this.resolveMergedCollection();
    }

    abstract create(options: IBaseTerminalServerOptions): Promise<number>;

    async attach(id: number): Promise<number> {
        const term = this.processManager.get(id);

        if (term && term instanceof TerminalProcess) {
            return term.id;
        } else {
            this.logger.warn(`Couldn't attach - can't find terminal with id: ${id} `);
            return -1;
        }
    }

    async getProcessId(id: number): Promise<number> {
        const terminal = this.processManager.get(id);
        if (!(terminal instanceof TerminalProcess)) {
            throw new Error(`terminal "${id}" does not exist`);
        }
        return terminal.pid;
    }

    async getProcessInfo(id: number): Promise<TerminalProcessInfo> {
        const terminal = this.processManager.get(id);
        if (!(terminal instanceof TerminalProcess)) {
            throw new Error(`terminal "${id}" does not exist`);
        }
        return {
            executable: terminal.executable,
            arguments: terminal.arguments,
        };
    }

    async getCwdURI(id: number): Promise<string> {
        const terminal = this.processManager.get(id);
        if (!(terminal instanceof TerminalProcess)) {
            throw new Error(`terminal "${id}" does not exist`);
        }
        return terminal.getCwdURI();
    }

    async close(id: number): Promise<void> {
        const term = this.processManager.get(id);

        if (term instanceof TerminalProcess) {
            term.kill();
        }
    }

    async getDefaultShell(): Promise<string> {
        return ShellProcess.getShellExecutablePath();
    }

    dispose(): void {
        // noop
    }

    async resize(id: number, cols: number, rows: number): Promise<void> {
        const term = this.processManager.get(id);
        if (term && term instanceof TerminalProcess) {
            term.resize(cols, rows);
        } else {
            console.warn("Couldn't resize terminal " + id + ", because it doesn't exist.");
        }
    }

    /* Set the client to receive notifications on.  */
    setClient(client: IBaseTerminalClient | undefined): void {
        this.client = client;
        if (!this.client) {
            return;
        }
        this.client.updateTerminalEnvVariables();
    }

    protected postCreate(term: TerminalProcess): void {
        const toDispose = new DisposableCollection();

        toDispose.push(term.onError(error => {
            this.logger.error(`Terminal pid: ${term.pid} error: ${error}, closing it.`);

            if (this.client !== undefined) {
                this.client.onTerminalError({
                    'terminalId': term.id,
                    'error': new Error(`Failed to execute terminal process (${error.code})`),
                });
            }
        }));

        toDispose.push(term.onExit(event => {
            if (this.client !== undefined) {
                this.client.onTerminalExitChanged({
                    'terminalId': term.id,
                    'code': event.code,
                    'signal': event.signal
                });
            }
        }));

        this.terminalToDispose.set(term.id, toDispose);
    }

    /*---------------------------------------------------------------------------------------------
     *  Copyright (c) Microsoft Corporation. All rights reserved.
     *  Licensed under the MIT License. See License.txt in the project root for license information.
     *--------------------------------------------------------------------------------------------*/
    // some code copied and modified from https://github.com/microsoft/vscode/blob/1.49.0/src/vs/workbench/contrib/terminal/common/environmentVariableService.ts

    setCollection(extensionIdentifier: string, persistent: boolean, collection: SerializableEnvironmentVariableCollection): void {
        const translatedCollection = { persistent, map: new Map<string, EnvironmentVariableMutator>(collection) };
        this.collections.set(extensionIdentifier, translatedCollection);
        this.updateCollections();
    }

    deleteCollection(extensionIdentifier: string): void {
        this.collections.delete(extensionIdentifier);
        this.updateCollections();
    }

    private updateCollections(): void {
        this.persistCollections();
        this.mergedCollection = this.resolveMergedCollection();
    }

    protected persistCollections(): void {
        const collectionsJson: SerializableExtensionEnvironmentVariableCollection[] = [];
        this.collections.forEach((collection, extensionIdentifier) => {
            if (collection.persistent) {
                collectionsJson.push({
                    extensionIdentifier,
                    collection: [...this.collections.get(extensionIdentifier)!.map.entries()]
                });
            }
        });
        if (this.client) {
            const stringifiedJson = JSON.stringify(collectionsJson);
            this.client.storeTerminalEnvVariables(stringifiedJson);
        }
    }

    private resolveMergedCollection(): MergedEnvironmentVariableCollection {
        return new MergedEnvironmentVariableCollectionImpl(this.collections);
    }

}

/*---------------------------------------------------------------------------------------------
     *  Copyright (c) Microsoft Corporation. All rights reserved.
     *  Licensed under the MIT License. See License.txt in the project root for license information.
     *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.49.0/src/vs/workbench/contrib/terminal/common/environmentVariableCollection.ts

export class MergedEnvironmentVariableCollectionImpl implements MergedEnvironmentVariableCollection {
    readonly map: Map<string, ExtensionOwnedEnvironmentVariableMutator[]> = new Map();

    constructor(collections: Map<string, EnvironmentVariableCollection>) {
        collections.forEach((collection, extensionIdentifier) => {
            const it = collection.map.entries();
            let next = it.next();
            while (!next.done) {
                const variable = next.value[0];
                let entry = this.map.get(variable);
                if (!entry) {
                    entry = [];
                    this.map.set(variable, entry);
                }

                // If the first item in the entry is replace ignore any other entries as they would
                // just get replaced by this one.
                if (entry.length > 0 && entry[0].type === EnvironmentVariableMutatorType.Replace) {
                    next = it.next();
                    continue;
                }

                // Mutators get applied in the reverse order than they are created
                const mutator = next.value[1];
                entry.unshift({
                    extensionIdentifier,
                    value: mutator.value,
                    type: mutator.type
                });

                next = it.next();
            }
        });
    }

    applyToProcessEnvironment(env: { [key: string]: string | null }): void {
        let lowerToActualVariableNames: { [lowerKey: string]: string | undefined } | undefined;
        if (isWindows) {
            lowerToActualVariableNames = {};
            Object.keys(env).forEach(e => lowerToActualVariableNames![e.toLowerCase()] = e);
        }
        this.map.forEach((mutators, variable) => {
            const actualVariable = isWindows ? lowerToActualVariableNames![variable.toLowerCase()] || variable : variable;
            mutators.forEach(mutator => {
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
        });
    }
}
