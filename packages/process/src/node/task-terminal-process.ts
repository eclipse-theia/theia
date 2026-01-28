// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { TerminalProcess, TerminalProcessOptions } from './terminal-process';

export const TaskTerminalProcessFactory = Symbol('TaskTerminalProcessFactory');
export interface TaskTerminalProcessFactory {
    (options: TerminalProcessOptions): TaskTerminalProcess;
}

@injectable()
export class TaskTerminalProcess extends TerminalProcess {

    public exited = false;
    public attachmentAttempted = false;
    /**
     * Controls whether OSC (Operating System Command) sequences are injected
     * into the terminal stream for command history tracking.
     */
    protected _enableCommandHistory = false;

    setEnableCommandHistory(enable: boolean): void {
        this._enableCommandHistory = enable;
    }

    /**
     * injects the command to be tracked into the terminal output stream
     * only if command history tracking is enabled
     */
    injectCommandStartOsc(command: string): void {
        if (this._enableCommandHistory) {
            const encoded = Buffer.from(command).toString('hex');
            this.ringBuffer.enq(`\x1b]133;command_started;${encoded}\x07`);
        }
    }

    protected override onTerminalExit(code: number | undefined, signal: string | undefined): void {
        this.injectCommandEndOsc();
        this.emitOnExit(code, signal);
        this.exited = true;
        // Unregister process only if task terminal already attached (or failed attach),
        // Fixes https://github.com/eclipse-theia/theia/issues/2961
        if (this.attachmentAttempted) {
            this.unregisterProcess();
        }
    }

    override kill(signal?: string): void {
        this.injectCommandEndOsc();
        super.kill(signal);
    }

    protected injectCommandEndOsc(): void {
        if (this._enableCommandHistory) {
            // Mark the task command as finished in command history tracking.
            // OSC 133 'prompt_started' signals the end of command execution.
            this.ringBuffer.enq('\x1b]133;prompt_started\x07');
        }
    }

}
