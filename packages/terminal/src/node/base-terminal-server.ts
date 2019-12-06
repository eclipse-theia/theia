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

import { inject, injectable, named } from 'inversify';
import { ILogger, DisposableCollection } from '@theia/core/lib/common';
import { IBaseTerminalServer, IBaseTerminalServerOptions, IBaseTerminalClient, TerminalProcessInfo } from '../common/base-terminal-protocol';
import { TerminalProcess, ProcessManager } from '@theia/process/lib/node';
import { ShellProcess } from './shell-process';

@injectable()
export abstract class BaseTerminalServer implements IBaseTerminalServer {
    protected client: IBaseTerminalClient | undefined = undefined;
    protected terminalToDispose = new Map<number, DisposableCollection>();

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
    }

    abstract create(options: IBaseTerminalServerOptions): Promise<number>;

    async attach(id: number): Promise<number> {
        const term = this.processManager.get(id);

        if (term && term instanceof TerminalProcess) {
            return term.id;
        } else {
            this.logger.error(`Couldn't attach - can't find terminal with id: ${id} `);
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
            console.error("Couldn't resize terminal " + id + ", because it doesn't exist.");
        }
    }

    /* Set the client to receive notifications on.  */
    setClient(client: IBaseTerminalClient | undefined): void {
        this.client = client;
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

}
