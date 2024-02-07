// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Command, CommandContribution, CommandRegistry, ContributionProvider, nls, QuickInputService, QuickPickInput } from '@theia/core';
import { FrontendApplicationContribution, StatusBar, StatusBarAlignment, StatusBarEntry } from '@theia/core/lib/browser';
import { inject, injectable, named, optional } from '@theia/core/shared/inversify';
import { RemoteStatus, RemoteStatusService } from '../electron-common/remote-status-service';
import { RemoteRegistry, RemoteRegistryContribution } from './remote-registry-contribution';
import { RemoteService } from './remote-service';
import { WindowService } from '@theia/core/lib/browser/window/window-service';

export namespace RemoteCommands {
    export const REMOTE_SELECT: Command = {
        id: 'remote.select'
    };
    export const REMOTE_DISCONNECT: Command = Command.toDefaultLocalizedCommand({
        id: 'remote.disconnect',
        label: 'Close Remote Connection',
    });
}

@injectable()
export class RemoteFrontendContribution implements CommandContribution, FrontendApplicationContribution {

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(QuickInputService) @optional()
    protected readonly quickInputService?: QuickInputService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(RemoteService)
    protected readonly remoteService: RemoteService;

    @inject(RemoteStatusService)
    protected readonly remoteStatusService: RemoteStatusService;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(ContributionProvider) @named(RemoteRegistryContribution)
    protected readonly remoteRegistryContributions: ContributionProvider<RemoteRegistryContribution>;

    protected remoteRegistry = new RemoteRegistry();

    async configure(): Promise<void> {
        const port = new URLSearchParams(location.search).get('port');
        if (port) {
            const status = await this.remoteStatusService.getStatus(Number(port));
            await this.setStatusBar(status);
        } else {
            await this.setStatusBar({
                alive: false
            });
        }
    }

    protected async setStatusBar(info: RemoteStatus): Promise<void> {
        this.remoteService.setConnected(info.alive);
        const entry: StatusBarEntry = {
            alignment: StatusBarAlignment.LEFT,
            command: RemoteCommands.REMOTE_SELECT.id,
            backgroundColor: 'var(--theia-statusBarItem-remoteBackground)',
            color: 'var(--theia-statusBarItem-remoteForeground)',
            priority: 10000,
            ...(info.alive
                ? {
                    text: `$(codicon-remote) ${info.type}: ${info.name.length > 35 ? info.name.substring(0, 32) + '...' : info.name}`,
                    tooltip: nls.localizeByDefault('Editing on {0}', info.name),
                } : {
                    text: '$(codicon-remote)',
                    tooltip: nls.localizeByDefault('Open a Remote Window'),
                })
        };
        this.statusBar.setElement('remoteStatus', entry);
    }

    registerCommands(commands: CommandRegistry): void {
        this.remoteRegistry.onDidRegisterCommand(([command, handler]) => {
            commands.registerCommand(command, handler);
        });
        for (const contribution of this.remoteRegistryContributions.getContributions()) {
            contribution.registerRemoteCommands(this.remoteRegistry);
        }
        commands.registerCommand(RemoteCommands.REMOTE_SELECT, {
            execute: () => this.selectRemote()
        });
        commands.registerCommand(RemoteCommands.REMOTE_DISCONNECT, {
            execute: () => this.disconnectRemote()
        });
    }

    protected disconnectRemote(): void {
        const port = new URLSearchParams(location.search).get('localPort');
        if (port) {
            this.windowService.reload({ search: { port } });
        }
    }

    protected async selectRemote(): Promise<void> {
        const commands = [...this.remoteRegistry.commands];
        if (this.remoteService.isConnected()) {
            commands.push(RemoteCommands.REMOTE_DISCONNECT);
        }
        const quickPicks: QuickPickInput[] = [];
        let previousCategory: string | undefined = undefined;
        for (const command of commands) {
            if (previousCategory !== command.category) {
                quickPicks.push({
                    type: 'separator',
                    label: command.category
                });
                previousCategory = command.category;
            }
            quickPicks.push({
                label: command.label!,
                id: command.id
            });
        }
        const selection = await this.quickInputService?.showQuickPick(quickPicks, {
            placeholder: nls.localizeByDefault('Select an option to open a Remote Window')
        });
        if (selection) {
            this.commandRegistry.executeCommand(selection.id!);
        }
    }

}
