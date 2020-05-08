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
import { injectable, inject, named } from 'inversify';
import { Process } from './process';
import { Emitter, Event } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';
import { BackendApplicationContribution } from '@theia/core/lib/node';

@injectable()
export class ProcessManager implements BackendApplicationContribution {

    protected id: number = 0;
    protected readonly processes: Map<number, Process>;
    protected readonly willReapProcesses: Map<number, Process>;
    protected readonly deleteEmitter: Emitter<number>;
    protected readonly REAP_TIMEOUT: number = 1000;

    constructor(
        @inject(ILogger) @named('process') protected logger: ILogger
    ) {
        this.processes = new Map();
        this.willReapProcesses = new Map();
        this.deleteEmitter = new Emitter<number>();
    }

    /**
     * Registers the given process into this manager. Both on process termination and on error,
     * the process will be automatically removed from the manager.
     *
     * @param process the process to register.
     */
    register(process: Process): number {
        const id = this.id;
        this.processes.set(id, process);
        process.onExit(() => this.unregister(process));
        process.onError(() => this.unregister(process));
        this.id++;
        return id;
    }

    /**
     * Removes the process from this process manager. Invoking this method, will make
     * sure that the process is terminated before eliminating it from the manager's cache.
     *
     * @param process the process to unregister from this process manager.
     */
    protected unregister(process: Process): void {
        const processLabel = this.getProcessLabel(process);
        this.logger.debug(`Unregistering process. ${processLabel}`);
        if (!process.killed) {
            this.logger.debug(`Ensuring process termination. ${processLabel}`);
            process.kill();
        }
        if (this.processes.delete(process.id)) {
            this.deleteEmitter.fire(process.id);
            // Process will be recorded in willReapProcesses for a while so that it's still possible to get information of it before it's automatically reaped
            this.willReapProcesses.set(process.id, process);
            setTimeout(() => {
                this.willReapProcesses.delete(process.id);
            }, this.REAP_TIMEOUT);
            this.logger.debug(`The process was successfully unregistered. ${processLabel}`);
        } else {
            this.logger.warn(`This process was not registered or was already unregistered. ${processLabel}`);
        }
    }

    /**
     * Get a process given its id. The process could be either alive, or dead and will be reaped soon.
     *
     * @param id the process id.
     */
    get(id: number): Process | undefined {
        return this.processes.get(id) || this.willReapProcesses.get(id);
    }

    /**
     * Get a process given its id. Only process marked alive will be returned.
     *
     * @param id the process id.
     */
    getAlive(id: number): Process | undefined {
        return this.processes.get(id);
    }

    get onDelete(): Event<number> {
        return this.deleteEmitter.event;
    }

    onStop(): void {
        for (const process of this.processes.values()) {
            try {
                this.unregister(process);
            } catch (error) {
                this.logger.error(`Error occurred when unregistering process. ${this.getProcessLabel(process)}`, error);
            }
        }
    }

    private getProcessLabel(process: Process): string {
        return `[ID: ${process.id}]`;
    }

}
