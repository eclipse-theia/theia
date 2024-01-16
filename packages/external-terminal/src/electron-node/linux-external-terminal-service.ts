// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as cp from 'child_process';
import * as fs from '@theia/core/shared/fs-extra';
import { injectable } from '@theia/core/shared/inversify';
import { OS } from '@theia/core/lib/common/os';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { ExternalTerminalService, ExternalTerminalConfiguration } from '../common/external-terminal';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.52.1/src/vs/workbench/contrib/externalTerminal/node/externalTerminalService.ts

@injectable()
export class LinuxExternalTerminalService implements ExternalTerminalService {
    protected DEFAULT_TERMINAL_LINUX_READY: Promise<string>;

    async openTerminal(configuration: ExternalTerminalConfiguration, cwd: string): Promise<void> {
        await this.spawnTerminal(configuration, FileUri.fsPath(cwd));
    }

    async getDefaultExec(): Promise<string> {
        return this.getDefaultTerminalLinux();
    }

    /**
     * Spawn the external terminal for the given options.
     * - The method spawns the terminal application based on the preferences, else uses the default value.
     * @param configuration the preference configuration.
     * @param cwd the optional current working directory to spawn from.
     */
    protected async spawnTerminal(configuration: ExternalTerminalConfiguration, cwd?: string): Promise<void> {

        // Use the executable value from the preferences if available, else fallback to the default.
        const terminalConfig = configuration['terminal.external.linuxExec'];
        const execPromise = terminalConfig ? Promise.resolve(terminalConfig) : this.getDefaultTerminalLinux();

        return new Promise<void>((resolve, reject) => {
            execPromise.then(exec => {
                const env = cwd ? { cwd } : undefined;
                const child = cp.spawn(exec, [], env);
                child.on('error', reject);
                child.on('exit', resolve);
            });
        });
    }

    /**
     * Get the default terminal application on Linux.
     * - The following method uses environment variables to identify the best default possible for each distro.
     *
     * @returns the default application on Linux.
     */
    protected async getDefaultTerminalLinux(): Promise<string> {
        if (!this.DEFAULT_TERMINAL_LINUX_READY) {
            this.DEFAULT_TERMINAL_LINUX_READY = new Promise(async resolve => {
                if (OS.type() === OS.Type.Linux) {
                    const isDebian = await fs.pathExists('/etc/debian_version');
                    if (isDebian) {
                        resolve('x-terminal-emulator');
                    } else if (process.env.DESKTOP_SESSION === 'gnome' || process.env.DESKTOP_SESSION === 'gnome-classic') {
                        resolve('gnome-terminal');
                    } else if (process.env.DESKTOP_SESSION === 'kde-plasma') {
                        resolve('konsole');
                    } else if (process.env.COLORTERM) {
                        resolve(process.env.COLORTERM);
                    } else if (process.env.TERM) {
                        resolve(process.env.TERM);
                    } else {
                        resolve('xterm');
                    }
                } else {
                    resolve('xterm');
                }
            });
        }
        return this.DEFAULT_TERMINAL_LINUX_READY;
    }
}
