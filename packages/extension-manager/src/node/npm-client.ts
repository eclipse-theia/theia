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

import * as cp from 'child_process';
import { injectable, inject } from 'inversify';
import { cmd, CMD, ILogger, CancellationToken, checkCancelled, cancelled, Disposable } from '@theia/core';

@injectable()
export class NpmClientOptions {
    readonly npmClient: 'yarn' | 'npm';
}

@injectable()
export class NpmClient {

    constructor(
        @inject(NpmClientOptions) protected readonly options: NpmClientOptions,
        @inject(ILogger) protected readonly logger: ILogger
    ) { }

    execute(projectPath: string, command: string, args: string[], token?: CancellationToken): Promise<void> {
        checkCancelled(token);
        return new Promise((resolve, reject) => {
            const npmProcess = this.spawn(projectPath, command, args);
            const disposable = token ? token.onCancellationRequested(() => {
                npmProcess.kill('SIGKILL');
                reject(cancelled());
            }) : Disposable.NULL;

            npmProcess.stdout.on('data', data =>
                this.logger.info(data.toString())
            );
            npmProcess.stderr.on('data', data =>
                this.logger.error(data.toString())
            );

            npmProcess.on('close', (code, signal) => {
                disposable.dispose();

                if (code !== 0) {
                    reject(new Error(`Failed ${command} ${args}, code: ${code}, signal: ${signal}`));
                } else {
                    resolve();
                }
            });
            npmProcess.once('error', err => {
                disposable.dispose();
                reject(new Error(`Failed ${command} ${args}, the error: ${err}`));
            });
        });
    }

    spawn(projectPath: string, command: string, args?: string[]): cp.ChildProcess {
        const npmCommand = this.npmCommand(command);
        return this.doSpawn(projectPath, cmd(this.options.npmClient, npmCommand, ...(args || [])));
    }

    protected npmCommand(command: string): string {
        if (this.options.npmClient === 'yarn') {
            return command;
        }
        if (command === 'add') {
            return 'install';
        }
        if (command === 'remove') {
            return 'uninstall';
        }
        return command;
    }

    protected doSpawn(projectPath: string, [command, args]: CMD): cp.ChildProcess {
        this.logger.info(projectPath, command, ...args);
        return cp.spawn(command, args, {
            cwd: projectPath
        });
    }

}
