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

import { injectable } from 'inversify';
import { BaseLanguageServerContribution, IConnection, LanguageContribution } from '@theia/languages/lib/node';
import { PYTHON_LANGUAGE_ID, PYTHON_LANGUAGE_NAME } from '../common';
import { parseArgs } from '@theia/process/lib/node/utils';
import { SpawnOptions } from 'child_process';
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';
import * as path from 'path';

@injectable()
export class PythonContribution extends BaseLanguageServerContribution {

    readonly id = PYTHON_LANGUAGE_ID;
    readonly name = PYTHON_LANGUAGE_NAME;

    start(params: MessagingService.PathParams, clientConnection: IConnection): void {
        const virtualenv: string | undefined = 'virtualenv' in params ? params['virtualenv'] :  undefined;
        let command = 'python';
        if (virtualenv && virtualenv !== 'calisse') {
            command = path.join(params['virtualenv'], 'bin', 'python');
        }

        let args = ['-m', 'pyls'];
        const pythonLsCommand = process.env.PYTHON_LS_COMMAND;
        if (pythonLsCommand) {
            command = pythonLsCommand;
            args = parseArgs(process.env.PYTHON_LS_ARGS || '');
        }

        const opts = this.getSpawnOptions() || {};
        if (virtualenv && virtualenv !== 'calisse') {
            opts.env = opts.env || {...process.env};
            opts.env.VIRTUAL_ENV = params['virtualenv'];
        }
        const serverConnection = this.createProcessStreamConnection(command, args, opts);
        this.forward(clientConnection, serverConnection);
    }

    getServicePath(): string {
        let servicePath = LanguageContribution.getPath(this);
        servicePath += '?virtualenv=:virtualenv';
        return servicePath;
    }

    protected getSpawnOptions(): SpawnOptions | undefined {
        return undefined;
    }

    protected onDidFailSpawnProcess(error: Error): void {
        super.onDidFailSpawnProcess(error);
        console.error('Python language server cannot be started.');
        console.error("Make sure `pyls` is installed: e.g. `pip install 'python-language-server[all]'`");
    }

}
