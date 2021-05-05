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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import * as os from 'os';
import { ILogger } from '@theia/core/lib/common/logger';
import { TerminalProcess, TerminalProcessOptions, ProcessManager, MultiRingBuffer } from '@theia/process/lib/node';
import { isWindows, isOSX, OS } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { parseArgs } from '@theia/process/lib/node/utils';
import { IShellTerminalPreferences } from '../common/shell-terminal-protocol';

export const ShellProcessFactory = Symbol('ShellProcessFactory');
export type ShellProcessFactory = (options: ShellProcessOptions) => ShellProcess;

export const ShellProcessOptions = Symbol('ShellProcessOptions');
export interface ShellProcessOptions {
    shellPreferences?: IShellTerminalPreferences,
    shell?: string,
    args?: string[],
    rootURI?: string,
    cols?: number,
    rows?: number,
    env?: { [key: string]: string | null },
    isPseudo?: boolean,
}

function getRootPath(rootURI?: string): string {
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
        @inject(ILogger) @named('terminal') logger: ILogger
    ) {
        super(<TerminalProcessOptions>{
            command: options.shell || ShellProcess.getShellExecutablePath(options.shellPreferences),
            args: options.args || ShellProcess.getShellExecutableArgs(options.shellPreferences),
            options: {
                name: 'xterm-color',
                cols: options.cols || ShellProcess.defaultCols,
                rows: options.rows || ShellProcess.defaultRows,
                cwd: getRootPath(options.rootURI),
                env: mergeProcessEnv(options.env),
            },
            isPseudo: options.isPseudo,
        }, processManager, ringBuffer, logger);
    }

    public static getShellExecutablePath(preferences?: IShellTerminalPreferences): string {
        const shell = process.env.THEIA_SHELL;
        if (shell) {
            return shell;
        }
        if (preferences && preferences.shell[OS.type()]) {
            return preferences.shell[OS.type()]!;
        } else if (isWindows) {
            return 'cmd.exe';
        } else {
            return process.env.SHELL!;
        }
    }

    public static getShellExecutableArgs(preferences?: IShellTerminalPreferences): string[] {
        const args = process.env.THEIA_SHELL_ARGS;
        if (args) {
            return parseArgs(args);
        }
        if (preferences) {
            return preferences.shellArgs[OS.type()];
        } else if (isOSX) {
            return ['-l'];
        } else {
            return [];
        }
    }
}

/**
 * Merges a given record of environment variables with the process environment variables.
 * Empty string values will not be included in the final env.
 * @param env desired environment to merge with `process.env`.
 *
 * @returns a merged record of valid environment variables.
 */
 export function mergeProcessEnv(env: Record<string, string | null> = {}): Record<string, string> {
    // eslint-disable-next-line no-null/no-null
    const mergedEnv: Record<string, string> = Object.create(null);
    for (const [key, value] of Object.entries(process.env)) {
        // Ignore keys from `process.env` that are overridden in `env`. Accept only non-empty strings.
        if (!(key in env) && value) { mergedEnv[key] = value; }
    }
    for (const [key, value] of Object.entries(env)) {
        // Accept only non-empty strings from the `env` object.
        if (value) { mergedEnv[key] = value; }
    }
    return mergedEnv;
}
