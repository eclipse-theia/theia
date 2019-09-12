/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
import { BaseLanguageServerContribution, IConnection } from '@theia/languages/lib/node';
import { environment } from '@theia/application-package';
import { JSON_LANGUAGE_ID, JSON_LANGUAGE_NAME } from '../common';
import * as path from 'path';

@injectable()
export class JsonContribution extends BaseLanguageServerContribution {

    readonly id = JSON_LANGUAGE_ID;
    readonly name = JSON_LANGUAGE_NAME;

    async start(clientConnection: IConnection): Promise<void> {
        // Same as https://github.com/eclipse-theia/theia/commit/de45794a90fc1a1a590578026f8ad527127afa0a
        const command = process.execPath;
        const args: string[] = [
            path.resolve(__dirname, './json-starter'),
            '--stdio'
        ];
        const serverConnection = await this.createProcessStreamConnectionAsync(command, args, { env: environment.electron.runAsNodeEnv() });
        this.forward(clientConnection, serverConnection);
    }

}
