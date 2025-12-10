// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

    static bashFlag = '--rcfile';
    static bashIntegrationScript = 'bash/bash-integration.bash';
    static IntegrationPath = 'shell-integrations';
    static ZshIntegration = 'THEIA_ZSH_DIR';
    static ZshIntegrationPath = 'zsh';
    static ZDOTDIR = 'ZDOTDIR';
    static ZDOTDIRPath = '/zsh/zdotdir/';

    private static getShellIntegrationPath(relativePath: string): string {
        // Use __dirname which points to lib/node/ in production
        return path.join(__dirname, 'shell-integrations', relativePath);
    }

    static injectShellIntegration(options: ShellProcessOptions): ShellProcessOptions {
        const shellExecutable = options.shell ?? ShellProcess.getShellExecutablePath();
        const shellType = guessShellTypeFromExecutable(shellExecutable);
        if (shellType === GeneralShellType.Bash) {
            // strips the login flag if present to avoid conflicts with --rcfile
            return {
                ...options,
                args: [
                    this.bashFlag, this.getShellIntegrationPath(this.bashIntegrationScript)
                ],
            };
        } else if (shellType === GeneralShellType.Zsh) {
            const zdotdirPath = this.getShellIntegrationPath('zsh/zdotdir/');
            const zshDirPath = this.getShellIntegrationPath(this.ZshIntegrationPath);

            return {
                ...options,
                env: {
                    ...options.env,
                    [this.ZDOTDIR]: zdotdirPath,
                    [this.ZshIntegration]: zshDirPath,
                },
            };
        } else {
            return options;
        }
    }

}
