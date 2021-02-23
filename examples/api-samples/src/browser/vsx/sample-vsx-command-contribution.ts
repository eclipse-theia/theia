/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { VSXEnvironment } from '@theia/vsx-registry/lib/common/vsx-environment';
import { Command, CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';

@injectable()
export class VSXCommandContribution implements CommandContribution {

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(VSXEnvironment)
    protected readonly environment: VSXEnvironment;

    protected readonly command: Command = {
        id: 'vsx.echo-api-version',
        label: 'VS Code API Version'
    };

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(this.command, {
            execute: async () => {
                const version = await this.environment.getVscodeApiVersion();
                this.messageService.info(`Supported VS Code API Version: ${version}`);
            }
        });
    }

}

export const bindVSXCommand = (bind: interfaces.Bind) => {
    bind(CommandContribution).to(VSXCommandContribution).inSingletonScope();
};
