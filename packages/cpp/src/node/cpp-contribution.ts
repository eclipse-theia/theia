/********************************************************************************
 * Copyright (C) 2017-2019 Ericsson and others.
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

import { injectable } from 'inversify';
import { BaseLanguageServerContribution, IConnection, LanguageServerStartOptions } from '@theia/languages/lib/node';
import { parseArgs } from '@theia/process/lib/node/utils';
import { CPP_LANGUAGE_ID, CPP_LANGUAGE_NAME, CLANGD_EXECUTABLE_DEFAULT, CppStartParameters } from '../common';

export interface CppStartOptions extends LanguageServerStartOptions {
    parameters?: CppStartParameters
}

@injectable()
export class CppContribution extends BaseLanguageServerContribution {

    readonly id = CPP_LANGUAGE_ID;
    readonly name = CPP_LANGUAGE_NAME;

    async start(clientConnection: IConnection, { parameters }: CppStartOptions): Promise<void> {

        const command =
            process.env.CPP_CLANGD_COMMAND
            || (parameters && parameters.clangdExecutable)
            || CLANGD_EXECUTABLE_DEFAULT;

        const args = parseArgs(
            process.env.CPP_CLANGD_ARGS
            || (parameters && parameters.clangdArgs)
            || undefined
        );

        const clangTidy = parameters && parameters.clangTidy;
        const clangTidyChecks = parameters && parameters.clangTidyChecks;

        if (clangTidy) {
            const supportsClangTidy = await this.testSupportsClangTidy(command);
            if (supportsClangTidy) {
                args.push('-clang-tidy');
                if (typeof clangTidyChecks === 'string' && clangTidyChecks.length > 0) {
                    args.push(`-clang-tidy-checks=${clangTidyChecks}`);
                }
            }
        }
        const serverConnection = await this.createProcessStreamConnectionAsync(command, args);
        this.forward(clientConnection, serverConnection);
    }

    protected async testSupportsClangTidy(command: string): Promise<boolean> {
        // clangd should fail if -clang-tidy flag is not supported
        // but if it is supported, it will run forever until killed/stopped.
        // to avoid that, we pass -version flag which makes it exit early.
        const process = await super.spawnProcessAsync(command, ['-clang-tidy', '-version']);
        return new Promise<boolean>(resolve => {
            process.errorOutput.on('data', (data: string) => {
                if (data.includes('-clang-tidy')) {
                    resolve(false);
                }
            });
            process.errorOutput.once('close', () => resolve(true));
        });
    }
}
