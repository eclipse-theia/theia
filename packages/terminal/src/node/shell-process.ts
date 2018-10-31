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

import { injectable, inject } from 'inversify';
import * as os from 'os';
import { TerminalProcess, TerminalProcessOptions, TerminalProcessFactory } from '@theia/process/lib/node';
import { isWindows, isOSX } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { parseArgs } from '@theia/process/lib/node/utils';

export const ShellProcessFactory = Symbol('ShellProcessFactory');
export interface ShellProcessFactory {
    create(options: ShellProcessOptions): Promise<TerminalProcess>;
}

export const ShellProcessOptions = Symbol('ShellProcessOptions');
export interface ShellProcessOptions {
    shell?: string,
    args?: string[],
    rootURI?: string,
    cols?: number,
    rows?: number,
    env?: { [key: string]: string | null },
}

const defaultCols = 80;
const defaultRows = 24;

@injectable()
export class ShellProcessFactoryImpl implements ShellProcessFactory {
    @inject(TerminalProcessFactory)
    protected terminalProcessFactory: TerminalProcessFactory;

    create(options: ShellProcessOptions): Promise<TerminalProcess> {
        const opts: TerminalProcessOptions = {
            command: options.shell || getShellExecutablePath(),
            args: options.args || getShellExecutableArgs(),
            options: {
                name: 'xterm-color',
                cols: options.cols || defaultCols,
                rows: options.rows || defaultRows,
                cwd: getRootPath(options.rootURI),
                env: setUpEnvVariables(options.env),
            }
        };

        return this.terminalProcessFactory.create(opts);
    }
}

function setUpEnvVariables(customEnv?: { [key: string]: string | null }): { [key: string]: string } {
    const processEnv: { [key: string]: string } = {};

    const prEnv: NodeJS.ProcessEnv = process.env;
    Object.keys(prEnv).forEach((key: string) => {
        processEnv[key] = prEnv[key] || '';
    });

    if (customEnv) {
        for (const envName of Object.keys(customEnv)) {
            processEnv[envName] = customEnv[envName] || '';
        }
    }

    return processEnv;
}

function getRootPath(rootURI?: string): string {
    if (rootURI) {
        const uri = new URI(rootURI);
        return FileUri.fsPath(uri);
    } else {
        return os.homedir();
    }
}

function getShellExecutablePath(): string {
    const shell = process.env.THEIA_SHELL;
    if (shell) {
        return shell;
    }
    if (isWindows) {
        return 'cmd.exe';
    } else {
        return process.env.SHELL!;
    }
}

function getShellExecutableArgs(): string[] {
    const args = process.env.THEIA_SHELL_ARGS;
    if (args) {
        return parseArgs(args);
    }
    if (isOSX) {
        return ['-l'];
    } else {
        return [];
    }
}
