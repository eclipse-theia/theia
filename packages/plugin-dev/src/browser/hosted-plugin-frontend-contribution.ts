/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { CommandRegistry, CommandContribution } from '@theia/core/lib/common';
import { HostedPluginManagerClient, HostedPluginCommands } from './hosted-plugin-manager-client';

@injectable()
export class HostedPluginFrontendContribution implements CommandContribution {

    @inject(HostedPluginManagerClient)
    protected readonly hostedPluginManagerClient: HostedPluginManagerClient;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(HostedPluginCommands.START, {
            execute: () => this.hostedPluginManagerClient.start()
        });
        commands.registerCommand(HostedPluginCommands.DEBUG, {
            execute: () => this.hostedPluginManagerClient.debug()
        });
        commands.registerCommand(HostedPluginCommands.STOP, {
            execute: () => this.hostedPluginManagerClient.stop()
        });
        commands.registerCommand(HostedPluginCommands.RESTART, {
            execute: () => this.hostedPluginManagerClient.restart()
        });
        commands.registerCommand(HostedPluginCommands.SELECT_PATH, {
            execute: () => this.hostedPluginManagerClient.selectPluginPath()
        });

    }
}
