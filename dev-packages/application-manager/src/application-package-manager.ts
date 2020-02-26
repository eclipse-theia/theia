/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as path from 'path';
import * as fs from 'fs-extra';
import * as cp from 'child_process';
import { ApplicationPackage, ApplicationPackageOptions } from '@theia/application-package';
import { WebpackGenerator, FrontendGenerator, BackendGenerator } from './generator';
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
        this.__process = new ApplicationProcess(this.pck, path.join(__dirname, '..'));
        this.webpack = new WebpackGenerator(this.pck);
        this.backend = new BackendGenerator(this.pck);
        this.frontend = new FrontendGenerator(this.pck);
    }

    protected async remove(fsPath: string): Promise<void> {
        if (await fs.pathExists(fsPath)) {
            await fs.remove(fsPath);
        }
    }

    async clean(): Promise<void> {
        await this.remove(this.pck.lib());
        await this.remove(this.pck.srcGen());
        await this.remove(this.webpack.genConfigPath);
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

    start(args: string[] = []): cp.ChildProcess {
        if (this.pck.isElectron()) {
            return this.startElectron(args);
        }
        return this.startBrowser(args);
    }

    startElectron(args: string[]): cp.ChildProcess {
        // If possible, pass the project root directory to electron rather than the script file so that Electron
        // can determine the app name. This requires that the package.json has a main field.
        let appPath = this.pck.projectPath;

        if (!this.pck.pck.main) {
            appPath = this.pck.frontend('electron-main.js');

            console.warn(
                `WARNING: ${this.pck.packagePath} does not have a "main" entry.\n` +
                'Please add the following line:\n' +
                '    "main": "src-gen/frontend/electron-main.js"'
            );
        }

        const { mainArgs, options } = this.adjustArgs([ appPath, ...args ]);
        const electronCli = require.resolve('electron/cli.js', { paths: [this.pck.projectPath] });
        return this.__process.fork(electronCli, mainArgs, options);
    }

    startBrowser(args: string[]): cp.ChildProcess {
        const { mainArgs, options } = this.adjustArgs(args);
        return this.__process.fork(this.pck.backend('main.js'), mainArgs, options);
    }

    private adjustArgs(args: string[], forkOptions: cp.ForkOptions = {}): Readonly<{ mainArgs: string[]; options: cp.ForkOptions }> {
        const options = {
            ...this.forkOptions,
            forkOptions
        };
        const mainArgs = [...args];
        const inspectIndex = mainArgs.findIndex(v => v.startsWith('--inspect'));
        if (inspectIndex !== -1) {
            const inspectArg = mainArgs.splice(inspectIndex, 1)[0];
            options.execArgv = ['--nolazy', inspectArg];
        }
        return {
            mainArgs,
            options
        };
    }

    private get forkOptions(): cp.ForkOptions {
        return {
            stdio: [0, 1, 2, 'ipc'],
            env: {
                ...process.env,
                THEIA_PARENT_PID: String(process.pid)
            }
        };
    }

}
