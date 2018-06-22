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

import { injectable } from "inversify";
import { BaseLanguageServerContribution, IConnection } from "@theia/languages/lib/node";
import { parseArgs } from '@theia/process/lib/node/utils';
import { CPP_LANGUAGE_ID, CPP_LANGUAGE_NAME } from '../common';

export const CLANGD_COMMAND_DEFAULT = 'clangd';

@injectable()
export class CppContribution extends BaseLanguageServerContribution {

    readonly id = CPP_LANGUAGE_ID;
    readonly name = CPP_LANGUAGE_NAME;

    public start(clientConnection: IConnection): void {
        const envCommand = process.env.CPP_CLANGD_COMMAND;
        const command = envCommand ? envCommand : CLANGD_COMMAND_DEFAULT;

        const envArgs = process.env.CPP_CLANGD_ARGS;
        let args: string[] = [];
        if (envArgs) {
            args = parseArgs(envArgs);
        }

        const serverConnection = this.createProcessStreamConnection(command, args);
        this.forward(clientConnection, serverConnection);
    }
}
