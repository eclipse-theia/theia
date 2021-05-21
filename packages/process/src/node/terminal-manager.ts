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

import { Emitter, Event } from '@theia/core/lib/common';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { injectable } from '@theia/core/shared/inversify';
import { Terminal } from './terminal';

@injectable()
export class TerminalManager implements BackendApplicationContribution {

    protected id: number = 0;
    protected terminals = new Map<number, Terminal>();
    protected onDeleteEmitter = new Emitter<number>();

    get onDelete(): Event<number> {
        return this.onDeleteEmitter.event;
    }

    /**
     * Registers the given terminal into this manager.
     *
     * @param factory function that takes the current id and should return the associated terminal.
     */
    register(factory: (id: number) => Terminal): Terminal {
        const id = this.id++;
        const terminal = factory(id);
        // terminal.onClose(() => this.terminals.delete(id));
        this.terminals.set(id, terminal);
        return terminal;
    }

    /**
     * Removes the terminal from this terminal manager. Invoking this method, will make
     * sure that the terminal is terminated before eliminating it from the manager's cache.
     *
     * @param terminal the terminal to unregister from this terminal manager.
     */
    kill(terminal: Terminal): void {
        const terminalLabel = this.getProcessLabel(terminal);
        console.debug(`Unregistering terminal. ${terminalLabel}`);
        if (terminal.exitStatus === undefined) {
            console.debug(`Ensuring terminal termination. ${terminalLabel}`);
            terminal.kill();
        }
        if (this.terminals.delete(terminal._id)) {
            this.onDeleteEmitter.fire(terminal._id);
            console.debug(`The terminal was successfully unregistered. ${terminalLabel}`);
        } else {
            console.warn(`This terminal was not registered or was already unregistered. ${terminalLabel}`);
        }
    }

    get(id: number): Terminal | undefined {
        return this.terminals.get(id);
    }

    onStop(): void {
        for (const terminal of this.terminals.values()) {
            try {
                this.kill(terminal);
            } catch (error) {
                console.error(`Error occurred when killing terminal. ${this.getProcessLabel(terminal)}`, error);
            }
        }
    }

    private getProcessLabel(terminal: Terminal): string {
        return `[ID: ${terminal._id}]`;
    }

}
