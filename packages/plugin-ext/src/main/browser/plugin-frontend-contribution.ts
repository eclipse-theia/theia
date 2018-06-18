/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { CommandRegistry, CommandContribution } from '@theia/core/lib/common';
import { HostedPluginManagerClient, HostedPluginCommands } from './plugin-manager-client';
import { PluginExtDeployCommandService } from './plugin-ext-deploy-command';

@injectable()
export class PluginApiFrontendContribution implements CommandContribution {

    @inject(HostedPluginManagerClient)
    protected readonly hostedPluginManagerClient: HostedPluginManagerClient;

    @inject(PluginExtDeployCommandService)
    protected readonly pluginExtDeployCommandService: PluginExtDeployCommandService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(HostedPluginCommands.START, {
            execute: () => this.hostedPluginManagerClient.start()
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

        commands.registerCommand(PluginExtDeployCommandService.COMMAND, {
            execute: () => this.pluginExtDeployCommandService.deploy()
        });

        // this command only for compatibility reason
        commands.registerCommand({ id: 'workbench.action.closeActiveEditor' }, {
            execute: () => commands.executeCommand('core.close.tab')
        });
    }

}
