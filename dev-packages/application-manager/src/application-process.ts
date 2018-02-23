/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import * as cp from 'child_process';
import { ApplicationPackage } from '@theia/application-package';

export class ApplicationProcess {

    protected readonly defaultOptions = {
        cwd: this.pck.projectPath,
        env: process.env
    };

    constructor(
        protected readonly pck: ApplicationPackage,
        protected readonly binProjectPath: string
    ) { }

    spawn(command: string, args?: string[], options?: cp.SpawnOptions): cp.ChildProcess {
        return cp.spawn(command, args, Object.assign({}, this.defaultOptions, options));
    }
    fork(modulePath: string, args?: string[], options?: cp.ForkOptions): cp.ChildProcess {
        return cp.fork(modulePath, args, Object.assign({}, this.defaultOptions, options));
    }

    canRun(command: string): boolean {
        return fs.existsSync(this.resolveBin(command));
    }
    run(command: string, args: string[], options?: cp.SpawnOptions): Promise<void> {
        const commandProcess = this.spawnBin(command, args, options);
        return this.promisify(command, commandProcess);
    }
    spawnBin(command: string, args: string[], options?: cp.SpawnOptions): cp.ChildProcess {
        const binPath = this.resolveBin(command);
        return this.spawn(binPath, args, options);
    }
    protected resolveBin(command: string): string {
        const commandPath = path.resolve(this.binProjectPath, 'node_modules', '.bin', command);
        return process.platform === 'win32' ? commandPath + '.cmd' : commandPath;
    }

    bunyan(childProcess: cp.ChildProcess): Promise<void> {
        const bunyanProcess = this.spawnBin('bunyan', []);
        childProcess.stdout.pipe(bunyanProcess.stdin);
        childProcess.stderr.pipe(bunyanProcess.stdin);
        return this.promisify('bunyan', bunyanProcess);
    }

    protected promisify(command: string, p: cp.ChildProcess): Promise<void> {
        return new Promise((resolve, reject) => {
            p.stdout.on('data', data => this.pck.log(data.toString()));
            p.stderr.on('data', data => this.pck.error(data.toString()));
            p.on('error', reject);
            p.on('close', code => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(command + ' failed with the exit code ' + code));
                }
            });
        });
    }

}
