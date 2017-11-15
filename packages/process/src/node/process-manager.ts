/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from 'inversify';
import { Process } from './process';
import { Emitter, Event } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';

@injectable()
export class ProcessManager {

    protected id: number = 0;
    protected readonly processes: Map<number, Process>;
    protected readonly deleteEmitter: Emitter<number>;

    constructor( @inject(ILogger) protected logger: ILogger) {
        this.processes = new Map();
        this.deleteEmitter = new Emitter<number>();
    }

    register(process: Process): number {
        this.processes.set(++this.id, process);
        return this.id;
    }

    get(id: number): Process | undefined {
        return this.processes.get(id);
    }

    delete(process: Process): void {
        process.kill();
        if (!this.processes.delete(process.id)) {
            this.logger.warn(`The process was not registered via this manager. Anyway, we kill your process. PID: ${process.pid}.`);
        }
        this.deleteEmitter.fire(process.id);
    }

    get onDelete(): Event<number> {
        return this.deleteEmitter.event;
    }

}
