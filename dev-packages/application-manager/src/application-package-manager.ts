/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs-extra';
import * as cp from 'child_process';
import { ApplicationPackage, ApplicationPackageOptions } from "@theia/application-package";
import { WebpackGenerator, FrontendGenerator, BackendGenerator } from "./generator";
import { ApplicationProcess } from './application-process';

export class ApplicationPackageManager {

    readonly pck: ApplicationPackage;
    /** application process */
    readonly process: ApplicationProcess;
    /** manager process */
    protected readonly __process: ApplicationProcess;
    protected readonly webpack: WebpackGenerator;
    protected readonly backend: BackendGenerator;
    protected readonly frontend: FrontendGenerator;

    constructor(options: ApplicationPackageOptions) {
        this.pck = new ApplicationPackage(options);
        this.process = new ApplicationProcess(this.pck, options.projectPath);
        this.__process = new ApplicationProcess(this.pck, `${__dirname}/..`);
        this.webpack = new WebpackGenerator(this.pck);
        this.backend = new BackendGenerator(this.pck);
        this.frontend = new FrontendGenerator(this.pck);
    }

    protected async remove(path: string): Promise<void> {
        if (await fs.pathExists(path)) {
            await fs.remove(path);
        }
    }

    async clean(): Promise<void> {
        await this.remove(this.pck.lib());
        await this.remove(this.pck.srcGen());
        await this.remove(this.webpack.configPath);
    }

    async generate(): Promise<void> {
        await this.webpack.generate();
        await this.backend.generate();
        await this.frontend.generate();
    }

    async copy(): Promise<void> {
        await fs.ensureDir(this.pck.lib());
        await fs.copy(this.pck.frontend('index.html'), this.pck.lib('index.html'));
    }

    async build(args: string[] = []): Promise<void> {
        await this.generate();
        await this.copy();
        return this.__process.run('webpack', args);
    }

    async start(args: string[] = []): Promise<void> {
        if (this.pck.isElectron()) {
            return this.startElectron(args);
        }
        return this.startBrowser(args);
    }

    async startElectron(args: string[]): Promise<void> {
        return this.__process.bunyan(
            this.__process.spawnBin('electron', [this.pck.frontend('electron-main.js'), ...args], {
                stdio: [0, 'pipe', 'pipe']
            })
        );
    }

    async startBrowser(args: string[]): Promise<void> {
        const options: cp.ForkOptions = {
            stdio: [0, 'pipe', 'pipe', 'ipc'],
            env: {
                ...process.env,
                THEIA_PARENT_PID: String(process.pid)
            }
        };
        const mainArgs = [...args];
        const inspectIndex = mainArgs.findIndex(v => v.startsWith('--inspect'));
        if (inspectIndex !== -1) {
            const inspectArg = mainArgs.splice(inspectIndex, 1)[0];
            options.execArgv = ['--nolazy', inspectArg];
        }
        return this.__process.bunyan(
            this.__process.fork(this.pck.backend('main.js'), mainArgs, options)
        );
    }

}
