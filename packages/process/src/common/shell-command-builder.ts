/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { injectable } from '@theia/core/shared/inversify';
import { createShellCommandLine, BashQuotingFunctions, PowershellQuotingFunctions, CmdQuotingFunctions, ShellQuoting, ShellQuotedString } from '../common/shell-quoting';

export interface ProcessInfo {
    executable: string
    arguments: string[]
}

export interface CommandLineOptions {
    cwd: string
    args: string[]
    env?: {
        [key: string]: string | null
    }
}

/**
 * Create command lines ready to be sent to a shell's stdin for evaluation.
 */
@injectable()
export class ShellCommandBuilder {

    /**
     * Constructs a command line to run in a shell. The shell could be
     * re-used/long-lived, this means we cannot spawn a new process with a nice
     * and fresh environment, we need to encode environment modifications into
     * the returned command.
     *
     * Inspired by VS Code implementation, see:
     * https://github.com/microsoft/vscode/blob/f395cac4fff0721a8099126172c01411812bcb4a/src/vs/workbench/contrib/debug/node/terminals.ts#L79
     *
     * @param hostProcessInfo the host terminal process infos
     * @param commandOptions program to execute in the host terminal
     */
    buildCommand(hostProcessInfo: ProcessInfo | undefined, commandOptions: CommandLineOptions): string {

        const host = hostProcessInfo && hostProcessInfo.executable;
        const cwd = commandOptions.cwd;

        const args = commandOptions.args.map(value => ({
            value, quoting: ShellQuoting.Strong,
        } as ShellQuotedString));

        const env: Array<[string, string | null]> = [];
        if (commandOptions.env) {
            for (const key of Object.keys(commandOptions.env)) {
                env.push([key, commandOptions.env[key]]);
            }
        }
        if (host) {
            if (/(bash|wsl)(.exe)?$/.test(host)) {
                return this.buildForBash(args, cwd, env);
            } else if (/(ps|pwsh|powershell)(.exe)?$/i.test(host)) {
                return this.buildForPowershell(args, cwd, env);
            } else if (/cmd(.exe)?$/i.test(host)) {
                return this.buildForCmd(args, cwd, env);
            }
        }
        return this.buildForDefault(args, cwd, env);
    }

    protected buildForBash(args: Array<string | ShellQuotedString>, cwd?: string, env?: Array<[string, string | null]>): string {
        let command = '';
        if (cwd) {
            command += `cd ${BashQuotingFunctions.strong(cwd)} && `;
        }
        if (env) {
            command += 'env';
            for (const [key, value] of env) {
                // eslint-disable-next-line no-null/no-null
                if (value === null) {
                    command += ` -u ${BashQuotingFunctions.strong(key)}`;
                } else {
                    command += ` ${BashQuotingFunctions.strong(`${key}=${value}`)}`;
                }
            }
            command += ' ';
        }
        command += createShellCommandLine(args, BashQuotingFunctions);
        return command;
    }

    protected buildForPowershell(args: Array<string | ShellQuotedString>, cwd?: string, env?: Array<[string, string | null]>): string {
        let command = '';
        if (cwd) {
            command += `cd ${PowershellQuotingFunctions.strong(cwd)}; `;
        }
        if (env) {
            for (const [key, value] of env) {
                // Powershell requires special quoting when dealing with
                // environment variable names.
                const quotedKey = key
                    .replace(/`/g, '````')
                    .replace(/\?/g, '``?');
                // eslint-disable-next-line no-null/no-null
                if (value === null) {
                    command += `Remove-Item \${env:${quotedKey}}; `;
                } else {
                    command += `\${env:${quotedKey}}=${PowershellQuotingFunctions.strong(value)}; `;
                }
            }
        }
        command += '& ' + createShellCommandLine(args, PowershellQuotingFunctions);
        return command;
    }

    protected buildForCmd(args: Array<string | ShellQuotedString>, cwd?: string, env?: Array<[string, string | null]>): string {
        let command = '';
        if (cwd) {
            command += `cd ${CmdQuotingFunctions.strong(cwd)} && `;
        }
        if (env) {
            command += 'cmd /C "';
            for (const [key, value] of env) {
                // eslint-disable-next-line no-null/no-null
                if (value === null) {
                    command += `set ${CmdQuotingFunctions.strong(key)}="" && `;
                } else {
                    command += `set ${CmdQuotingFunctions.strong(`${key}=${value}`)} && `;
                }
            }
        }
        command += createShellCommandLine(args, CmdQuotingFunctions);
        if (env) {
            command += '"';
        }
        return command;
    }

    protected buildForDefault(args: Array<string | ShellQuotedString>, cwd?: string, env?: Array<[string, string | null]>): string {
        return this.buildForBash(args, cwd, env);
    }

}
