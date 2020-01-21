/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { CommandService } from '../common/command';
import URI from '../common/uri';
import { OpenHandler } from './opener-service';

@injectable()
export class CommandOpenHandler implements OpenHandler {

    readonly id = 'command';

    @inject(CommandService)
    protected readonly commands: CommandService;

    canHandle(uri: URI): number {
        return uri.scheme === 'command' ? 500 : -1;
    }

    async open(uri: URI): Promise<boolean> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let args: any = [];
        try {
            args = JSON.parse(decodeURIComponent(uri.query));
        } catch {
            // ignore and retry
            try {
                args = JSON.parse(uri.query);
            } catch {
                // ignore error
            }
        }
        if (!Array.isArray(args)) {
            args = [args];
        }
        await this.commands.executeCommand(uri.path.toString(), ...args);
        return true;
    }

}
