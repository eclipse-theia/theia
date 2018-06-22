/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import { PYTHON_LANGUAGE_ID, PYTHON_LANGUAGE_NAME } from '../common';

/**
 * IF you have python on your machine, `pyls` can be installed with the following command:
 * `pip install `
 */
@injectable()
export class PythonContribution extends BaseLanguageServerContribution {

    readonly id = PYTHON_LANGUAGE_ID;
    readonly name = PYTHON_LANGUAGE_NAME;

    start(clientConnection: IConnection): void {
        const command = 'pyls';
        const args: string[] = [
        ];
        const serverConnection = this.createProcessStreamConnection(command, args);
        this.forward(clientConnection, serverConnection);
    }

    protected onDidFailSpawnProcess(error: Error): void {
        super.onDidFailSpawnProcess(error);
        console.error("Error starting python language server.");
        console.error("Please make sure it is installed on your system.");
        console.error("Use the following command: 'pip install python-language-server'");
    }

}
