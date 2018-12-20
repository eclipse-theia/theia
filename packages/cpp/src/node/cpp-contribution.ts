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

    public start(clientConnection: IConnection, { parameters }: CppStartOptions): void {

        const command =
            (parameters && parameters.clangdExecutable)
            || process.env.CPP_CLANGD_COMMAND
            || CLANGD_EXECUTABLE_DEFAULT;

        const args = parseArgs(
            (parameters && parameters.clangdArgs)
            || process.env.CPP_CLANGD_ARGS
            || undefined
        );

        const serverConnection = this.createProcessStreamConnection(command, args);
        this.forward(clientConnection, serverConnection);
    }
}
