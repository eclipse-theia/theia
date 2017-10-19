/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable } from 'inversify';
import * as child from 'child_process';

@injectable()
export class GDBProbe {

    /* Should fetch gdb path from the preferences */

    constructor() {
    }

    public probeCommand(command: string): Promise<boolean> {
        const p: Promise<boolean> = new Promise(resolve => {
            const args = ['-batch', `-ex`, command];
            const process = child.spawn('gdb', args);
            process.stdout.on('data', data => console.log(data.toString()));
            process.stderr.on('data', data => console.log(data.toString()));
            process.on('exit', (code: number, signal: string) => {
                if (code < 1) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        });
        return p;
    }
}