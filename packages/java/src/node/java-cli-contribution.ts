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
import { Argv, Arguments } from 'yargs';
import { CliContribution } from '@theia/core/lib/node/cli';

@injectable()
export class JavaCliContribution implements CliContribution {

    private static LS_PORT = 'java-ls';

    protected _lsPort: number | undefined;

    configure(conf: Argv): void {
        conf.option(JavaCliContribution.LS_PORT, {
            description: 'Can be specified if the backend should not start the Java LS process but create a socket server and wait until the Java LS connects.',
            type: 'number',
            nargs: 1
        });
    }

    setArguments(args: Arguments): void {
        this.setLsPort(args[JavaCliContribution.LS_PORT]);
    }

    lsPort(): number | undefined {
        return this._lsPort;
    }

    // tslint:disable-next-line:no-any
    protected setLsPort(port: any): void {
        if (port !== undefined) {
            const error = new Error(`The port for the Java LS must be an integer between 1 and 65535. It was: ${port}.`);
            if (!Number.isInteger(port)) {
                throw error;
            }
            if (port < 1 || port > 65535) {
                throw error;
            }
            this._lsPort = port;
        }
    }

}
