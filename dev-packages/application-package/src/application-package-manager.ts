/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs-extra';
import { ApplicationPackage, ApplicationPackageOptions } from "./application-package";
import { WebpackGenerator, FrontendGenerator, BackendGenerator } from "./generator";
import { ApplicationProcess } from './application-process';

export class ApplicationPackageManager {

    readonly pck: ApplicationPackage;
    protected readonly webpack: WebpackGenerator;
    protected readonly backend: BackendGenerator;
    protected readonly frontend: FrontendGenerator;
    protected readonly appProcess: ApplicationProcess;

    constructor(options: ApplicationPackageOptions) {
        this.pck = new ApplicationPackage(options);
        this.webpack = new WebpackGenerator(this.pck);
        this.backend = new BackendGenerator(this.pck);
        this.frontend = new FrontendGenerator(this.pck);
        this.appProcess = new ApplicationProcess(this.pck);
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
        return this.appProcess.run('webpack', args);
    }

    async start(args: string[] = []): Promise<void> {
        if (this.pck.isElectron()) {
            return this.startElectron(args);
        }
        return this.startBrowser(args);
    }

    async startElectron(args: string[]): Promise<void> {
        if (!args.some(arg => arg.startsWith('--hostname='))) {
            args.push('--hostname=localhost');
        }
        return this.appProcess.bunyan(
            this.appProcess.spawnBin('electron', [this.pck.frontend('electron-main.js'), ...args], {
                stdio: [0, 'pipe', 'pipe', 'ipc']
            })
        );
    }

    async startBrowser(args: string[]): Promise<void> {
        if (!args.some(arg => arg.startsWith('--port='))) {
            args.push('--port=3000');
        }
        return this.appProcess.bunyan(
            this.appProcess.fork(this.pck.backend('main.js'), args, {
                stdio: [0, 'pipe', 'pipe', 'ipc']
            })
        );
    }

}
