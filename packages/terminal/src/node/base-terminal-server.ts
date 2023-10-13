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
import { ILogger, DisposableCollection } from '@theia/core/lib/common';
import {
    IBaseTerminalServer,
    IBaseTerminalServerOptions,
    IBaseTerminalClient,
    TerminalProcessInfo,
    TerminalExitReason
} from '../common/base-terminal-protocol';
import { TerminalProcess, ProcessManager, TaskTerminalProcess } from '@theia/process/lib/node';
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
            this.logger.warn(`Couldn't attach - can't find terminal with id: ${id} `);
            return -1;
        }
    }

    async onAttachAttempted(id: number): Promise<void> {
        const terminal = this.processManager.get(id);
        if (terminal instanceof TaskTerminalProcess) {
            terminal.attachmentAttempted = true;
            if (terminal.exited) {
                // Didn't execute `unregisterProcess` on terminal `exit` event to enable attaching task output to terminal,
                // Fixes https://github.com/eclipse-theia/theia/issues/2961
                terminal.unregisterProcess();
            } else {
                this.postAttachAttempted(terminal);
            }
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

    protected notifyClientOnExit(term: TerminalProcess): DisposableCollection {
        const toDispose = new DisposableCollection();

        toDispose.push(term.onError(error => {
            this.logger.error(`Terminal pid: ${term.pid} error: ${error}, closing it.`);

            if (this.client !== undefined) {
                this.client.onTerminalError({
                    terminalId: term.id,
                    error: new Error(`Failed to execute terminal process (${error.code})`),
                    attached: term instanceof TaskTerminalProcess && term.attachmentAttempted
                });
            }
        }));

        toDispose.push(term.onExit(event => {
            if (this.client !== undefined) {
                this.client.onTerminalExitChanged({
                    terminalId: term.id,
                    code: event.code,
                    reason: TerminalExitReason.Process,
                    signal: event.signal,
                    attached: term instanceof TaskTerminalProcess && term.attachmentAttempted
                });
            }
        }));
        return toDispose;
    }

    protected postCreate(term: TerminalProcess): void {
        const toDispose = this.notifyClientOnExit(term);
        this.terminalToDispose.set(term.id, toDispose);
    }

    protected postAttachAttempted(term: TaskTerminalProcess): void {
        const toDispose = this.notifyClientOnExit(term);
        this.terminalToDispose.set(term.id, toDispose);
    }
}
