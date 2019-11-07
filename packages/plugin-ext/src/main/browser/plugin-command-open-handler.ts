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
import URI from '@theia/core/lib/common/uri';
import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import { Schemes } from '../../common/uri-components';
import { CommandService } from '@theia/core/lib/common/command';

@injectable()
export class PluginCommandOpenHandler implements OpenHandler {

    readonly id = 'plugin-command';

    @inject(CommandService)
    protected readonly commands: CommandService;

    canHandle(uri: URI): number {
        return uri.scheme === Schemes.COMMAND ? 500 : -1;
    }

    async open(uri: URI): Promise<boolean> {
        // tslint:disable-next-line:no-any
        let args: any = [];
        try {
            args = JSON.parse(uri.query);
            if (!Array.isArray(args)) {
                args = [args];
            }
        } catch (e) {
            // ignore error
        }
        await this.commands.executeCommand(uri.path.toString(), ...args);
        return true;
    }

}
