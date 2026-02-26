// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import path = require('path');
import { GeneralShellType, guessShellTypeFromExecutable } from '../common/shell-type';
import { ShellProcess, ShellProcessOptions } from './shell-process';

export class ShellIntegrationInjector {

    static readonly INTEGRATION_ROOT_DIR = 'shell-integrations';

    static readonly BASH_RCFILE_FLAG = '--rcfile';
    static readonly BASH_INTEGRATION_SCRIPT_PATH = 'bash/bash-integration.bash';

    static readonly ZSH_INTEGRATION_ENV_VAR = 'THEIA_ZSH_DIR';
    static readonly ZSH_INTEGRATION_DIR = 'zsh';
    static readonly ZDOTDIR_ENV_VAR = 'ZDOTDIR';
    static readonly ZDOTDIR_RELATIVE_DIR = '/zsh/zdotdir/';
    static readonly ZDOTDIR_ORIGINAL_ENV_VAR = 'THEIA_ORIGINAL_ZDOTDIR';

    static injectShellIntegration(options: ShellProcessOptions): ShellProcessOptions {
        const shellExecutable = options.shell ?? ShellProcess.getShellExecutablePath();
        const shellType = guessShellTypeFromExecutable(shellExecutable);
        if (shellType === GeneralShellType.Bash) {
            // strips the login flag if present to avoid conflicts with --rcfile
            const filteredArgs = this.stripLoginFlag(options.args);
            return {
                ...options,
                args: [
                    this.BASH_RCFILE_FLAG, this.getShellIntegrationPath(this.BASH_INTEGRATION_SCRIPT_PATH),
                    ...(filteredArgs ?? []),
                ],
            };
        } else if (shellType === GeneralShellType.Zsh) {
            const zdotdirPath = this.getShellIntegrationPath(this.ZDOTDIR_RELATIVE_DIR);
            const zshDirPath = this.getShellIntegrationPath(this.ZSH_INTEGRATION_DIR);

            return {
                ...options,
                env: {
                    ...options.env,
                    [this.ZDOTDIR_ENV_VAR]: zdotdirPath,
                    [this.ZSH_INTEGRATION_ENV_VAR]: zshDirPath,
                    [this.ZDOTDIR_ORIGINAL_ENV_VAR]: options.env?.ZDOTDIR ?? process.env.ZDOTDIR ?? ''
                },
            };
        } else {
            return options;
        }
    }

    private static getShellIntegrationPath(relativePath: string): string {
        return path.join(__dirname, this.INTEGRATION_ROOT_DIR, relativePath);
    }

    private static stripLoginFlag(args: string | string[] | undefined): string[] | undefined {
        if (args === undefined) {
            return args;
        }
        if (typeof args === 'string') {
            // split string on any amount of whitespace into an array
            return args.trim().split(/\s+/).filter(arg => arg !== '-l' && arg !== '--login');
        }
        return args.filter(arg => arg !== '-l' && arg !== '--login');
    }

}
