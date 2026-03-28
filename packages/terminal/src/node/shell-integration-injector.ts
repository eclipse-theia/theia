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
import * as fs from 'fs';
import { GeneralShellType, guessShellTypeFromExecutable } from '../common/shell-type';
import { ShellProcess, ShellProcessOptions } from './shell-process';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class ShellIntegrationInjector {

    protected readonly INTEGRATION_ROOT_DIR = 'shell-integrations';

    protected readonly BASH_RCFILE_FLAG = '--rcfile';
    protected readonly BASH_INTEGRATION_SCRIPT_PATH = 'bash/bash-integration.bash';

    protected readonly ZSH_INTEGRATION_ENV_VAR = 'THEIA_ZSH_DIR';
    protected readonly ZSH_INTEGRATION_DIR = 'zsh';
    protected readonly ZDOTDIR_ENV_VAR = 'ZDOTDIR';
    protected readonly ZDOTDIR_RELATIVE_DIR = '/zsh/zdotdir/';
    protected readonly ZDOTDIR_ORIGINAL_ENV_VAR = 'THEIA_ORIGINAL_ZDOTDIR';

    injectShellIntegration(options: ShellProcessOptions): ShellProcessOptions {
        const shellExecutable = options.shell ?? ShellProcess.getShellExecutablePath();
        const shellType = guessShellTypeFromExecutable(shellExecutable);
        if (shellType === GeneralShellType.Bash) {
            const scriptPath = this.getShellIntegrationPath(this.BASH_INTEGRATION_SCRIPT_PATH);
            if (!scriptPath) {
                return options;
            }
            // strips the login flag if present to avoid conflicts with --rcfile
            const filteredArgs = this.stripLoginFlag(options.args);
            return {
                ...options,
                args: [
                    this.BASH_RCFILE_FLAG, scriptPath,
                    ...(filteredArgs ?? []),
                ],
            };
        } else if (shellType === GeneralShellType.Zsh) {
            const zdotdirPath = this.getShellIntegrationPath(this.ZDOTDIR_RELATIVE_DIR);
            const zshDirPath = this.getShellIntegrationPath(this.ZSH_INTEGRATION_DIR);
            if (!zdotdirPath || !zshDirPath) {
                return options;
            }
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

    protected getShellIntegrationPath(relativePath: string): string | undefined {
        const fullPath = path.join(__dirname, this.INTEGRATION_ROOT_DIR, relativePath);
        if (!fs.existsSync(fullPath)) {
            console.warn(`Shell integration file not found (application may not be bundled correctly): ${fullPath}`);
            return undefined;
        }
        return fullPath;
    }

    protected stripLoginFlag(args: string | string[] | undefined): string[] | undefined {
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
