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
import { injectable } from '@theia/core/shared/inversify';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { ExternalTerminalService, ExternalTerminalConfiguration } from '../common/external-terminal';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.52.1/src/vs/workbench/contrib/externalTerminal/node/externalTerminalService.ts

@injectable()
export class MacExternalTerminalService implements ExternalTerminalService {
    protected osxOpener = '/usr/bin/open';
    protected defaultTerminalApp = 'Terminal.app';

    async openTerminal(configuration: ExternalTerminalConfiguration, cwd: string): Promise<void> {
        await this.spawnTerminal(configuration, FileUri.fsPath(cwd));
    }

    async getDefaultExec(): Promise<string> {
        return this.getDefaultTerminalOSX();
    }

    /**
     * Spawn the external terminal for the given options.
     * - The method spawns the terminal application based on the preferences, else uses the default value.
     * @param configuration the preference configuration.
     * @param cwd the optional current working directory to spawn from.
     */
    protected async spawnTerminal(configuration: ExternalTerminalConfiguration, cwd?: string): Promise<void> {

        // Use the executable value from the preferences if available, else fallback to the default.
        const terminalConfig = configuration['terminal.external.osxExec'];
        const terminalApp = terminalConfig || this.getDefaultTerminalOSX();

        return new Promise<void>((resolve, reject) => {
            const args = ['-a', terminalApp];
            if (cwd) {
                args.push(cwd);
            }
            const child = cp.spawn(this.osxOpener, args);
            child.on('error', reject);
            child.on('exit', () => resolve());
        });
    }

    /**
     * Get the default terminal app on OSX.
     */
    protected getDefaultTerminalOSX(): string {
        return this.defaultTerminalApp;
    }
}
