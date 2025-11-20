// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { RemoteWslConnectionProvider, WslDistribution, WslConnectionOptions, WslConnectionResult } from '../electron-common/remote-wsl-connection-provider';
import { RemoteConnectionService } from '@theia/remote/lib/electron-node/remote-connection-service';
import { RemoteSetupService } from '@theia/remote/lib/electron-node/setup/remote-setup-service';
import { exec } from 'child_process';
import { MessageService, generateUuid } from '@theia/core';
import { RemoteWslConnection } from './remote-wsl-connection';

@injectable()
export class RemoteWslConnectionProviderImpl implements RemoteWslConnectionProvider {

    @inject(RemoteConnectionService)
    protected readonly remoteConnectionService: RemoteConnectionService;

    @inject(RemoteSetupService)
    protected readonly remoteSetup: RemoteSetupService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    dispose(): void {
    }

    /**
     * executes `wsl.exe --list` to get the list of WSL distributions.
     * The Output format look like this:
     * ```
     *   NAME                    STATE           VERSION
     * * Ubuntu                  Stopped         2
     *   Other Distro            Stopped         2
     * ```
     * so we split the output by lines and then by whitespace. The * indicates the default distribution so this has to be handled slightly different.
     *
     * @returns a list of WslDistribution objects, each containing the name, default status, and version.
     */
    async getWslDistributions(): Promise<WslDistribution[]> {
        return new Promise<WslDistribution[]>((resolve, reject) => {
            exec('wsl.exe --list --verbose --all', (error, stdout, stderr) => {
                if (error) {
                    const errorMessage = `Error executing wsl.exe: ${error} \n ${stderr}`;
                    console.error(errorMessage);
                    reject(errorMessage);
                    return;
                }

                const lines = stdout
                    .replace(/\0/g, '')
                    .split('\n')
                    .map(line => line.replace('\r', '').trim())
                    .filter(line => line.length > 0)
                    .slice(1); // Skip header line

                resolve(lines.map(line => {
                    const parts = line.split(/\s+/);
                    const isDefault = parts[0] === '*';
                    const name = isDefault ? parts[1] : parts[0];
                    const version = isDefault ? parts[3] : parts[2];
                    return {
                        name,
                        default: isDefault,
                        version
                    };
                }));
            });
        });
    }

    async connectToWsl(options: WslConnectionOptions): Promise<WslConnectionResult> {
        const progress = await this.messageService.showProgress({
            text: 'Connecting to WSL'
        });

        try {
            const connection = new RemoteWslConnection({
                id: generateUuid(),
                name: options.distribution,
                type: 'WSL',
                distribution: options.distribution,
            });

            const report: (message: string) => void = message => progress.report({ message });
            report('Setting up remote environment...');

            await this.remoteSetup.setup({
                connection,
                report,
                nodeDownloadTemplate: options.nodeDownloadTemplate
            });

            const registration = this.remoteConnectionService.register(connection);

            connection.onDidDisconnect(() => {
                registration.dispose();
            });

            return {
                port: connection.remotePort,
            };
        } catch (e) {
            this.messageService.error(`Failed to connect to WSL: ${e.message}`);
            throw e;
        } finally {
            progress.cancel();
        }
    }
}

