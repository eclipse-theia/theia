// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import * as os from 'os';
import { ILogger } from '@theia/core/lib/common/logger';
import { TerminalProcess, TerminalProcessOptions, ProcessManager, MultiRingBuffer } from '@theia/process/lib/node';
import { isWindows, isOSX } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { EnvironmentUtils } from '@theia/core/lib/node/environment-utils';
import { parseArgs } from '@theia/process/lib/node/utils';

export const ShellProcessFactory = Symbol('ShellProcessFactory');
export type ShellProcessFactory = (options: ShellProcessOptions) => ShellProcess;

export const ShellProcessOptions = Symbol('ShellProcessOptions');
export interface ShellProcessOptions {
    shell?: string,
    args?: string[] | string,
    rootURI?: string,
    cols?: number,
    rows?: number,
    env?: { [key: string]: string | null },
    strictEnv?: boolean,
    isPseudo?: boolean,
}

export function getRootPath(rootURI?: string): string {
    if (rootURI) {
        const uri = new URI(rootURI);
        return FileUri.fsPath(uri);
    } else {
        return os.homedir();
    }
}

@injectable()
export class ShellProcess extends TerminalProcess {

    protected static defaultCols = 80;
    protected static defaultRows = 24;

    constructor( // eslint-disable-next-line @typescript-eslint/indent
        @inject(ShellProcessOptions) options: ShellProcessOptions,
        @inject(ProcessManager) processManager: ProcessManager,
        @inject(MultiRingBuffer) ringBuffer: MultiRingBuffer,
        @inject(ILogger) @named('terminal') logger: ILogger,
        @inject(EnvironmentUtils) environmentUtils: EnvironmentUtils,
    ) {
        const env = { 'COLORTERM': 'truecolor' };
        super(<TerminalProcessOptions>{
            command: options.shell || ShellProcess.getShellExecutablePath(),
            args: options.args || ShellProcess.getShellExecutableArgs(),
            options: {
                name: 'xterm-256color',
                cols: options.cols || ShellProcess.defaultCols,
                rows: options.rows || ShellProcess.defaultRows,
                cwd: getRootPath(options.rootURI),
                env: options.strictEnv !== true ? Object.assign(env, environmentUtils.mergeProcessEnv(options.env)) : Object.assign(env, options.env),
            },
            isPseudo: options.isPseudo,
        }, processManager, ringBuffer, logger);
    }

    public static getShellExecutablePath(): string {
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

    public static getShellExecutableArgs(): string[] {
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
}
