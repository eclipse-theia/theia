/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { Emitter, Event, Disposable } from '@theia/core';
import type { IPty } from '@theia/node-pty';
import { Terminal, TerminalDataEvent, TerminalExitEvent, TerminalProcessInfo } from './terminal';
import { signame } from './utils';
import { TerminalBuffer } from './terminal-buffer';
import { Readable } from 'stream';

export class NodePtyTerminal implements Terminal {

    exitStatus?: TerminalExitEvent;

    protected onDataEmitter = new Emitter<TerminalDataEvent>();
    protected onExitEmitter = new Emitter<TerminalExitEvent>();
    protected onCloseEmitter = new Emitter<TerminalExitEvent>();

    constructor(
        public info: TerminalProcessInfo,
        /** Successfuly spawned node-pty pseudo-terminal. */
        protected pty: IPty,
        protected buffer: TerminalBuffer,
    ) {
        this.pty.onData(data => {
            this.buffer.push(data);
            this.onDataEmitter.fire(data);
        });
        this.pty.onExit(exit => {
            // node-pty quirk: On Linux/macOS, if the process exited through the
            // exit syscall (with an exit code), signal will be 0 (an invalid
            // signal value). If it was terminated because of a signal, the
            // signal parameter will hold the signal number and code should
            // be ignored.
            this.exitStatus =
                exit.signal === undefined || exit.signal === 0
                    ? { code: exit.exitCode }
                    : { signal: signame(exit.signal) };
            // node-pty actually waits for the underlying streams to be closed
            // before emitting exit. We still need to emit both events.
            this.onExitEmitter.fire(this.exitStatus);
            process.nextTick(() => {
                this.buffer.close();
                this.onCloseEmitter.fire(this.exitStatus!);
            });
        });
    }

    get onData(): Event<TerminalDataEvent> {
        return this.onDataEmitter.event;
    }

    get onExit(): Event<TerminalExitEvent> {
        return this.onExitEmitter.event;
    }

    get onClose(): Event<TerminalExitEvent> {
        return this.onCloseEmitter.event;
    }

    write(data: string): void {
        this.pty.write(data);
    }

    getOutputStream(encoding?: string): Readable & Disposable {
        return this.buffer.getOutputStream(encoding);
    }

    resize(cols: number, rows: number): void {
        this.pty.resize(cols, rows);
    }

    kill(): void {
        this.pty.kill();
    }
}
