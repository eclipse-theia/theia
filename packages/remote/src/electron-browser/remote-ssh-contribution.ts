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

import { Command, MessageService, nls, QuickInputService, QuickPickInput } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { RemoteSSHConnectionProvider } from '../electron-common/remote-ssh-connection-provider';
import { AbstractRemoteRegistryContribution, RemoteRegistry } from './remote-registry-contribution';
import { RemotePreferences } from './remote-preferences';
import SSHConfig, { Directive } from 'ssh-config';

export namespace RemoteSSHCommands {
    export const CONNECT: Command = Command.toLocalizedCommand({
        id: 'remote.ssh.connect',
        category: 'SSH',
        label: 'Connect to Host...',
    }, 'theia/remote/ssh/connect');
    export const CONNECT_CURRENT_WINDOW: Command = Command.toLocalizedCommand({
        id: 'remote.ssh.connectCurrentWindow',
        category: 'SSH',
        label: 'Connect Current Window to Host...',
    }, 'theia/remote/ssh/connect');
    export const CONNECT_CURRENT_WINDOW_TO_CONFIG_HOST: Command = Command.toLocalizedCommand({
        id: 'remote.ssh.connectToConfigHost',
        category: 'SSH',
        label: 'Connect Current Window to Host in Config File...',
    }, 'theia/remote/ssh/connectToConfigHost');
}

@injectable()
export class RemoteSSHContribution extends AbstractRemoteRegistryContribution {

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(RemoteSSHConnectionProvider)
    protected readonly sshConnectionProvider: RemoteSSHConnectionProvider;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(RemotePreferences)
    protected readonly remotePreferences: RemotePreferences;

    registerRemoteCommands(registry: RemoteRegistry): void {
        registry.registerCommand(RemoteSSHCommands.CONNECT, {
            execute: () => this.connect(true)
        });
        registry.registerCommand(RemoteSSHCommands.CONNECT_CURRENT_WINDOW, {
            execute: () => this.connect(false)
        });
        registry.registerCommand(RemoteSSHCommands.CONNECT_CURRENT_WINDOW_TO_CONFIG_HOST, {
            execute: () => this.connectToConfigHost()
        });
    }

    async getConfigFilePath(): Promise<string | undefined> {
        return this.remotePreferences['remote.ssh.configFile'];
    }

    async connectToConfigHost(): Promise<void> {
        const quickPicks: QuickPickInput[] = [];
        const sshConfig = await this.sshConnectionProvider.getSSHConfig(await this.getConfigFilePath());

        const wildcardCheck = /[\?\*\%]/;

        for (const record of sshConfig) {
            // check if its a section and if it has a single value
            if (!('config' in record) || !(typeof record.value === 'string')) {
                continue;
            }
            if (record.param.toLowerCase() === 'host' && !wildcardCheck.test(record.value)) {
                const rec: Record<string, string | string[]> = ((record.config)
                    .filter((entry): entry is Directive => entry.type === SSHConfig.DIRECTIVE))
                    .reduce(
                        (pv, item) => ({ ...pv, [item.param.toLowerCase()]: item.value }), { 'host': record.value }
                    );
                const host = (rec.hostname || rec.host) + ':' + (rec.port || '22');
                const user = rec.user || 'root';

                quickPicks.push({
                    label: <string>rec.host,
                    id: user + '@' + host
                });

            }

        }

        const selection = await this.quickInputService?.showQuickPick(quickPicks, {
            placeholder: nls.localizeByDefault('Select an option to open a Remote Window')
        });
        if (selection && selection.id) {
            try {
                let [user, host] = selection.id!.split('@', 2);
                host = selection.label;

                const remotePort = await this.sendSSHConnect(host, user);
                this.openRemote(remotePort, false);
            } catch (err) {
                this.messageService.error(`${nls.localize('theia/remote/ssh/failure', 'Could not open SSH connection to remote.')} ${err.message ?? String(err)}`);
            }
        }
    }

    async connect(newWindow: boolean): Promise<void> {
        let host: string | undefined;
        let user: string | undefined;
        host = await this.quickInputService.input({
            title: nls.localize('theia/remote/ssh/enterHost', 'Enter SSH host name'),
            placeHolder: nls.localize('theia/remote/ssh/hostPlaceHolder', 'E.g. hello@example.com')
        });
        if (!host) {
            this.messageService.error(nls.localize('theia/remote/ssh/needsHost', 'Please enter a host name.'));
            return;
        }
        if (host.includes('@')) {
            const split = host.split('@');
            user = split[0];
            host = split[1];
        }
        if (!user) {
            const configHost = await this.sshConnectionProvider.matchSSHConfigHost(host, undefined, await this.getConfigFilePath());

            if (configHost) {
                if (!user && configHost.user) {
                    user = <string>configHost.user;
                }
            }
        }
        if (!user) {
            user = await this.quickInputService.input({
                title: nls.localize('theia/remote/ssh/enterUser', 'Enter SSH user name'),
                placeHolder: nls.localize('theia/remote/ssh/userPlaceHolder', 'E.g. hello')
            });
        }
        if (!user) {
            this.messageService.error(nls.localize('theia/remote/ssh/needsUser', 'Please enter a user name.'));
            return;
        }

        try {
            const remotePort = await this.sendSSHConnect(host!, user!);
            this.openRemote(remotePort, newWindow);
        } catch (err) {
            this.messageService.error(`${nls.localize('theia/remote/ssh/failure', 'Could not open SSH connection to remote.')} ${err.message ?? String(err)}`);
        }
    }

    async sendSSHConnect(host: string, user: string): Promise<string> {
        return this.sshConnectionProvider.establishConnection({
            host,
            user,
            nodeDownloadTemplate: this.remotePreferences['remote.nodeDownloadTemplate'],
            customConfigFile: await this.getConfigFilePath()
        });
    }
}
